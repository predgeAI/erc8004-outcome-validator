// Predge dispute-note settlement: a Chainlink CRE workflow.
//
// Trigger (cron, or HTTP with {"condition_id": "0x..."}):
//   1. EVM read, Monad testnet: DisputeNoteFactory.noteCount / notes(i) -> the conditions that
//      still have an OPEN note and no resolution yet. (HTTP trigger: just the given condition.)
//   2. EVM read, Polygon mainnet, at one finalized block: CTF.getOutcomeSlotCount,
//      payoutDenominator, payoutNumerators(0), payoutNumerators(1). Every DON node reads; the
//      capability returns the value the nodes agree on.
//   3. Decide (logic.ts): unresolved -> nothing is written. Resolved -> DON-signed report
//      abi.encode(conditionId, payout0, payout1, payoutDenominator, polygonBlock).
//   4. EVM write, Monad testnet: report -> CRE forwarder -> DisputeNoteFactory.onReport, which
//      settles every note on that condition (HOLD if the payout vector equals the disputed
//      proposal, CHANGE otherwise).
//
// No Predge API, signature or verdict is involved anywhere in settlement.

import {
	bytesToBigint,
	bytesToHex,
	blockNumber,
	cre,
	type CronPayload,
	decodeJson,
	encodeCallMsg,
	getNetwork,
	type HTTPPayload,
	LAST_FINALIZED_BLOCK_NUMBER,
	prepareReportRequest,
	type Runtime,
	TxStatus,
} from '@chainlink/cre-sdk'
import { type Address, decodeFunctionResult, encodeFunctionData, type Hex, parseAbi, zeroAddress } from 'viem'
import { z } from 'zod'
import { type CtfRead, type Decision, decide, encodeReport } from './logic'

export const configSchema = z.object({
	schedule: z.string(),
	polygon: z.object({
		chainSelectorName: z.string(), // "polygon-mainnet"
		ctf: z.string(), // Gnosis Conditional Tokens on Polygon, 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045
	}),
	notes: z.object({
		chainSelectorName: z.string(), // "monad-testnet"
		factory: z.string(), // DisputeNoteFactory; also the report receiver
		gasLimit: z.string(),
		write: z.boolean(), // false = read and decide only
	}),
})
export type Config = z.infer<typeof configSchema>

export const CTF_ABI = parseAbi([
	'function getOutcomeSlotCount(bytes32) view returns (uint256)',
	'function payoutDenominator(bytes32) view returns (uint256)',
	'function payoutNumerators(bytes32, uint256) view returns (uint256)',
])
export const FACTORY_ABI = parseAbi([
	'function noteCount() view returns (uint256)',
	'function notes(uint256) view returns ((bytes32 conditionId, uint256 proposal0, uint256 proposal1, bytes32 disputeTx, uint64 expiry, uint8 state, address hold, address change, uint256 collateralLocked, string marketId))',
	'function resolutions(bytes32) view returns (uint256 payout0, uint256 payout1, uint256 denominator, uint64 polygonBlock, uint64 reportedAt)',
])

const evmClient = (chainSelectorName: string) => {
	const network =
		getNetwork({ chainFamily: 'evm', chainSelectorName, isTestnet: false }) ??
		getNetwork({ chainFamily: 'evm', chainSelectorName, isTestnet: true })
	if (!network) throw new Error(`unknown chain ${chainSelectorName}`)
	return new cre.capabilities.EVMClient(network.chainSelector.selector)
}

type BlockRef = typeof LAST_FINALIZED_BLOCK_NUMBER | ReturnType<typeof blockNumber>

function call<T>(runtime: Runtime<Config>, chain: string, to: string, abi: typeof CTF_ABI | typeof FACTORY_ABI, functionName: string, args: unknown[], block: BlockRef): T {
	const data = encodeFunctionData({ abi, functionName, args } as never)
	const res = evmClient(chain)
		.callContract(runtime, { call: encodeCallMsg({ from: zeroAddress, to: to as Address, data }), blockNumber: block })
		.result()
	return decodeFunctionResult({ abi, functionName, data: bytesToHex(res.data) } as never) as T
}

