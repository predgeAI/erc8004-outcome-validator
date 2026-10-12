import { describe, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { getNetwork, TxStatus } from '@chainlink/cre-sdk'
import { EvmMock, HttpActionsMock, newTestRuntime, test } from '@chainlink/cre-sdk/test'
import { decodeAbiParameters, decodeFunctionData, encodeFunctionResult, hexToBytes, parseAbi, bytesToHex } from 'viem'
import { type Config, initWorkflow, onHttp, REPORT_PARAMS, watchMarket } from './workflow'

const here = (p: string) => path.join(import.meta.dir, p)
const staging = JSON.parse(readFileSync(here('config.staging.json'), 'utf8')) as Config
// tests start with no receiver; the write path sets one explicitly
const config = { ...staging, write: { ...staging.write, receiverAddress: '0x0000000000000000000000000000000000000000' } } as Config
const fixture = (m: string) => readFileSync(here(`fixtures/settlement-risk-${m}.json`))
const results = JSON.parse(readFileSync(here('../../monad/batch/results-2026-10-07T11-39-11-867Z.json'), 'utf8'))
const row = (m: string) => results.verdicts.find((v: { market_id: string }) => v.market_id === m)
const MONAD = getNetwork({ chainFamily: 'evm', chainSelectorName: 'monad-testnet', isTestnet: true })!.chainSelector.selector
const ABI = parseAbi([
	'function getValidationStatus(bytes32) view returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string tag, uint256 lastUpdate)',
])

// Serve the recorded API response and an on-chain status built from the batch results file.
function mockChainAndApi(opts: { onchain?: 'batch' | 'none' | 'flipped' } = {}) {
	const http = HttpActionsMock.testInstance()
	const urls: string[] = []
	http.sendRequest = (req) => {
		urls.push(req.url)
		const m = req.url.split('/').pop()!
		return { statusCode: 200, body: fixture(m), headers: {} }
	}
	const evm = EvmMock.testInstance(MONAD)
	evm.callContract = (req) => {
		const { args } = decodeFunctionData({ abi: ABI, data: bytesToHex(req.call!.data) })
		const r = results.verdicts.find((v: { requestHash: string }) => v.requestHash === args[0])
		const answered = r && opts.onchain !== 'none'
		const score = !answered ? 0 : opts.onchain === 'flipped' ? 100 - r.score : r.score
		const data = encodeFunctionResult({
			abi: ABI,
			functionName: 'getValidationStatus',
			result: answered
				? [config.read.trustedValidator as `0x${string}`, 0n, score, r.responseHash, 'predge:settlement-risk-v1', 1759837000n]
				: ['0x0000000000000000000000000000000000000000', 0n, 0, `0x${'00'.repeat(32)}`, '', 0n],
		})
		return { data: hexToBytes(data) }
	}
	const writes: Uint8Array[] = []
	evm.writeReport = (req) => {
		writes.push(req.report!.rawReport)
		return { txStatus: TxStatus.SUCCESS, txHash: new Uint8Array(32) }
	}
	return { urls, writes }
}

const runtimeWith = (cfg: Config) => {
	const rt = newTestRuntime<Config>()
	;(rt as unknown as { config: Config }).config = cfg
	return rt
}

describe('watchMarket', () => {
	test('verified record + on-chain verdict on Monad -> consistent, no write without a receiver', () => {
		const { urls, writes } = mockChainAndApi()
		const r = watchMarket(runtimeWith(config), '1112268')
		expect(urls).toEqual(['https://api.predge.io/v1/settlement-risk/1112268'])
		expect(r).toMatchObject({ market_id: '1112268', risk_level: 'resolved', open_dispute: false, onchain_verdict: 0, expected_verdict: 0, status: 'consistent' })
		expect(r.request_hash).toBe(row('1112268').requestHash)
		expect(r.onchain_response_hash).toBe(row('1112268').responseHash)
		expect(writes).toHaveLength(0)
	})

	test('flags a conflict when the chain says something the signed record does not', () => {
		mockChainAndApi({ onchain: 'flipped' })
		expect(watchMarket(runtimeWith(config), '1004831').status).toBe('conflict')
	})

	test('no verdict on chain for this market', () => {
		mockChainAndApi({ onchain: 'none' })
		expect(watchMarket(runtimeWith(config), '1004831')).toMatchObject({ status: 'no-onchain-verdict', onchain_verdict: -1 })
	})

	test('with a receiver configured, writes a report that decodes to the result', () => {
		const { writes } = mockChainAndApi()
		const cfg = { ...config, write: { ...config.write, receiverAddress: '0x00000000000000000000000000000000000000aa' } }
		const r = watchMarket(runtimeWith(cfg), '1004831')
		expect(writes).toHaveLength(1)
		// raw report = 109-byte metadata header + abi-encoded payload
		const payload = bytesToHex(writes[0].slice(109))
		const [marketId, requestHash, riskLevel, openDispute, onchainVerdict, expected, status, contentHash] = decodeAbiParameters(REPORT_PARAMS, payload)
		expect({ marketId, requestHash, riskLevel, openDispute, onchainVerdict, expected, status, contentHash }).toEqual({
			marketId: '1004831',
			requestHash: row('1004831').requestHash,
			riskLevel: 'resolved',
			openDispute: false,
			onchainVerdict: 100,
			expected: 100,
			status: 0,
			contentHash: r.content_hash as `0x${string}`,
		})
	})

	test('a tampered API response stops the run before anything is read or written', () => {
		const { writes } = mockChainAndApi()
		const http = HttpActionsMock.testInstance()
		http.sendRequest = () => {
			const body = JSON.parse(fixture('1004831').toString())
			body.attestation.canonical = body.attestation.canonical.replace('"risk_level":"resolved"', '"risk_level":"low"')
			return { statusCode: 200, body: Buffer.from(JSON.stringify(body)), headers: {} }
		}
		expect(() => watchMarket(runtimeWith(config), '1004831')).toThrow()
		expect(writes).toHaveLength(0)
	})
})

describe('triggers', () => {
	test('HTTP trigger takes {"market_id"}', () => {
		mockChainAndApi()
		const out = JSON.parse(onHttp(runtimeWith(config), { input: Buffer.from('{"market_id":"1004831"}') } as never))
		expect(out.status).toBe('consistent')
	})

	test('initWorkflow registers a cron and an HTTP handler', () => {
		const handlers = initWorkflow(config)
		expect(handlers).toHaveLength(2)
		expect((handlers[0].trigger as unknown as { config: { schedule: string } }).config.schedule).toBe(config.schedule)
	})
})
