// Live run of the workflow code against the real Predge API and the real Monad testnet RPC, using
// the CRE SDK test runtime instead of the CRE simulator (which needs `cre login`).
//
//   LIVE=1 bun test live.test.ts
//
// The SDK test mocks are synchronous, so the real responses are fetched first and then served to the
// workflow's HTTP and EVM capabilities unchanged. Every byte the workflow verifies or decodes comes
// from api.predge.io and from eth_call on Monad testnet. No transaction is sent.
import { beforeAll, describe, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { getNetwork } from '@chainlink/cre-sdk'
import { EvmMock, HttpActionsMock, newTestRuntime, test } from '@chainlink/cre-sdk/test'
import { bytesToHex, hexToBytes } from 'viem'
import { type Config, watchMarket } from './workflow'

const LIVE = process.env.LIVE === '1'
const config = JSON.parse(readFileSync(path.join(import.meta.dir, 'config.staging.json'), 'utf8')) as Config
const RPC = 'https://testnet-rpc.monad.xyz'
const MONAD = getNetwork({ chainFamily: 'evm', chainSelectorName: 'monad-testnet', isTestnet: true })!.chainSelector.selector

const bodies = new Map<string, Uint8Array>()
const calls = new Map<string, string>()

async function rpc(method: string, params: unknown[]) {
	const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
	const j = (await r.json()) as { result?: string; error?: unknown }
	if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`)
	return j.result!
}

describe.skipIf(!LIVE)('live: api.predge.io + Monad testnet', () => {
	beforeAll(async () => {
		for (const m of config.marketIds) {
			const r = await fetch(`${config.apiBase}/v1/settlement-risk/${m}`)
			bodies.set(m, new Uint8Array(await r.arrayBuffer()))
		}
	}, 60_000)

	for (const m of config.marketIds) {
		test(`market ${m}`, async () => {
			// first pass: collect the eth_call the workflow wants to make
			const http = HttpActionsMock.testInstance()
			http.sendRequest = (req) => ({ statusCode: 200, body: bodies.get(req.url.split('/').pop()!)!, headers: {} })
			const evm = EvmMock.testInstance(MONAD)
			const wanted: string[] = []
			evm.callContract = (req) => {
				const data = bytesToHex(req.call!.data)
				wanted.push(data)
				const cached = calls.get(data)
				if (!cached) throw new Error('not fetched yet')
				return { data: hexToBytes(cached as `0x${string}`) }
			}
			const rt = () => {
				const r = newTestRuntime<Config>()
				;(r as unknown as { config: Config }).config = config
				return r
			}
			try { watchMarket(rt(), m) } catch {}
			for (const data of wanted) {
				calls.set(data, await rpc('eth_call', [{ to: config.read.validatorContract, data }, 'finalized']))
			}
			// second pass: the real run, served from the real responses
			const runtime = rt()
			const result = watchMarket(runtime, m)
			console.log(runtime.getLogs().join('\n'))
			expect(result.market_id).toBe(m)
			expect(result.status).toBe('consistent')
		})
	}
})
