# RVR oracle-outcome profile, UMA CTF adapter, v0

Status: experimental external profile for ERC-8404 (Recomputable Verification Receipts), written by
Predge. It is not part of the RVR core and is not reviewed by the RVR author.

## 1. Authority

This file is the complete verification specification for profile `rvr-oracle-outcome-uma-ctf-v0`.
Its exact bytes are pinned by `verification-profile.json`. The profile package root is
`erc8404-profile/`; every dependency path is relative to it. The generic manifest schema under
`conformance/rvr-v0/` is the RVR v0 bootstrap schema, vendored byte for byte (SHA-256
`148afeb484d3866c1caae82e574182c1b748dd461dfaeb1d8095ecf4905690c1`).

Generic RVR v0 rules apply unchanged: the six-field receipt, `rvr-canonical-json-v0`, SHA-256
identities, the two independent axes, dependency resolution, and the recomputation order. This file
adds the claim, evidence, snapshot, evaluation and reason codes for one kind of proposition.

## 2. Propositions

The claim names exactly one of two propositions.

```text
rvr.oracle-outcome.v0.final_outcome_under_committed_rules
rvr.oracle-outcome.v0.proposed_outcome_at_committed_snapshot
```

For `final_outcome_under_committed_rules`, `VERIFIED` means:

> In the committed chain-read snapshot at block B, the market's condition is resolved on the
> ConditionalTokens contract by the UMA CTF adapter, the committed resolution receipt holds the
> adapter's `QuestionResolved` and the ConditionalTokens `ConditionResolution` for this question,
> their payouts equal the snapshot's payout read, the rules are the committed rules version, and
> the payouts give the claimed outcome.

For `proposed_outcome_at_committed_snapshot`, `VERIFIED` means:

> In the committed snapshot at block B, the condition is unresolved, the market's current UMA
> request is in state `PROPOSED`, and its latest proposal gives the claimed outcome.

The two propositions are different claims. A proposed-state snapshot can establish the second and
can never establish the first: evaluating a final-outcome claim over it gives `UNVERIFIABLE` with
`rvr.oracle-outcome.v0.lifecycle_not_final`, and that result reproduces. A later dispute or
resolution does not invalidate a correctly scoped receipt over that snapshot; it only means the
receipt cannot be used to claim more than its proposition.

Not established: canonicality or finality of block B on Polygon (the block hash is committed and
can be compared with the chain out of band), correctness of the outcome in the world, the
honesty of the proposer, disputer or voters, and the meaning of the market's rules beyond the
label mapping in section 5.

## 3. Identity contracts

The receipt has exactly the six RVR v0 fields. Claim, evidence-set descriptor, snapshot and
canonical result are `rvr-canonical-json-v0` objects: JSON numbers are forbidden, every quantity is
a canonical decimal string, addresses and hex are lower case, hashes are `0x` plus 64 hex.
Schemas: `rvr.schema.json`, pointers `#/$defs/claim`, `#/$defs/evidenceSet`,
`#/$defs/chainSnapshot`, `#/$defs/canonicalResult`, and the root for the receipt.

The claim commits to:
- `market`: chain id `137`, the UMA CTF adapter `0x65070be91477460d8a7aeeb94ef92fe056c2f2a7`, UMA's
  Managed Optimistic Oracle V2 `0x2c0367a9db231ddebd88a94b4f6461a6e47c58b1`, ConditionalTokens
  `0x4d97dcd97ec945f40cf65f87097ace5ea0476045`, identifier `YES_OR_NO_QUERY`, `questionId` and
  `conditionId`. Profile v0 accepts only these three contracts on Polygon;
- `rules`: `ancillaryDataKeccak256` (the question text as initialized, which is `questionId`) and
  `bulletinUpdatesDigest`, the SHA-256 of the canonical JSON of the bulletin-board updates
  (`AncillaryDataUpdated` for this question) at or before B. Together these are the rules version;
- `outcome`: `Yes`, `No` or `Unknown`;
- `snapshotMember` `chain-snapshot` and `snapshotAssurance` `COMMITTED_CHAIN_READ_SNAPSHOT`.

## 4. Evidence closure

The evidence set has exactly one member, `chain-snapshot`, `application/json`, whose payload is the
exact canonical bytes of a `#/$defs/chainSnapshot` object:

- block number, block hash and block timestamp of B;
- the three contracts, `identifier`, `questionId`, `conditionId` and the raw `ancillaryData`;
- `bulletinUpdates` at or before B;
- `oracleRequests`: each UMA request of the question that exists at B, with `requestTimestamp`, its
  `getState` at B (`REQUESTED`, `PROPOSED`, `EXPIRED`, `DISPUTED`, `RESOLVED`, `SETTLED`) and its
  `RequestPrice`, `ProposePrice`, `DisputePrice` and `Settle` events at or before B;