// Step 1: conditions with an open, unsettled note.
export function openConditions(runtime: Runtime<Config>): Hex[] {
	const { chainSelectorName, factory } = runtime.config.notes
	const count = call<bigint>(runtime, chainSelectorName, factory, FACTORY_ABI, 'noteCount', [], LAST_FINALIZED_BLOCK_NUMBER)
	const out = new Set<Hex>()
	for (let i = 0n; i < count; i++) {
		const n = call<{ conditionId: Hex; state: number }>(runtime, chainSelectorName, factory, FACTORY_ABI, 'notes', [i], LAST_FINALIZED_BLOCK_NUMBER)
		if (n.state === 0) out.add(n.conditionId)
	}
	return [...out]
}

// Step 2: read the CTF on Polygon, all four values at the same finalized block.
export function readCtf(runtime: Runtime<Config>, conditionId: Hex): CtfRead {
	const { chainSelectorName, ctf } = runtime.config.polygon
	const header = evmClient(chainSelectorName).headerByNumber(runtime, { blockNumber: LAST_FINALIZED_BLOCK_NUMBER }).result()
	const polygonBlock = bytesToBigint(header.header!.blockNumber!.absVal)
	const at = blockNumber(polygonBlock)
	const r = (fn: string, args: unknown[]) => call<bigint>(runtime, chainSelectorName, ctf, CTF_ABI, fn, args, at)
	return {
		conditionId,
		polygonBlock,
		slots: r('getOutcomeSlotCount', [conditionId]),
		denominator: r('payoutDenominator', [conditionId]),
		payout0: r('payoutNumerators', [conditionId, 0n]),
		payout1: r('payoutNumerators', [conditionId, 1n]),
	}
}

// Steps 2-4 for one condition.
export function settleCondition(runtime: Runtime<Config>, conditionId: Hex): Decision & { tx?: string } {
	const read = readCtf(runtime, conditionId)
	const d = decide(read)
	runtime.log(
		`[${conditionId}] Polygon CTF @${read.polygonBlock}: slots=${read.slots} denominator=${read.denominator} payouts=[${read.payout0},${read.payout1}] -> ${d.status}`,
	)
	if (d.status !== 'resolved') return d
	const cfg = runtime.config.notes
	if (!cfg.write) {
		runtime.log(`[${conditionId}] write disabled: report not sent`)
		return d
	}
	const report = runtime.report(prepareReportRequest(encodeReport(d))).result()
	const w = evmClient(cfg.chainSelectorName).writeReport(runtime, { receiver: cfg.factory, report, gasConfig: { gasLimit: cfg.gasLimit } }).result()
	if (w.txStatus !== TxStatus.SUCCESS) throw new Error(`writeReport failed: ${w.errorMessage || w.txStatus}`)
	const tx = bytesToHex(w.txHash || new Uint8Array(32))
	runtime.log(`[${conditionId}] settlement report written to ${cfg.factory}, tx ${tx}`)
	return { ...d, tx }
}

const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x))

export const onCron = (runtime: Runtime<Config>, _p: CronPayload): string => {
	const conds = openConditions(runtime)
	runtime.log(`open conditions on the factory: ${conds.length}`)
	return json(conds.map((c) => settleCondition(runtime, c)))
}

const httpInput = z.object({ condition_id: z.string().regex(/^0x[0-9a-fA-F]{64}$/) })

export const onHttp = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
	if (!payload.input || payload.input.length === 0) throw new Error('HTTP trigger needs {"condition_id": "0x..."}')
	const { condition_id } = httpInput.parse(decodeJson(payload.input))
	return json(settleCondition(runtime, condition_id as Hex))
}

export function initWorkflow(config: Config) {
	const cron = new cre.capabilities.CronCapability()
	const http = new cre.capabilities.HTTPCapability()
	return [cre.handler(cron.trigger({ schedule: config.schedule }), onCron), cre.handler(http.trigger({}), onHttp)]
}
