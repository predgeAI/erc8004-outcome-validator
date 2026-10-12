import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { canon, decide, expectedVerdict, observe, requestHashFor, verifyAttestation, type Attestation, type OnchainStatus } from './logic'

const PREDGE_KEY = '13fa3d18a369e6c71bf941563ba47822b30182273d5106a0e8fb61c5016352d9'
const VALIDATOR = '0x9F0Af03C5695b72903c03852f7Dd4Fe5A0d49Fc9'
const here = (p: string) => path.join(import.meta.dir, p)
const live = (m: string) => JSON.parse(readFileSync(here(`fixtures/settlement-risk-${m}.json`), 'utf8')).attestation as Attestation
const batch = (m: string) => JSON.parse(readFileSync(here(`../../monad/batch/records/${m}.json`), 'utf8')).attestation as Attestation
const results = JSON.parse(readFileSync(here('../../monad/batch/results-2026-10-07T11-39-11-867Z.json'), 'utf8'))
const onchainRow = (m: string) => results.verdicts.find((v: { market_id: string }) => v.market_id === m)

const status = (response: number, validatorAddress = VALIDATOR): OnchainStatus => ({
	validatorAddress,
	response,
	responseHash: `0x${'ab'.repeat(32)}`,
	tag: 'predge:settlement-risk-v1',
	lastUpdate: 1n,
})

describe('verifyAttestation', () => {
	test('accepts a real signed record from api.predge.io and recomputes content_hash', () => {
		const a = live('1004831')
		const rec = verifyAttestation(a, PREDGE_KEY, '1004831')
		expect(rec.contentHash).toBe(`0x${a.content_hash}`)
		expect(rec.facts.risk_level).toBe('resolved')
	})

	test('accepts the batch records (no payload, no content_hash fields)', () => {
		expect(verifyAttestation(batch('1112268'), PREDGE_KEY, '1112268').facts.market_id).toBe('1112268')
	})

	test('rejects a record whose canonical was edited after signing', () => {
		const a = live('1004831')
		const forged = { ...a, canonical: a.canonical.replace('"outcome":"No"', '"outcome":"Yes"'), content_hash: undefined, payload: undefined }
		expect(() => verifyAttestation(forged, PREDGE_KEY, '1004831')).toThrow('signature')
	})

	test('rejects a valid record signed by a key other than the pinned one', () => {
		expect(() => verifyAttestation(live('1004831'), 'ff'.repeat(32), '1004831')).toThrow('pinned')
	})

	test('rejects a wrong content_hash', () => {
		const a = { ...live('1004831'), content_hash: '00'.repeat(32) }
		expect(() => verifyAttestation(a, PREDGE_KEY, '1004831')).toThrow('content_hash')
	})

	test('rejects a payload that differs from the signed canonical', () => {
		const a = live('1004831')
		const payload = { ...(a.payload as object), risk_level: 'low' }
		expect(() => verifyAttestation({ ...a, payload }, PREDGE_KEY, '1004831')).toThrow('payload')
	})

	test('rejects a record for a different market than requested', () => {
		expect(() => verifyAttestation(live('1004831'), PREDGE_KEY, '1112268')).toThrow('asked for')
	})

	test('rejects a corrupted signature', () => {
		const a = live('1004831')
		const sig = (a.signature[0] === '0' ? '1' : '0') + a.signature.slice(1)
		expect(() => verifyAttestation({ ...a, signature: sig }, PREDGE_KEY, '1004831')).toThrow('signature')
	})
})

describe('requestHash derivation matches the Monad batch', () => {
	for (const m of ['1004831', '1112268']) {
		test(`market ${m}: from the batch record and from today's live record`, () => {
			const want = onchainRow(m).requestHash
			expect(requestHashFor(verifyAttestation(batch(m), PREDGE_KEY, m).facts)).toBe(want)
			expect(requestHashFor(verifyAttestation(live(m), PREDGE_KEY, m).facts)).toBe(want)
		})
	}

	test('canon sorts keys at every level', () => {
		expect(canon({ b: 1, a: { d: [2, { z: 1, y: null }], c: 'x' } })).toBe('{"a":{"c":"x","d":[2,{"y":null,"z":1}]},"b":1}')
	})
})

describe('expectedVerdict', () => {
	test('100 when the outcome equals the disputed proposal, 0 when it settled differently', () => {
		expect(expectedVerdict(verifyAttestation(live('1004831'), PREDGE_KEY, '1004831').facts)).toBe(100)
		expect(expectedVerdict(verifyAttestation(live('1112268'), PREDGE_KEY, '1112268').facts)).toBe(0)
	})

	test('null while the market is unsettled', () => {
		const f = verifyAttestation(live('1004831'), PREDGE_KEY, '1004831').facts
		expect(expectedVerdict({ ...f, resolved_on_chain: false, onchain_resolution: null })).toBeNull()
	})
})

describe('decide', () => {
	const obs = (m: string) => observe(verifyAttestation(live(m), PREDGE_KEY, m))

	test('consistent: on-chain verdict equals the verdict implied by the signed record', () => {
		const r = decide(obs('1004831'), status(onchainRow('1004831').score), VALIDATOR)
		expect(r.status).toBe('consistent')
		expect(r.onchain_verdict).toBe(100)
		expect(r.expected_verdict).toBe(100)
		expect(decide(obs('1112268'), status(0), VALIDATOR).status).toBe('consistent')
	})

	test('conflict: on-chain verdict disagrees with the signed record', () => {
		expect(decide(obs('1112268'), status(100), VALIDATOR).status).toBe('conflict')
	})

	test('no-onchain-verdict: requestHash was never answered', () => {
		const r = decide(obs('1004831'), { ...status(0), lastUpdate: 0n, validatorAddress: '0x0000000000000000000000000000000000000000' }, VALIDATOR)
		expect(r.status).toBe('no-onchain-verdict')
		expect(r.onchain_verdict).toBe(-1)
	})

	test('a verdict from an untrusted validator address is ignored', () => {
		const r = decide(obs('1004831'), status(100, '0x1111111111111111111111111111111111111111'), VALIDATOR)
		expect(r.status).toBe('no-onchain-verdict')
	})

	test('open-dispute wins over everything else', () => {
		expect(decide({ ...obs('1004831'), open_dispute: true }, status(100), VALIDATOR).status).toBe('open-dispute')
	})

	test('unsettled market', () => {
		const o = { ...obs('1004831'), expected_verdict: -1, resolved_on_chain: false, outcome: '' }
		expect(decide(o, null, VALIDATOR).status).toBe('unsettled')
	})
})