- `conditionResolution`: `payoutDenominator(conditionId)` and both `payoutNumerators` at B;
- `resolutionReceipt`: `null`, or the full receipt (status, block, every log) of the transaction
  holding the adapter's `QuestionResolved` for the question at or before B.

The snapshot is the evidence. Evaluation never reads an RPC, an indexer or a clock. A snapshot
whose bytes are not exact canonical JSON is a gate rejection (`rvr.gate.identity_mismatch`). A
snapshot with any event or update later than B, with a `resolutionReceipt` whose block is later
than B (whatever its status), with a `resolutionReceipt` at block B whose `blockHash` is not
the snapshot's `blockHash`, with a `payoutDenominator` that is not the sum of the two
`payoutNumerators` (ConditionalTokens sets it to that sum, so an unresolved condition reads 0 and
`[0,0]`), or with a successful resolution receipt while the payout denominator is 0, does not
describe one chain state and is a gate rejection
(`rvr.gate.schema_invalid`). This check runs before evaluation, so such a snapshot never reaches
the lifecycle derivation in section 5. Any outcome-relevant input outside the claim, the evidence
set and this profile (for example a live `latest` read) is a gate rejection
(`rvr.gate.evidence_closure_incomplete`).

If `chain-snapshot` is committed `UNAVAILABLE`, evaluation returns `UNVERIFIABLE` with
`rvr.oracle-outcome.v0.required_snapshot_unavailable`. If it is committed `PRESENT` but the
recomputer cannot resolve the payload, recomputation returns `CANNOT_RECOMPUTE` with
`rvr.recompute.committed_evidence_unavailable` and does not evaluate.

How the snapshot was read is provenance, not part of the proposition. A reader can rebuild it from
any Polygon archive RPC (`tools/collect-uma-ctf.mjs`, then `adapter.py --write`) and compare bytes.

## 5. Finality conditions

The lifecycle state at B is derived from the snapshot alone:

1. Resolution evidence holds when `resolutionReceipt` is present, has status `SUCCESS`, is at or
   before B, and its logs hold exactly one log from ConditionalTokens with topics
   `[0xb44d84d3289691f71497564b85d4233648d9dbae8cbdbb4329f301c3a0185894, conditionId,
   adapter as 32 bytes, questionId]` (`ConditionResolution`) whose data decodes as
   `(uint256 outcomeSlotCount, uint256[] payoutNumerators)` with the snapshot's payout read, and
   exactly one log from the adapter with topics
   `[0x566c3fbdd12dd86bb341787f6d531f79fd7ad4ce7e3ae2d15ac0ca1b601af9df, questionId, settledPrice]`
   (`QuestionResolved`) whose data is exactly `abi.encode(uint256[] payouts)` (offset 32, two
   entries, no trailing bytes) with payouts equal to the snapshot's payout read, and whose
   `settledPrice` (an `int256` topic) is one of the three label prices below and gives the same
   label as those payouts. If any of these contents disagree, or the data is empty or malformed,
   there is no resolution evidence. Logs are matched by emitting address and topics, never by
   position: the resolution may be batched with other markets.
2. If `payoutDenominator` is not `0`: `FINAL` with resolution evidence, else
   `RESOLVED_WITHOUT_EVIDENCE`.
3. Otherwise the current request is the one with the largest `requestTimestamp`, and its state
   maps `REQUESTED` to `REQUESTED`, `PROPOSED` to `PROPOSED`, `DISPUTED` to `DISPUTED`, `EXPIRED`
   to `EXPIRED_UNRESOLVED`, and `RESOLVED` or `SETTLED` to `SETTLED_UNRESOLVED`. A settled UMA
   request is not yet a resolved market: the adapter's `resolve` is a separate transaction.

The rules are bound when `keccak256(ancillaryData) = questionId`,
`conditionId = keccak256(adapter ++ questionId ++ uint256(2))`, and the claim's `rules` equal the
snapshot's (`questionId` and the digest of `bulletinUpdates`). `keccak256` is Ethereum's (original
Keccak padding), not NIST SHA3-256.

