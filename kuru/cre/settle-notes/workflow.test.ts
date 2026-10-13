import { describe, expect } from 'bun:test'
import { bigintToBytes, getNetwork, TxStatus } from '@chainlink/cre-sdk'
import { EvmMock, newTestRuntime, test } from '@chainlink/cre-sdk/test'
import { bytesToHex, decodeAbiParameters, decodeFunctionData, encodeFunctionResult, type Hex, hexToBytes } from 'viem'
import config from './config.staging.json'
import { decide, REPORT_PARAMS, winningLeg } from './logic'
import { type Config, CTF_ABI, FACTORY_ABI, initWorkflow, onCron, onHttp, settleCondition } from './workflow'

const POLYGON = getNetwork({ chainFamily: 'evm', chainSelectorName: 'polygon-mainnet', isTestnet: false })!.chainSelector.selector
const MONAD = getNetwork({ chainFamily: 'evm', chainSelectorName: 'monad-testnet', isTestnet: true })!.chainSelector.selector

// Real Polygon CTF values read on 13 Oct 2026 (polygon-bor-rpc.publicnode.com, finalized):
const CTF: Record<string, [bigint, bigint, bigint]> = {
	// 1004831: disputed proposal No, settled No -> [0,1]/1
	'0x4e1cda2427c220278e16babce5b67b7f0f07946b5c76cc383ebf6035edf5f478': [1n, 0n, 1n],
	// 1112268: disputed proposal Over (slot 0), settled Under -> [0,1]/1
	'0xddff7251af9c56b2048edd2513019e55ae104143faa97d5799978f926bfcf1e0': [1n, 0n, 1n],
	// 5219930: under a UMA vote, not reported yet -> denominator 0
	'0x50d446794ad4e7b16e27e248ed841c76ca7edbb084907f61cd5a9d1f83cf96a8': [0n, 0n, 0n],
}
const C = Object.keys(CTF) as Hex[]
const FACTORY = '0x00000000000000000000000000000000000000fa'
const BLOCK = 77_123_456n

function mock(notes: { conditionId: Hex; state: number }[] = []) {
	const polygon = EvmMock.testInstance(POLYGON)
	const reads: string[] = []
	polygon.headerByNumber = () => ({ header: { timestamp: 0n, blockNumber: { absVal: bigintToBytes(BLOCK), sign: 1n }, hash: new Uint8Array(32), parentHash: new Uint8Array(32) } }) as never
	polygon.callContract = (req) => {
		const { functionName, args } = decodeFunctionData({ abi: CTF_ABI, data: bytesToHex(req.call!.data) })
		reads.push(functionName)
		const [den, n0, n1] = CTF[(args![0] as string).toLowerCase()]
		const v = functionName === 'getOutcomeSlotCount' ? 2n : functionName === 'payoutDenominator' ? den : args![1] === 0n ? n0 : n1
		return { data: hexToBytes(encodeFunctionResult({ abi: CTF_ABI, functionName, result: v } as never)) }
	}
	const monad = EvmMock.testInstance(MONAD)
	monad.callContract = (req) => {
		const { functionName, args } = decodeFunctionData({ abi: FACTORY_ABI, data: bytesToHex(req.call!.data) })
		if (functionName === 'noteCount') return { data: hexToBytes(encodeFunctionResult({ abi: FACTORY_ABI, functionName, result: BigInt(notes.length) })) }
		const n = notes[Number(args![0])]
		const result = { conditionId: n.conditionId, proposal0: 0n, proposal1: 1n, disputeTx: `0x${'00'.repeat(32)}`, expiry: 0n, state: n.state, hold: FACTORY, change: FACTORY, collateralLocked: 0n, marketId: 'x' }
		return { data: hexToBytes(encodeFunctionResult({ abi: FACTORY_ABI, functionName: 'notes', result } as never)) }
	}
	const writes: { receiver: string; raw: Uint8Array }[] = []
	monad.writeReport = (req) => {
		writes.push({ receiver: bytesToHex(req.receiver as unknown as Uint8Array), raw: req.report!.rawReport })
		return { txStatus: TxStatus.SUCCESS, txHash: new Uint8Array(32) }
	}
	return { reads, writes }
}

