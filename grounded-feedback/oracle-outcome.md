# oracle-outcome-validation-v0

A response document for ERC-8004 validators that check a claim against a real-world outcome read
from an oracle. It adds two things to such a response: the oracle's lifecycle state when the
validator wrote it (`outcomeState`), and the oracle reference it read, so a reader can re-check that
state on chain. It also says how a later `final` response replaces an earlier one.

Status: draft v0, written by Predge for the ERC-8004 thread on Ethereum Magicians (post #408 and
#409). It is not an ERC-8004 or maintainer document, and every part of it can change. It uses the
same canonical bytes, signature, envelope and `responseHash` rules as
[x402-grounded-feedback-v0](README.md#canonical-bytes-signature-responsehash), and needs no
registry change.

## Why

An optimistic oracle first holds a proposed outcome that can still be disputed. A validator that
writes "outcome matched" while the outcome is only proposed has made a different claim from one
that writes it after the outcome is final, and a reader of the response alone cannot tell the two
apart. On Polymarket between 1 January and 2 October 2026, 853 of 2,543 settled disputed markets
(33.5%) settled differently from the disputed proposal.

Whether a consumer acts on a proposed outcome is the consumer's policy. Which state the outcome was
in when the validator wrote is a fact, and the record carries it.

## Record fields

Every value is a string, or an object of strings. Addresses and hex values are lower case. Hashes
and transaction hashes are `0x` plus 64 hex characters. Optional keys are omitted when absent,
never set to `null`. Unknown keys make the record invalid.

| Field | Required | Meaning |
|---|---|---|
| `scheme` | yes | `"oracle-outcome-validation-v0"` |
| `requestHash` | yes | The ERC-8004 `requestHash` this record answers. Binding it inside the record stops a response from being moved to another request. |
| `ratee` | yes | The agent whose claim is validated: `{ "agentRegistry": "eip155:<chainId>:<identityRegistry>", "agentId": "<decimal>" }`. |
| `subject` | yes | The market: `{ "venue": "polymarket", "marketId": "<decimal>", "conditionId": "0x…" }`. |
| `claimedOutcome` | yes | The outcome the agent claimed, as the market labels it (`Yes`, `No`). |
| `observedOutcome` | yes | The outcome the oracle held at `oracle.readBlock`, by the label rule below. |
| `score` | yes | `"100"` when `observedOutcome` equals `claimedOutcome`, else `"0"`. Equal to the on-chain `response`. |
| `outcomeState` | yes | `proposed`, `disputed` or `final`: the oracle's state at `oracle.readBlock`. |
| `oracle` | yes | The oracle reference the validator read (next table). |
| `issuedAt` | yes | When the record was signed, `YYYY-MM-DDTHH:MM:SS.sssZ`. |
| `supersedes` | no | The `responseHash` of the earlier record for the same request that this record replaces. |

`oracle`, for `kind` `uma-ctf-adapter` (Polymarket's UMA CTF adapter; other oracle kinds would get
their own row set):

| Field | Meaning |
|---|---|
| `kind` | `"uma-ctf-adapter"` |
| `chainId` | Chain of every address and transaction below, decimal (`"137"` for Polygon). |
| `oracle` | The UMA Optimistic Oracle the request lives on. |
| `requester` | The UMA CTF adapter that made the request and resolves the condition. |
| `conditionalTokens` | The ConditionalTokens contract that holds the condition's payouts. |
| `questionId` | The adapter's question id, `keccak256(ancillaryData)`. |
| `identifier` | The UMA price identifier, `"YES_OR_NO_QUERY"`. |
| `requestTimestamp` | The timestamp of the UMA request that was read. After a dispute the adapter opens a new request, so this names which one. |
| `price` | The proposed, disputed or settled price, decimal (`int256`). |
| `readBlock` | The block number the validator read the state at. |
| `readBlockHash` | That block's hash, so a reorganised block does not silently stand in for it. |
| `stateTx` | The transaction that put the request into `outcomeState`: the `ProposePrice` for `proposed`, the `DisputePrice` for `disputed`, the adapter's `resolve` (with `QuestionResolved` and `ConditionResolution`) for `final`. |

Label rule for `YES_OR_NO_QUERY` with Polymarket's `res_data: p1: 0, p2: 1, p3: 0.5. Where p1
corresponds to No, p2 to Yes, p3 to unknown/50-50.`: price `0` is `No`, `1000000000000000000` is
`Yes`, `500000000000000000` is `Unknown`. Final payouts `[1,0]` are `Yes`, `[0,1]` are `No`,
`[1,1]` are `Unknown` (outcome order `Yes`, `No`).

Two identities a verifier checks offline: `keccak256(ancillaryData) = questionId`, and
`subject.conditionId = keccak256(requester ++ questionId ++ uint256(2))`.

## Normative rules

1. **`outcomeState` is bound by `responseHash`.** It is part of the signed canonical bytes, so it
   cannot be edited after the record is written on chain (test vector 10).
2. **A `proposed` or `disputed` record MUST NOT be presented as final.**
   - The on-chain `tag` MUST be `oracle-outcome:<outcomeState>`, so a contract or indexer that
     reads only the registry sees the state without fetching the document (vector 08 breaks this).
   - A consumer that displays or acts on such a record MUST show it as provisional.
   - A validator MUST NOT write `final` unless, at `oracle.readBlock`, the condition is resolved
     (`payoutDenominator(conditionId) > 0`) and `stateTx` holds the resolution. This is checkable
     on chain, which is why the reference is bound next to the label (vector 11).
3. **A later `final` record for the same request supersedes the earlier one, which stays visible.**
   - The later record carries `supersedes: <responseHash of the record it replaces>`. The
     superseded record MUST have the same `requestHash`, `ratee`, `subject` and `claimedOutcome`,
     MUST NOT be `final`, and MUST have an earlier `oracle.readBlock` and `issuedAt`.
   - A `final` record for a request that already has records MUST supersede the latest of them. A
     `final` record is never superseded: on-chain resolution is irreversible.
   - "Stays visible": the Validation Registry stores only the latest response per `requestHash`
     (`getValidationStatus`), but every `ValidationResponse` event stays in the logs. The validator
     MUST keep serving the superseded envelope at its `responseURI`. A reader rebuilds the history
     by walking `supersedes` back from the latest record.
   - A consumer acting on the outcome uses the latest record; the earlier one still shows what the
     validator said, and when.
4. **Score follows the state it was read in.** `score` compares the claim with the outcome the
   oracle held at `readBlock`. A `proposed` record with score 100 says "the proposal matches the
   claim", nothing more.

## Writing it to ERC-8004

As for grounded feedback: the validator calls
`validationResponse(requestHash, response, responseURI, responseHash, tag)` with
`response = score`, `responseHash = keccak256(canonical bytes)` and
`tag = oracle-outcome:<outcomeState>`. For a later `final` record it calls `validationResponse`
again for the same `requestHash`.

## Verifying a record

1. Check the envelope as for grounded feedback: canonical bytes, ed25519 signature, `responseHash`.
2. Check the fields above, the label rule, the two identities, and that `score` follows from the
   outcomes.
3. Check the registry write: same `requestHash`, `response = score`, `tag = oracle-outcome:<outcomeState>`.
4. Check `supersedes` against the earlier record, if any.
5. On chain, at `readBlock` (an archive `eth_call`):
   - the block hash equals `readBlockHash`;
   - `OO.getState(requester, identifier, requestTimestamp, ancillaryData)` is `PROPOSED` for
     `proposed`, `DISPUTED` for `disputed`, `RESOLVED` or `SETTLED` for `final`;
   - `payoutDenominator(conditionId)` is 0 unless `final`; for `final` it is not 0 and the payouts
     give `observedOutcome`;
   - `stateTx` succeeded no later than `readBlock` and holds the matching `ProposePrice`,
     `DisputePrice`, or `QuestionResolved` plus `ConditionResolution` for this question and price.

## Test vectors: Polymarket market 1992979

"Will Jon Rahm leave LIV Golf by June 30th?" on Polygon, through the UMA CTF adapter
`0x65070be9…f2a7` and UMA's Managed Optimistic Oracle V2 `0x2c0367a9…58b1`. Every fact below is in
[`evidence/polymarket-1992979.json`](evidence/polymarket-1992979.json), written by
[`tools/collect-uma-ctf.mjs`](../tools/collect-uma-ctf.mjs), which re-reads it from any Polygon
archive RPC. It is one market from Predge's 2026 dispute dataset: one dispute, and the market
settled differently from the disputed proposal.

| Block | Transaction | Event |
|---|---|---|
| 85616312 | `0x741d2246…a62b` | question initialized, UMA request 1 |
| 89508637 | `0x34cef103…62a1` | request 1: `Yes` proposed |
| 89509500 | | read for vector 06: request 1 `PROPOSED`, condition unresolved |
| 89510574 | `0x850b0ba3…3c57` | request 1 disputed; adapter resets, opens request 2 |
| 89513671 | `0x02cfc7e4…fa41` | request 2: `No` proposed |
| 89518525 | `0x4f54a4e2…fdff` | request 2 settled at `No` |
| 89518530 | `0xbf29967c…bc94` | `QuestionResolved` and `ConditionResolution`, payouts `0,1`; read for vector 07 |

| File | Case | Expected |
|---|---|---|
| [`06-oracle-proposed.json`](test-vectors/06-oracle-proposed.json) | agent claimed `Yes`; record at `proposed`, block 89509500, score 100 | accept |
| [`07-oracle-final-supersedes.json`](test-vectors/07-oracle-final-supersedes.json) | same request at `final`, block 89518530, score 0, `supersedes` vector 06 | accept |
| [`08-proposed-presented-as-final.json`](test-vectors/08-proposed-presented-as-final.json) | vector 06's record written with tag `oracle-outcome:final` | reject: state and tag disagree |
| [`09-supersedes-wrong-hash.json`](test-vectors/09-supersedes-wrong-hash.json) | vector 07 re-signed with `supersedes` naming vector 01, another request | reject: supersede chain |
| [`10-tampered-outcome-state.json`](test-vectors/10-tampered-outcome-state.json) | vector 06 with `outcomeState` edited to `final` after signing | reject: bytes, signature, hash |
| [`11-final-claimed-at-proposed-block.json`](test-vectors/11-final-claimed-at-proposed-block.json) | correctly signed `final` at block 89509500 | offline accept; reject `--onchain` |

They are signed with the same RFC 8032 TEST 1 key as vectors 01 to 05: a public test key, never
Predge's production key. The block numbers, block hashes and transaction hashes are real; the
`ratee`, request and response URIs are placeholders.

```bash
node grounded-feedback/verify-test-vectors.mjs             # offline
node grounded-feedback/verify-test-vectors.mjs --onchain   # plus Polygon RPC re-read (RPC_URL)
python3 grounded-feedback/verify_test_vectors.py           # second verifier, offline
```

The same market is the conformance pair of the ERC-8404 oracle-outcome profile in
[`../erc8404-profile/oracle-outcome/`](../erc8404-profile/oracle-outcome/README.md).

## Open questions

1. Should `outcomeState` also distinguish a request sent to a UMA vote (second dispute) from a
   first dispute, or is `disputed` enough with `requestTimestamp` naming the request?
2. Is `tag = oracle-outcome:<state>` the right place for the state, or should ERC-8004 give
   responses a typed status next to the score?
3. Should a validator be required to write the `final` record, or may it stop at `proposed`?