Labels: the ancillary data MUST contain exactly
`res_data: p1: 0, p2: 1, p3: 0.5. Where p1 corresponds to No, p2 to Yes, p3 to unknown/50-50.`
Then price `0` is `No`, `1000000000000000000` is `Yes`, `500000000000000000` is `Unknown`, and
payouts `[1,0]` are `Yes`, `[0,1]` are `No`, `[1,1]` are `Unknown`. A market without that text is
outside v0 (`UNVERIFIABLE`, `rvr.oracle-outcome.v0.rules_labels_unrecognized`).

## 6. Evaluation

For well-formed inputs, in this order; the first failing step sets the result:

1. Committed `UNAVAILABLE` snapshot: `UNVERIFIABLE`, `required_snapshot_unavailable`.
2. Parse, schema-check, canonical-bytes check and single-state gate (section 4).
3. Claim `market` differs from the snapshot: `REFUTED`, `market_mismatch`.
4. `keccak256(ancillaryData) != questionId` or the `conditionId` identity fails: `REFUTED`,
   `snapshot_identity_inconsistent`.
5. Claim `rules` differ from the snapshot: `REFUTED`, `rules_version_mismatch`.
6. Label text missing: `UNVERIFIABLE`, `rules_labels_unrecognized`.
7. Derive the lifecycle state (section 5).
8. `final_outcome_under_committed_rules`:
   - `RESOLVED_WITHOUT_EVIDENCE`: `UNVERIFIABLE`, `resolution_evidence_incomplete`;
   - any other state that is not `FINAL`: `UNVERIFIABLE`, `lifecycle_not_final`;
   - `FINAL` and the payout label equals the claim: `VERIFIED`, `final_outcome_verified`;
   - `FINAL` otherwise: `REFUTED`, `final_outcome_mismatch`.
9. `proposed_outcome_at_committed_snapshot`:
   - state not `PROPOSED`: `REFUTED`, `lifecycle_state_mismatch`;
   - latest proposal of the current request labels the claim: `VERIFIED`, `proposal_verified`;
   - otherwise `REFUTED`, `proposed_outcome_mismatch`.

All reason codes above carry the prefix `rvr.oracle-outcome.v0.`. The canonical result is
`#/$defs/canonicalResult`; its `evaluation` records the snapshot digest, chain, block, lifecycle
state, the three finality conditions (`lifecycleFinal`, `rulesBound`, `resolutionEvidence`), the
current request, the proposed and final outcome labels where they exist, and the claimed outcome.
The receipt's `outcome` and `reasonCode` are projections of `/outcome` and `/reasonCode`.

## 7. Recomputation and failure ownership

As in RVR v0 section 9. Profile bootstrap: parse and apply the trusted generic manifest schema;
resolve, read and SHA-256-check each dependency once; only then parse and apply
`profile.schema.json`. A constraints file whose digest does not match is rejected without being
parsed or applied. The required-dependency status below is decided before the stored receipt,
claim, evidence-set descriptor or canonical result is validated against any pinned schema, so a
missing or altered `rvr.schema.json` gives `CANNOT_RECOMPUTE`, never an error or a gate result.

- Required dependency unavailable: `CANNOT_RECOMPUTE`, `rvr.recompute.normative_dependency_unavailable`.
- Required dependency with other bytes: `CANNOT_RECOMPUTE`, `rvr.recompute.normative_dependency_identity_mismatch`.
- Committed `PRESENT` snapshot unresolved: `CANNOT_RECOMPUTE`, `rvr.recompute.committed_evidence_unavailable`.
- Receipt whose `outcome` or `reasonCode` contradicts its canonical result: gate rejection,
  `rvr.gate.result_projection_mismatch`, even when `resultDigest` is right.
- After complete evaluation: `REPRODUCED` when claim, evidence-set and result identities equal the
  receipt's, else `DIVERGED`.

`expected.json` and `vectors.json` are conformance material (`requiredForRecomputation: false`);
they never influence an individual recomputation.

## 8. Conformance pair

On Polymarket market 1992979 (Polygon), the claim "the final outcome is Yes":

- negative: snapshot at block 89509500, where request `1776352668` holds a proposed `Yes` and the
  condition is unresolved. Result `UNVERIFIABLE` / `lifecycle_not_final`, `REPRODUCED`. The
  proposal was disputed at block 89510574;
- positive control: the claim "the final outcome is No" over the snapshot at block 89518530, after
  the adapter's resolution with payouts `[0,1]`. Result `VERIFIED` / `final_outcome_verified`,
  `REPRODUCED`, with all three finality conditions true;
- the disputed proposal claimed as final over that same final snapshot: `REFUTED` /
  `final_outcome_mismatch`;
- the correctly scoped claim "Yes was proposed at block 89509500": `VERIFIED` /
  `proposal_verified`, and it stays reproducible after the dispute.
