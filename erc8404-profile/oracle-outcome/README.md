# ERC-8404 oracle-outcome profile: UMA CTF adapter v0

An external Verification Profile for [ERC-8404 Recomputable Verification Receipts](https://ethereum-magicians.org/t/erc-8404-recomputable-verification-receipts/29521)
(RVR v0.0.1-rc.2 format), for claims about the outcome of a Polymarket market resolved through the
UMA CTF adapter on Polygon. It answers the question in the thread (post #30, reply #31): a block
hash pins a snapshot, but not that the oracle's dispute process has ended. Here the lifecycle state,
the rules version and the resolution evidence are inside the proposition, so "Yes was proposed at
block B" and "the final outcome is No" are different claims with different receipts.

The conformance pair uses one real market, Polymarket 1992979, "Will Jon Rahm leave LIV Golf by
June 30th?":

| Case | Claim | Snapshot | Outcome | Recomputation |
|---|---|---|---|---|
| negative | final outcome is Yes | block 89509500, Yes proposed, not resolved | `UNVERIFIABLE` `lifecycle_not_final` | `REPRODUCED` |
| positive control | final outcome is No | block 89518530, resolved, payouts `[0,1]` | `VERIFIED` `final_outcome_verified` | `REPRODUCED` |
| neighbour | final outcome is Yes (the disputed proposal) | block 89518530 | `REFUTED` `final_outcome_mismatch` | `REPRODUCED` |
| neighbour | Yes proposed at block 89509500 | block 89509500 | `VERIFIED` `proposal_verified` | `REPRODUCED` |

Plus the RVR controls: `DIVERGED` on a changed snapshot, `CANNOT_RECOMPUTE` for an unresolved
snapshot and for a missing or altered normative dependency, committed-`UNAVAILABLE` evidence, and
gate rejections for a tampered constraints pin, a contradictory receipt projection, a live-RPC
input (with the counterfactual it would have caused), and non-canonical snapshot bytes.

Review regressions (thread post 33, Pavlo Tvardovskyi), each an adversarial edit of the final
snapshot recomputed against the positive control's receipt: `QuestionResolved` payouts that
conflict with the `ConditionResolution` log and read, empty `QuestionResolved` data, and a
conflicting `settledPrice` (all `UNVERIFIABLE` `resolution_evidence_incomplete`, `DIVERGED`); a
resolution receipt later than B, a receipt at B with another block hash, and a payout denominator
that is not the numerators' sum (all `rvr.gate.schema_invalid`); and a missing or altered
`rvr.schema.json` (`CANNOT_RECOMPUTE`).

```bash
python3 erc8404-profile/oracle-outcome/adapter.py --check          # recompute and compare with expected.json
python3 -m unittest erc8404-profile/oracle-outcome/test_profile.py
python3 erc8404-profile/oracle-outcome/adapter.py --write          # rebuild vectors, pins, receipts, manifest
```

| File | Role |
|---|---|
| `SPEC.md` | the verification specification (pinned) |
| `verification-profile.json` | the Verification Profile; its canonical SHA-256 is `verificationProfileDigest` |
| `profile.schema.json` | profile-specific constraints (pinned) |
| `rvr.schema.json` | receipt, claim, evidence set, snapshot and canonical result (pinned) |
| `vectors.json`, `expected.json` | conformance material: snapshots, claims, expected results (pinned, not required for recomputation) |
| `receipts.json` | the original receipts with the objects they accompany |
| `manifest.json` | package manifest and package digest |
| `adapter.py`, `test_profile.py` | standard-library-only conformance evidence; not part of profile identity |
| `../conformance/rvr-v0/` | the RVR v0 generic manifest schema, vendored byte for byte (Apache-2.0, see NOTICE) |

The snapshots are built from `grounded-feedback/evidence/polymarket-1992979.json`, which
`tools/collect-uma-ctf.mjs` reads from Polygon RPC. Every block number, block hash and transaction
hash in them is real. The same market backs the ERC-8004 `oracle-outcome-validation-v0` vectors in
`grounded-feedback/oracle-outcome.md`.

Limits: the adapter is one implementation by the profile's author, so it is evidence, not
independence. Profile v0 covers one adapter and the YES_OR_NO label rule only. Polygon block
finality and canonicality stay outside the proposition, as in the ERC-8281 profile.
