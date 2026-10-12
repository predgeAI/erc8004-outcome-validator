// Predge settlement watch: a Chainlink CRE workflow.
//
// Trigger (cron, or HTTP with {"market_id": "..."}):
//   1. HTTP, node mode: every DON node fetches Predge's signed Settlement Risk record for the market
//      from https://api.predge.io/v1/settlement-risk/<market_id>, verifies the ed25519 signature
//      against the pinned Predge key and recomputes sha256(canonical) == content_hash, then reports
//      the signed facts. The nodes reach consensus field by field (identical on every field).
//   2. EVM read, Monad testnet: PredgeAgentValidator.getValidationStatus(requestHash), where
//      requestHash is derived from the signed record exactly as monad/batch/run-batch.mjs does.
//   3. Decide: does the on-chain verdict agree with what the signed record implies?
//   4. EVM write (optional): a DON-signed report with the result, delivered through the CRE
//      forwarder to PredgeSettlementWatch on Monad testnet. Skipped when no receiver is configured.

import {
	bytesToHex,
	ConsensusAggregationByFields,
	cre,
	type CronPayload,
	decodeJson,
	encodeCallMsg,
	getNetwork,
	type HTTPPayload,
	type HTTPSendRequester,
	identical,
	json,
	LAST_FINALIZED_BLOCK_NUMBER,
	ok,
	prepareReportRequest,
	type Runtime,
	TxStatus,
} from '@chainlink/cre-sdk'
import { type Address, decodeFunctionResult, encodeAbiParameters, encodeFunctionData, parseAbi, parseAbiParameters, zeroAddress } from 'viem'
import { z } from 'zod'
import {
	type Attestation,
	decide,
	type Observation,
	observe,
	type OnchainStatus,
	STATUS_CODE,
	verifyAttestation,
	type WatchResult,
} from './logic'

// ─── Config ────────────────────────────────────────────────────────────────────────────────────
export const configSchema = z.object({
	schedule: z.string(),
	apiBase: z.string().regex(/^https:\/\/[^\s/]+$/), // no URL global in the WASM runtime, so no .url()
	marketIds: z.array(z.string().regex(/^\d+$/)).min(1), // the cron trigger watches these
	predgePublicKey: z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/), // pinned ed25519 key of predge.io
	read: z.object({
		chainSelectorName: z.string(), // "monad-testnet"
		validatorContract: z.string(), // PredgeAgentValidator
		trustedValidator: z.string(), // the address allowed to answer (deployment.json "validator")
	}),
	write: z.object({
		chainSelectorName: z.string(),
		receiverAddress: z.string(), // PredgeSettlementWatch; zero address = do not write
		gasLimit: z.string(),
	}),
})
export type Config = z.infer<typeof configSchema>

const VALIDATOR_ABI = parseAbi([
	'function getValidationStatus(bytes32) view returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string tag, uint256 lastUpdate)',
])

// Report consumed by PredgeSettlementWatch._processReport. 255 = "none" for the verdict fields.
export const REPORT_PARAMS = parseAbiParameters(
	'string marketId, bytes32 requestHash, string riskLevel, bool openDispute, uint8 onchainVerdict, uint8 expectedVerdict, uint8 status, bytes32 contentHash',
)

const u8 = (v: number) => (v < 0 ? 255 : v)
const ZERO32 = `0x${'00'.repeat(32)}` as const

export function encodeReport(r: WatchResult): `0x${string}` {
	return encodeAbiParameters(REPORT_PARAMS, [
		r.market_id,
		(r.request_hash || ZERO32) as `0x${string}`,
		r.risk_level,
		r.open_dispute,
		u8(r.onchain_verdict),
		u8(r.expected_verdict),
		STATUS_CODE[r.status],
		r.content_hash as `0x${string}`,
	])
}

// ─── Step 1: fetch + verify (runs on every node) ───────────────────────────────────────────────
export const fetchAndVerify = (sendRequester: HTTPSendRequester, config: Config, marketId: string): Observation => {
	const resp = sendRequester
		.sendRequest({
			url: `${config.apiBase}/v1/settlement-risk/${marketId}`,
			method: 'GET',
			// One node fetches, the others reuse the cached response, so all nodes verify the same
			// signed bytes (Predge re-signs on every request, with a new issued_at).
			cacheSettings: { store: true, maxAge: '60s' },
		})
		.result()
	if (!ok(resp)) throw new Error(`settlement-risk ${marketId}: HTTP ${resp.statusCode}`)
	const body = json(resp) as { attestation?: Attestation }
	if (!body.attestation) throw new Error(`settlement-risk ${marketId}: no attestation in response`)
	const rec = verifyAttestation(body.attestation, config.predgePublicKey, marketId)
	return observe(rec)
}