const rt = (over: Partial<Config['notes']> = {}) => {
	const r = newTestRuntime<Config>()
	;(r as unknown as { config: Config }).config = { ...(config as Config), notes: { ...(config as Config).notes, factory: FACTORY, ...over } }
	return r
}

describe('logic', () => {
	test('unresolved when the CTF has no payouts', () => {
		expect(decide({ conditionId: C[2], polygonBlock: 1n, slots: 2n, denominator: 0n, payout0: 0n, payout1: 0n }).status).toBe('unresolved')
	})
	test('non-binary conditions are not settled', () => {
		expect(decide({ conditionId: C[0], polygonBlock: 1n, slots: 3n, denominator: 1n, payout0: 0n, payout1: 1n }).status).toBe('unsupported')
	})
	test('winning leg: equal vectors (up to scale) -> HOLD, else CHANGE', () => {
		expect(winningLeg([0n, 1n], [0n, 1n])).toBe('HOLD') // 1004831: proposal No, settled No
		expect(winningLeg([1n, 0n], [0n, 1n])).toBe('CHANGE') // 1112268: proposal Over, settled Under
		expect(winningLeg([0n, 1n], [1n, 1n])).toBe('CHANGE') // 50/50 differs from No
		expect(winningLeg([1n, 1n], [5n, 5n])).toBe('HOLD')
	})
})

describe('settleCondition', () => {
	test('resolved condition -> one report to the factory that decodes to the CTF payouts', () => {
		const { writes } = mock()
		const d = settleCondition(rt({ write: true }), C[1])
		expect(d.status).toBe('resolved')
		expect(writes).toHaveLength(1)
		expect(writes[0].receiver).toBe(FACTORY)
		// raw report = 109-byte metadata header + abi-encoded payload
		const [cid, p0, p1, den, blk] = decodeAbiParameters(REPORT_PARAMS, bytesToHex(writes[0].raw.slice(109)))
		expect({ cid, p0, p1, den, blk }).toEqual({ cid: C[1], p0: 0n, p1: 1n, den: 1n, blk: BLOCK })
	})
	test('market under a UMA vote (5219930) -> nothing written', () => {
		const { writes } = mock()
		expect(settleCondition(rt({ write: true }), C[2]).status).toBe('unresolved')
		expect(writes).toHaveLength(0)
	})
	test('write disabled -> decides but does not write', () => {
		const { writes } = mock()
		expect(settleCondition(rt({ write: false }), C[0]).status).toBe('resolved')
		expect(writes).toHaveLength(0)
	})
})

describe('triggers', () => {
	test('cron settles only conditions with an open note', () => {
		const { writes } = mock([
			{ conditionId: C[0], state: 0 },
			{ conditionId: C[2], state: 0 },
			{ conditionId: C[1], state: 2 }, // already settled
			{ conditionId: C[0], state: 0 }, // second note on the same condition: one report
		])
		const out = JSON.parse(onCron(rt({ write: true }), {} as never))
		expect(out.map((o: { status: string }) => o.status)).toEqual(['resolved', 'unresolved'])
		expect(writes).toHaveLength(1)
	})
	test('HTTP trigger takes {"condition_id"}', () => {
		mock()
		const out = JSON.parse(onHttp(rt(), { input: Buffer.from(`{"condition_id":"${C[1]}"}`) } as never))
		expect(out).toMatchObject({ status: 'resolved', payout0: '0', payout1: '1', denominator: '1', polygonBlock: BLOCK.toString() })
	})
	test('initWorkflow registers cron + HTTP', () => {
		expect(initWorkflow(config as Config)).toHaveLength(2)
	})
})
