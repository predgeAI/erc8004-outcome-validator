// Pure settlement logic for dispute-hedge notes. No network, no CRE runtime.
//
// Input: what every DON node read from Polygon's Conditional Tokens Framework (CTF) at one
// finalized block: getOutcomeSlotCount, payoutDenominator, payoutNumerators(0) and (1).
// Output: either "unresolved" (nothing is written) or the report that settles the condition on
// the DisputeNoteFactory on Monad.
import { encodeAbiParameters, parseAbiParameters } from 'viem'

export type CtfRead = {
	conditionId: `0x${string}`
	polygonBlock: bigint
	slots: bigint
	denominator: bigint
	payout0: bigint
	payout1: bigint
}

export type Decision =
	| { status: 'resolved'; conditionId: `0x${string}`; payout0: bigint; payout1: bigint; denominator: bigint; polygonBlock: bigint }
	| { status: 'unresolved' | 'unsupported'; conditionId: `0x${string}`; reason: string }

// Same layout as DisputeNoteFactory.onReport decodes.
export const REPORT_PARAMS = parseAbiParameters(
	'bytes32 conditionId, uint256 payout0, uint256 payout1, uint256 payoutDenominator, uint64 polygonBlock',
)

export function decide(r: CtfRead): Decision {
	if (r.slots !== 2n) return { status: 'unsupported', conditionId: r.conditionId, reason: `outcome slot count ${r.slots}, notes cover binary conditions only` }
	// CTF.reportPayouts sets the denominator to the sum of numerators, once, and never again.
	if (r.denominator === 0n) return { status: 'unresolved', conditionId: r.conditionId, reason: 'payoutDenominator is 0: not reported to the CTF yet' }
	if (r.payout0 + r.payout1 !== r.denominator) {
		return { status: 'unsupported', conditionId: r.conditionId, reason: `numerators ${r.payout0}+${r.payout1} != denominator ${r.denominator}` }
	}
	return { status: 'resolved', conditionId: r.conditionId, payout0: r.payout0, payout1: r.payout1, denominator: r.denominator, polygonBlock: r.polygonBlock }
}

export function encodeReport(d: Extract<Decision, { status: 'resolved' }>): `0x${string}` {
	return encodeAbiParameters(REPORT_PARAMS, [d.conditionId, d.payout0, d.payout1, d.denominator, d.polygonBlock])
}

// What a note pays per leg for a given resolution, mirroring DisputeNoteFactory._settle.
export function winningLeg(proposal: [bigint, bigint], payout: [bigint, bigint]): 'HOLD' | 'CHANGE' {
	return payout[0] * proposal[1] === payout[1] * proposal[0] ? 'HOLD' : 'CHANGE'
}
