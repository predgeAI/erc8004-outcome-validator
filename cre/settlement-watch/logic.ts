// Pure verification and decision logic for the Predge settlement watch workflow.
//
// Nothing in this file touches a CRE capability, so it runs the same way inside the workflow (WASM)
// and in the unit tests (bun). Hashes and signatures use @noble (pure JS), because the CRE runtime
// has no node:crypto.

import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { keccak256, toHex } from 'viem'

// ─── Canonical JSON (same rule as Predge's signer and monad/batch/fetch-records.mjs) ───────────
// Keys sorted at every level, no whitespace, JSON.stringify for scalars.
export const canon = (v: unknown): string => {
	if (v === null || typeof v !== 'object') return JSON.stringify(v)
	if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
	const o = v as Record<string, unknown>
	return `{${Object.keys(o)
		.sort()
		.map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
		.join(',')}}`
}

// ─── Record shapes ─────────────────────────────────────────────────────────────────────────────
export type Attestation = {
	canonical: string
	signature: string
	public_key: string
	content_hash?: string
	payload?: unknown
	algorithm?: string
}

// The signed payload fields this workflow relies on.
export type SignedFacts = {
	market_id: string
	uma_question_id: string
	risk_level: string
	open_dispute: boolean
	resolved_on_chain: boolean
	uma_state: string
	dispute_count: string
	disputes: { disputed_proposal: string | null }[]
	onchain_resolution: { outcome: string | null } | null
	issued_at: string
}

export type VerifiedRecord = {
	facts: SignedFacts
	contentHash: `0x${string}` // sha256 over the UTF-8 bytes of `canonical`
}

// ─── Verification ──────────────────────────────────────────────────────────────────────────────
const strip0x = (h: string) => (h.startsWith('0x') ? h.slice(2) : h)

/**
 * Verifies a Predge attestation and returns the signed facts. Throws with a reason on any failure.
 *  1. the signer is the pinned Predge key (a valid signature from any other key is rejected);
 *  2. ed25519 signature over the exact UTF-8 bytes of `canonical` (strict RFC 8032 checks);
 *  3. sha256(canonical) equals the published `content_hash`;
 *  4. `payload`, if present, re-canonicalises to exactly `canonical` (no unsigned fields slipped in);
 *  5. the record is for the market that was asked for.
 */
export function verifyAttestation(a: Attestation, pinnedPublicKey: string, expectedMarketId: string): VerifiedRecord {
	if (!a || typeof a.canonical !== 'string' || typeof a.signature !== 'string' || typeof a.public_key !== 'string') {
		throw new Error('attestation missing canonical, signature or public_key')
	}
	if (a.algorithm !== undefined && a.algorithm !== 'ed25519') throw new Error(`unsupported algorithm ${a.algorithm}`)
	if (strip0x(a.public_key).toLowerCase() !== strip0x(pinnedPublicKey).toLowerCase()) {
		throw new Error(`record signed by ${a.public_key}, not the pinned Predge key`)
	}
	const msg = utf8ToBytes(a.canonical)
	let sigOk = false
	try {
		sigOk = ed25519.verify(hexToBytes(strip0x(a.signature)), msg, hexToBytes(strip0x(a.public_key)), { zip215: false })
	} catch {
		sigOk = false
	}
	if (!sigOk) throw new Error('ed25519 signature does not verify over canonical')

	const contentHash = `0x${bytesToHex(sha256(msg))}` as `0x${string}`
	if (a.content_hash !== undefined && strip0x(a.content_hash).toLowerCase() !== contentHash.slice(2)) {
		throw new Error(`content_hash mismatch: published ${a.content_hash}, computed ${contentHash}`)
	}
	if (a.payload !== undefined && canon(a.payload) !== a.canonical) {
		throw new Error('payload does not re-canonicalise to canonical')
	}

	const facts = JSON.parse(a.canonical) as SignedFacts
	if (String(facts.market_id) !== String(expectedMarketId)) {
		throw new Error(`record is for market ${facts.market_id}, asked for ${expectedMarketId}`)
	}
	return { facts, contentHash }
}

