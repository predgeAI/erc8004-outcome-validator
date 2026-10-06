# x402-grounded-feedback-v0

A convention for ERC-8004 records that are grounded in a settled payment. It writes down the shape
that converged in [erc-8004/erc-8004-contracts#99](https://github.com/erc-8004/erc-8004-contracts/issues/99)
and needs no registry change: it uses the fields ERC-8004 v2.0.0 already has.

Status: draft v0, for discussion in #99. Written by Predge. This is not an ERC-8004 or maintainer
document, and every part of it can change.

## What a record claims

A grounded record lets a consumer check three things without trusting whoever wrote it:

1. A payment settled on chain: who paid whom, how much, in which asset, in which transaction.
2. Which agent the payment was for (`ratee`), kept separate from who received the money (`payee`).
3. How 1 and 2 were verified (`grounding`).

It does not say how much the record should count. Weighting (funding-graph clustering, reviewer
diversity, tenure) is a consumer policy and stays out of the record. A settlement contract deciding
inside a transaction and an off-chain indexer can read the same record and weight it differently.

## Record fields

Every value is a string, or an object of strings. Addresses and hex values are lower case. Hashes
and transaction hashes are `0x` plus 64 hex characters. Optional keys are omitted when absent,
never set to `null`. Unknown keys make the record invalid.

| Field | Required | Meaning |
|---|---|---|
| `scheme` | yes | `"x402-grounded-feedback-v0"` |
| `grounding` | yes | How the settlement is verified: `x402-settlement`, `escrow-release` or `settlement-contract` (see [Grounding methods](#grounding-methods)). |
| `payer` | yes | Address that paid. For x402 this is the EIP-3009 `from`. |
| `payee` | yes | Address that received the money. Payment evidence only: it is not the party being rated. |
| `ratee` | yes | The agent the record is about: `{ "agentRegistry": "eip155:<chainId>:<identityRegistry>", "agentId": "<decimal>" }`, ERC-8004's own global agent identifier. |
| `amount` | yes | Atomic units of `asset`, decimal, no sign, no leading zeros. |
| `asset` | yes | CAIP-19, e.g. `eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`. Its chain is where `settlementTx` lives. |
| `resource` | yes | What was bought: the x402 `resource` URL, or the job's URI for an escrow. |
| `nonce` | yes | Unique per settled interaction: the EIP-3009 authorization nonce for `x402-settlement`, the escrow's job id as bytes32 for `escrow-release`. |
| `settlementTx` | yes | The transaction that moved the money. |
| `escrow` | for `escrow-release` | Address of the escrow contract. |
| `requirementsHash` | no | x402 only: `0x` + sha256 of the canonical JSON of the `accepts[]` entry the payer accepted, exactly as the unpaid 402 returned it. |
| `issuedAt` | with `measured` | When the record was signed, `YYYY-MM-DDTHH:MM:SS.sssZ` with exactly three fractional digits: capacity-attest's strict `timestamp` form. |
| `assetType` | with `measured` | capacity-attest's `assetType`: `gpu-hours`, `storage`, `bandwidth` or `api-credits`. Present exactly when `measured` is. |
| `measured` | no | Metered delivery, as defined by capacity-attest (see [Metered delivery](#metered-delivery-measured)). |

Example (test vector 01; `payee` is a treasury, so it differs from the rated agent):

```json
{
  "scheme": "x402-grounded-feedback-v0",
  "grounding": "x402-settlement",
  "payer": "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  "payee": "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
  "ratee": { "agentRegistry": "eip155:8453:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432", "agentId": "42" },
  "amount": "5000",
  "asset": "eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  "resource": "https://api.example.com/v1/signal/0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
  "requirementsHash": "0xc4d3ba7824071c96df7270c740c724bf1a1d445d562625faa9cfab32e02a9b06",
  "nonce": "0x988234df687c4d4ea61ca7bacca3143d6a4ab117445813fd50bc03f61ae0e603",
  "settlementTx": "0x2222222222222222222222222222222222222222222222222222222222222222"
}
```

## Canonical bytes, signature, `responseHash`

- **Canonical bytes**: the record as JSON with object keys sorted by UTF-16 code units at every
  level (the RFC 8785 order), no whitespace, standard JSON string escaping, encoded as UTF-8. All
  keys in this schema are ASCII, and every leaf is a string, so no number formatting is involved.
- **Signature**: ed25519 (RFC 8032) by the attester over the canonical bytes themselves: not over
  `responseHash`, and not over a hex string.
- **`responseHash`** = `keccak256(canonical bytes)`: Ethereum's keccak256, not NIST SHA3-256.
- **`requirementsHash`** uses the same canonicalization. Its input is the x402 object as received,
  which can hold integers (`maxTimeoutSeconds`); they serialize as plain decimal digits, as in RFC 8785.

The attester publishes an envelope at `responseURI`:

```json
{
  "payload": { "...the record..." },
  "canonical": "{\"amount\":\"5000\",\"asset\":\"eip155:8453/erc20:0x8335…\",…}",
  "signature": "<128 hex: ed25519 signature>",
  "public_key": "<64 hex: raw ed25519 public key>",
  "algorithm": "ed25519"
}
```

A consumer canonicalizes `payload` itself and checks the result against `canonical`, the signature
and the on-chain hash. It must not verify `canonical` on its own. Test vector 03 is the case where
the two disagree. How a consumer learns which keys belong to an attester is out of scope for v0.

## Writing it to ERC-8004

The Validation Registry v2.0.0 already has every slot this needs. The registry is
`0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58` and its Identity Registry is
`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`. Both are at the same addresses on Ethereum, Base,
Arbitrum One, Celo and Arc, and `getVersion()` returns `2.0.0` on all five (read 2 October 2026 UTC).

1. The rated agent (owner of `ratee.agentId`) calls `validationRequest(validatorAddress, agentId, requestURI, requestHash)`.
2. The attester calls `validationResponse(requestHash, response, responseURI, responseHash, tag)` with:
   - `response`: the 0..100 score;
   - `responseURI`: the envelope;
   - `responseHash`: as above;
   - `tag`: the grounding method, e.g. `x402-settlement`.

A contract can check `tag` and `responseHash` locally. An off-chain consumer additionally verifies
the envelope and the settlement, and checks that `getValidationStatus(requestHash)` names the same
`agentId` as `ratee`. Mapping the same envelope onto the Reputation Registry's feedback URI and
hash is not written down yet (see [Open questions](#open-questions)).

## Verifying a record

1. Fetch the envelope from `responseURI`.
2. Canonicalize `payload` and check:
   - it equals `canonical`;
   - its `keccak256` equals the on-chain `responseHash`;
   - the ed25519 signature verifies under a key that belongs to the attester.
3. Check that `scheme` is the one above, `tag` equals `grounding`, and `ratee` matches the
   request's `agentId`.
4. Check the settlement on the chain of `asset`, by `grounding` (next section).
5. If `requirementsHash` is present, check two things against the 402 challenge it was taken from:
   - it is the hash of that challenge;
   - `amount`, `payee` (= `payTo`), `asset` and network all agree with it.
6. Count at most one record per settled interaction:
   - per (`asset`, `payer`, `nonce`) for `x402-settlement`;
   - per (`asset` chain, `escrow`, `nonce`) for `escrow-release`;
   - per `settlementTx` for `settlement-contract`.
7. Weight it with your own policy.

## Grounding methods

The `tag` says how the record was verified and nothing about how much it is worth.

| `tag` | What proves the settlement | Signature needed |
|---|---|---|
| `x402-settlement` | The `settlementTx` receipt has status 1, and its own logs include `AuthorizationUsed(payer, nonce)` and `Transfer(payer, payee, amount)`, both emitted by the asset contract. | yes |
| `escrow-release` | The `settlementTx` receipt has status 1, and its own logs include the `escrow` contract's release event for job `nonce` and the asset's `Transfer(escrow, payee, amount)`. | yes |
| `settlement-contract` | The validator is the settlement contract itself. It calls `validationResponse` in the same transaction that pays, so one receipt holds both the `Transfer` to `payee` and the registry's `ValidationResponse` event. The record could not exist without the settlement. | no |

Take both logs from the `settlementTx` receipt itself, never from a scan of the block or a time
window. `Transfer` carries no nonce, so a check that finds the two events anywhere in a block
would accept a real `AuthorizationUsed` next to an unrelated transfer of the same amount. Take
`payee` from the record, not from the log: a verifier who is not the payee has no other source
for it, and a check of `Transfer(payer, any, amount)` would pass a settlement to an address the
payer chose.

Match logs by the asset's address, not by `tx.to`, because facilitators often settle through a
multicall. A real x402 settlement on Base shows the shape: in
[`0x3a23f578…0c68`](https://basescan.org/tx/0x3a23f578aad5346f67689e96d8d8f35a2d3d008b23491d6f7334410b4a8b0c68),
`tx.to` is Multicall3, and the two logs, both from USDC, are:
- `AuthorizationUsed(0x718b…0bd6, 0x035f…7f45)`;
- `Transfer(0x718b…0bd6 → 0x9084…1144, 5000)`.

## Rules from the thread

- **`ratee` is its own field** (@MuhammedAkinci, @filip-study). With transferable payouts, a
  treasury `payTo`, or receivables sold before settlement, the payee is often not the agent that
  did the work. A grounded record keyed on `payee` passes every check and still credits the wrong
  party.
- **The tag records the verification method; weight is consumer policy** (@MuhammedAkinci,
  @vadium-dev). Payment proof makes a single fake reviewer costly, but not a funded cluster: one
  wallet can fund N reviewers who each pay. Independence weighting over the funding graph is the
  consumer's job and is not encoded in the record.
- **One interaction, at most one record** (@MuhammedAkinci). Producers guard every write path per
  job; consumers count one record per settled interaction, as above.
- **Hash the unpaid runtime challenge, not the static manifest** (@filip-study, @MuhammedAkinci).
  That is why `requirementsHash` is defined over the `accepts[]` entry as the 402 returned it. For
  Base USDC, the EIP-712 `extra.name` there is `USD Coin`.
- **`measured` keeps capacity-attest's rules** (@holistis). `assetType` sits next to `measured`, and
  `issuedAt` uses the strict timestamp form, so a record cannot be looser than the claim it maps.
- **Both logs from one receipt, payee from the record** (@goun7, in
  [coinbase/x402#360](https://github.com/coinbase/x402/pull/360)). The settlement check is scoped
  to `settlementTx`, and `payee` is a required field, so a third party can run it.
- **Registry writes are advisory** (@MuhammedAkinci). A settlement contract should catch a failed
  registry write and emit an event rather than revert the payment. The write is not free: Wiener
  Labs measured about 48,000 extra gas per finalize against the real registries (465,486 versus
  417,852).

## Metered delivery: `measured`

The `measured` block comes from [capacity-attest](https://github.com/holistis/tokenizen/tree/15442769d12734cfc62da3afc711bb8dda03f48f/packages/capacity-attest)
by @holistis (MIT). Its definition, its strictness rules and its unit table are the ones in
[`docs/metered-delivery-spec.md`](https://github.com/holistis/tokenizen/blob/15442769d12734cfc62da3afc711bb8dda03f48f/packages/capacity-attest/docs/metered-delivery-spec.md),
pinned at commit `15442769d12734cfc62da3afc711bb8dda03f48f`. Their self-contained test vector is
[`examples/metered-claim-testvector.json`](https://github.com/holistis/tokenizen/blob/15442769d12734cfc62da3afc711bb8dda03f48f/packages/capacity-attest/examples/metered-claim-testvector.json)
at the same commit. That repository is the source of truth for the metered case, and this
document references it rather than restating it:

```json
"measured": {
  "unit": "gpu-second", "basis": "supplied", "promisedAmount": "28800", "deliveredAmount": "25230",
  "period": { "start": "2026-09-01T04:00:00Z", "end": "2026-09-01T08:00:00Z" },
  "method": { "attribution": "buyer", "instrument": "nvidia-smi accounting, 10s polling, job 8f21a3", "readingsHash": "0d08539780ad082368c65079bf21cc1daaf62617549d20d5a304cc551248021d" }
}
```

Two capacity-attest rules check `measured` against fields of its own claim. The record carries
the same fields under the same rules:
- **`assetType`** is a record field, required with `measured`. `measured.unit` must be in its row
  of the unit table, so a `byte` record says whether it is storage or bandwidth.
- **`timestamp`** becomes `issuedAt`, in the same strict form `YYYY-MM-DDTHH:MM:SS.sssZ`. The first
  19 characters of `period.end` must not be later than the first 19 characters of `issuedAt`.

## Test vectors

| File | Case | Expected |
|---|---|---|
| [`01-x402-settlement.json`](test-vectors/01-x402-settlement.json) | x402 payment to a treasury `payTo`, with `requirementsHash` and the 402 `requirements` it came from | accept |
| [`02-escrow-release.json`](test-vectors/02-escrow-release.json) | escrowed job paid on release | accept |
| [`03-tampered-amount.json`](test-vectors/03-tampered-amount.json) | vector 01 with `amount` edited after signing | reject: canonical bytes, signature, `responseHash` and the requirements check all fail |
| [`04-metered-gpu.json`](test-vectors/04-metered-gpu.json) | x402 payment for metered GPU time, with `measured`, `assetType` and `issuedAt` | accept |
| [`05-unit-not-in-asset-type.json`](test-vectors/05-unit-not-in-asset-type.json) | correctly signed, but `unit` is `byte` under `assetType` `gpu-hours` | reject: the schema check fails, everything else holds |
| `06` to `12` | oracle-outcome-validation-v0 on Polymarket market 1992979, see [oracle-outcome.md](oracle-outcome.md#test-vectors-polymarket-market-1992979) | 06, 07 accept; 08 to 12 reject (12: `settled_not_resolved`) |

Each file carries:
- the record, the envelope, the exact canonical string and its byte length;
- the `responseHash` and the `validationResponse` arguments with ABI-encoded calldata;
- an `expect` block and notes on the likely mistakes.

They are signed with the RFC 8032 section 7.1 TEST 1 key, which is public and was never used for
anything real. Every settlement transaction in vectors 01 to 05 is a placeholder; the on-chain
references in vectors 06 to 11 are real. capacity-attest (linked above)
tests its own rules for the `measured` block; vectors 04 and 05 test only the two fields this
record maps them onto.

```bash
npm ci
node grounded-feedback/verify-test-vectors.mjs       # Node: node:crypto + ethers
node grounded-feedback/verify-test-vectors.mjs --onchain   # plus Polygon RPC re-read of 06 to 12
python3 grounded-feedback/verify_test_vectors.py     # Python: cryptography + pycryptodome
node grounded-feedback/make-test-vectors.mjs         # regenerate; output is byte-identical
```

The two verifiers share no code with each other or with the generator, and both report GREEN on
all eleven vectors, including the negative ones (each vector's `expect` block says which checks
must fail).

## Oracle outcome validation: `outcomeState`

Outcome validators that read an optimistic oracle use a sibling document,
[`oracle-outcome-validation-v0`](oracle-outcome.md), with the same canonical bytes, signature and
`responseHash` rules. It binds the oracle's lifecycle state (`proposed`, `disputed`, `final`) and
the oracle reference that was read (contract, question and request, chain, block, block hash and
the state-changing transaction), and defines how a later `final` record supersedes an earlier one.
Vectors 06 to 11 use one real Polymarket market on Polygon; `--onchain` re-reads them over RPC.

## Open questions

1. Should `ratee` reference the Identity Registry `agentId`, our preference because it survives key
   rotation, or an address?
2. Is `tag` the right slot for the grounding method, or should it live inside the response
   document so `tag` stays free for application use?
3. Should the same envelope be the feedback document in the Reputation Registry, with
   `feedbackHash = keccak256(canonical bytes)`?