const observationConsensus = ConsensusAggregationByFields<Observation>({
	market_id: identical,
	risk_level: identical,
	open_dispute: identical,
	resolved_on_chain: identical,
	outcome: identical,
	proposal: identical,
	expected_verdict: identical,
	request_hash: identical,
	content_hash: identical,
})

// ─── Step 2: on-chain verdict ──────────────────────────────────────────────────────────────────
const evmClientFor = (chainSelectorName: string) => {
	const network = getNetwork({ chainFamily: 'evm', chainSelectorName, isTestnet: true })
	if (!network) throw new Error(`unknown chain ${chainSelectorName}`)
	return new cre.capabilities.EVMClient(network.chainSelector.selector)
}

export function readOnchainVerdict(runtime: Runtime<Config>, requestHash: `0x${string}`): OnchainStatus {
	const { chainSelectorName, validatorContract } = runtime.config.read
	const data = encodeFunctionData({ abi: VALIDATOR_ABI, functionName: 'getValidationStatus', args: [requestHash] })
	const res = evmClientFor(chainSelectorName)
		.callContract(runtime, {
			call: encodeCallMsg({ from: zeroAddress, to: validatorContract as Address, data }),
			blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
		})
		.result()
	const [validatorAddress, , response, responseHash, tag, lastUpdate] = decodeFunctionResult({
		abi: VALIDATOR_ABI,
		functionName: 'getValidationStatus',
		data: bytesToHex(res.data),
	})
	return { validatorAddress, response: Number(response), responseHash, tag, lastUpdate }
}

// ─── Steps 1-4 for one market ──────────────────────────────────────────────────────────────────
export function watchMarket(runtime: Runtime<Config>, marketId: string): WatchResult {
	const cfg = runtime.config
	const http = new cre.capabilities.HTTPClient()
	const obs = http.sendRequest(runtime, fetchAndVerify, observationConsensus)(cfg, marketId).result()
	runtime.log(
		`[${marketId}] signed record verified (ed25519 + sha256), consensus reached: risk_level=${obs.risk_level} open_dispute=${obs.open_dispute} outcome=${obs.outcome || '-'} proposal=${obs.proposal || '-'} content_hash=${obs.content_hash}`,
	)

	const status = obs.request_hash ? readOnchainVerdict(runtime, obs.request_hash as `0x${string}`) : null
	if (status) {
		runtime.log(
			`[${marketId}] Monad testnet getValidationStatus(${obs.request_hash}): validator=${status.validatorAddress} response=${status.response} tag=${status.tag} lastUpdate=${status.lastUpdate}`,
		)
	} else {
		runtime.log(`[${marketId}] record has no disputed proposal, so no requestHash to look up`)
	}

	const result = decide(obs, status, cfg.read.trustedValidator)
	runtime.log(`[${marketId}] result ${JSON.stringify(result)}`)

	const receiver = cfg.write.receiverAddress
	if (!receiver || /^0x0{40}$/i.test(receiver)) {
		runtime.log(`[${marketId}] no receiver configured: report not written on chain`)
		return result
	}
	const report = runtime.report(prepareReportRequest(encodeReport(result))).result()
	const w = evmClientFor(cfg.write.chainSelectorName)
		.writeReport(runtime, { receiver, report, gasConfig: { gasLimit: cfg.write.gasLimit } })
		.result()
	if (w.txStatus !== TxStatus.SUCCESS) throw new Error(`writeReport failed: ${w.errorMessage || w.txStatus}`)
	runtime.log(`[${marketId}] report written to ${receiver} on ${cfg.write.chainSelectorName}, tx ${bytesToHex(w.txHash || new Uint8Array(32))}`)
	return result
}

// ─── Triggers ──────────────────────────────────────────────────────────────────────────────────
export const onCron = (runtime: Runtime<Config>, _payload: CronPayload): string => {
	const results = runtime.config.marketIds.map((id) => watchMarket(runtime, id))
	return JSON.stringify(results)
}

const httpInput = z.object({ market_id: z.string().regex(/^\d+$/) })

export const onHttp = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
	if (!payload.input || payload.input.length === 0) throw new Error('HTTP trigger needs {"market_id": "..."}')
	const { market_id } = httpInput.parse(decodeJson(payload.input))
	return JSON.stringify(watchMarket(runtime, market_id))
}

export function initWorkflow(config: Config) {
	const cron = new cre.capabilities.CronCapability()
	const http = new cre.capabilities.HTTPCapability()
	return [cre.handler(cron.trigger({ schedule: config.schedule }), onCron), cre.handler(http.trigger({}), onHttp)]
}