// ─── Market id -> requestHash (identical to monad/batch/run-batch.mjs buildVerdict) ───────────
// The claim an agent made if it acted on the proposal before settlement:
// "the final on-chain outcome equals the first disputed proposal".
export function settlementClaim(f: SignedFacts) {
	const proposal = f.disputes?.[0]?.disputed_proposal
	if (!proposal) return null
	return {
		kind: 'predge-settlement-claim-v1',
		platform: 'polymarket',
		market_id: f.market_id,
		uma_question_id: f.uma_question_id,
		claim: 'final on-chain outcome equals the first disputed proposal',
		proposal,
	}
}

export function requestHashFor(f: SignedFacts): `0x${string}` | null {
	const claim = settlementClaim(f)
	return claim ? keccak256(toHex(canon(claim))) : null
}

// What the verdict should be according to this (newer) signed record: 100 if the on-chain
// resolution equals the first disputed proposal, 0 if it settled differently, null if unsettled.
export function expectedVerdict(f: SignedFacts): number | null {
	const proposal = f.disputes?.[0]?.disputed_proposal
	const outcome = f.onchain_resolution?.outcome
	if (!proposal || !f.resolved_on_chain || !outcome) return null
	return outcome === proposal ? 100 : 0
}

// ─── Node-level observation (what every DON node reports before consensus) ────────────────────
// Only plain strings / numbers / booleans, so the identical-per-field consensus is well defined.
// -1 means "not applicable"; "" means "none".
export type Observation = {
	market_id: string
	risk_level: string
	open_dispute: boolean
	resolved_on_chain: boolean
	outcome: string
	proposal: string
	expected_verdict: number
	request_hash: string
	content_hash: string
}

export function observe(rec: VerifiedRecord): Observation {
	const f = rec.facts
	return {
		market_id: String(f.market_id),
		risk_level: String(f.risk_level),
		open_dispute: Boolean(f.open_dispute),
		resolved_on_chain: Boolean(f.resolved_on_chain),
		outcome: f.onchain_resolution?.outcome ?? '',
		proposal: f.disputes?.[0]?.disputed_proposal ?? '',
		expected_verdict: expectedVerdict(f) ?? -1,
		request_hash: requestHashFor(f) ?? '',
		content_hash: rec.contentHash,
	}
}

// ─── On-chain verdict, from PredgeAgentValidator.getValidationStatus(requestHash) ─────────────
export type OnchainStatus = {
	validatorAddress: string
	response: number
	responseHash: string
	tag: string
	lastUpdate: bigint
}

// ─── Final decision ────────────────────────────────────────────────────────────────────────────
// status:
//   "consistent"          on-chain verdict exists and equals what the signed record implies
//   "conflict"            on-chain verdict exists and disagrees with the signed record (alert)
//   "no-onchain-verdict"  nothing written for this market's requestHash yet
//   "unsettled"           the market is not settled on chain yet, so there is nothing to compare
//   "open-dispute"        a dispute is open right now: agents should not act on the proposal
export type WatchResult = {
	market_id: string
	risk_level: string
	open_dispute: boolean
	onchain_verdict: number // 100, 0, or -1 when there is none
	expected_verdict: number // 100, 0, or -1 when unsettled
	status: 'consistent' | 'conflict' | 'no-onchain-verdict' | 'unsettled' | 'open-dispute'
	request_hash: string
	onchain_response_hash: string
	content_hash: string
}

export function decide(o: Observation, s: OnchainStatus | null, trustedValidator: string): WatchResult {
	const hasVerdict =
		s !== null && s.lastUpdate > 0n && s.validatorAddress.toLowerCase() === trustedValidator.toLowerCase()
	const onchain = hasVerdict ? Number(s!.response) : -1
	let status: WatchResult['status']
	if (o.open_dispute) status = 'open-dispute'
	else if (!hasVerdict) status = o.expected_verdict === -1 ? 'unsettled' : 'no-onchain-verdict'
	else if (o.expected_verdict === -1) status = 'unsettled'
	else status = onchain === o.expected_verdict ? 'consistent' : 'conflict'
	return {
		market_id: o.market_id,
		risk_level: o.risk_level,
		open_dispute: o.open_dispute,
		onchain_verdict: onchain,
		expected_verdict: o.expected_verdict,
		status,
		request_hash: o.request_hash,
		onchain_response_hash: hasVerdict ? s!.responseHash : '0x' + '00'.repeat(32),
		content_hash: o.content_hash,
	}
}

export const STATUS_CODE: Record<WatchResult['status'], number> = {
	consistent: 0,
	conflict: 1,
	'no-onchain-verdict': 2,
	unsettled: 3,
	'open-dispute': 4,
}
