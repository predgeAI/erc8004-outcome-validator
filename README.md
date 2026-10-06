# predge-erc8004-validator

Predge as an **ERC-8004 Validation Registry validator** — the *real-world-resolution-vs-claim* method.

## Why this exists (the honest thesis)

ERC-8004's Validation Registry lets any address be a validator and write a `0..100`
response for an agent's work. The existing validators check **code/work correctness**
(stake-secured re-execution, zkML, TEE oracles) or **deliverable outcome** (UFX/ERC-8183:
"did the agent deliver the job"). **None** verify that a *resolved real-world outcome*
(a market resolution, a sports result, a settled fact) actually **matched the claim an
agent sold or acted on.** That is Predge's slot: a signed, independently-verifiable
attestation of resolved-outcome-vs-claim, written into the 8004 registry.

This is **not a new protocol** — it's one validator *method* plugged into ERC-8004
(single-address validator today; composable with ERC-8294 validator networks later).

## What's proven here (offline, no chain, no funds)

`npm run prove` → **GREEN**. For both a TRUE and a FALSE claim it shows:

- a Predge **ed25519 outcome-attestation** that verifies offline (and a tampered one is rejected);
- the exact **`validationResponse(...)` calldata** encoded against the **real** vendored ABI
  (`abi/ValidationRegistry.json`, from `erc-8004/erc-8004-contracts@master`);
- the on-chain **`responseHash == keccak256(signed canonical)`** — the registry record is
  cryptographically bound to the exact signed payload;
- an **honest score**: 100 when the resolved outcome matched the claim, 0 when it didn't;
- calldata that **round-trips** through the real ABI decoder.

So: same claim → same `requestHash`; different reality → different `responseHash`. The
score can never silently drift from the signed evidence.

## The real flow (per `ValidationRegistryUpgradeable.sol`)

1. **Agent** (owner of `agentId` in the Identity Registry) calls
   `validationRequest(validatorAddress, agentId, requestURI, requestHash)` — names Predge
   as validator, commits the claim as `requestHash`.
2. **Predge** (`msg.sender == validatorAddress`) calls
   `validationResponse(requestHash, response, responseURI, responseHash, tag)` —
   `response` = 0..100 match score, `responseURI` = the signed attest, `responseHash` = its keccak256,
   `tag` = `predge:resolved-outcome-vs-claim`.

## Files

| File | What |
|---|---|
| `src/attest.mjs` | Predge ed25519 + canonical-JSON primitive (mirror of predge-x402-api) |
| `src/map-to-validation.mjs` | attest → 8004 request/response calldata (real ABI) |
| `src/prove.mjs` | offline GREEN proof (`npm run prove`) |
| `src/fire-testnet.mjs` | **owner-run** broadcast to a testnet (`npm run fire`) |
| `abi/ValidationRegistry.json` | the REAL registry ABI, vendored |
| `monad/smoke.mjs` | Monad testnet smoke run on the deployed Predge contracts + canonical ERC-8004 registries |
| `grounded-feedback/README.md` | x402-grounded-feedback-v0: payment-grounded ERC-8004 records (draft, [#99](https://github.com/erc-8004/erc-8004-contracts/issues/99)) |
| `grounded-feedback/test-vectors/` | signed test vectors with expected `responseHash` and calldata |
| `grounded-feedback/verify-test-vectors.mjs`, `verify_test_vectors.py` | two independent verifiers, Node and Python (`npm run verify-vectors`) |
| `grounded-feedback/make-test-vectors.mjs` | deterministic generator (`npm run vectors`) |
| `grounded-feedback/oracle-outcome.md` | oracle-outcome-validation-v0: `outcomeState`, the bound oracle reference, and superseding (vectors 06 to 12, one real Polymarket market) |
| `grounded-feedback/evidence/` | raw Polygon facts behind those vectors, from `tools/collect-uma-ctf.mjs` |
| `erc8404-profile/oracle-outcome/` | ERC-8404 (RVR) Verification Profile for oracle outcomes, with the proposed/final conformance pair on the same market |

## Broadcasting to a testnet (owner only) — turnkey

The ERC-8004 registries are CREATE2 singletons at the **same address on every testnet**
(Base Sepolia 84532, Sepolia 11155111, Arb Sepolia 421614, …), so all you need is an RPC
and a **funded key** (a little testnet ETH for gas). The script auto-registers an agentId
and uses the known registry addresses — no addresses/agentId to look up.

```bash
export RPC_URL='https://sepolia.base.org'      # Base Sepolia
export PRIVATE_KEY='0x…'                        # a key with a little Base Sepolia ETH
export CONFIRM_TESTNET=yes
npm run fire
```

It: registers an agentId (`IdentityRegistry` `0x8004A818…`), commits the claim
(`validationRequest`), writes the outcome-match `validationResponse` on the
`ValidationRegistry` (`0x8004Cb1B…4272`), reads it back to confirm `responseHash` matches
the signed attest, and **prints the explorer link** for the response tx. Refuses mainnet
chainIds and refuses without `CONFIRM_TESTNET=yes`. Base Sepolia ETH faucet:
https://www.alchemy.com/faucets/base-sepolia

## Monad testnet (Monad Metropolis hackathon)

Chain: Monad Testnet, chain id `10143`, RPC `https://testnet-rpc.monad.xyz`, explorer
[testnet.monadvision.com](https://testnet.monadvision.com). Testnet only; MON on testnet has no value.

**Live since 2026-10-05.** Deployer/validator
[`0x9F0Af03C5695b72903c03852f7Dd4Fe5A0d49Fc9`](https://testnet.monadvision.com/address/0x9F0Af03C5695b72903c03852f7Dd4Fe5A0d49Fc9). All four contracts are verified on Sourcify
(exact match, shown on MonadVision) and `verify.mjs` passed: runtime byte-for-byte equal to the
audited builds, roles, and the dispute-window fix probes.

| Contract | Address | |
|---|---|---|
| `PredgeAgentValidator` | [`0x884764736dBe1FD36291bDd3Afd50A75465F6e8A`](https://testnet.monadvision.com/address/0x884764736dBe1FD36291bDd3Afd50A75465F6e8A) | [deploy tx](https://testnet.monadvision.com/tx/0x4bf5f70a90c102502dfe61bae7ef71f5ecad701dfde7477994952a1e857ba770) |
| `AgentJob` | [`0x34F1ef2f39Bfdd6c10Fcaa02f5B257A5dB2e93E9`](https://testnet.monadvision.com/address/0x34F1ef2f39Bfdd6c10Fcaa02f5B257A5dB2e93E9) | [deploy tx](https://testnet.monadvision.com/tx/0xca2e25323bfe87f6cc54669298ec0a75933832073dd17564b8dad18b84809686) |
| `PredgeValidatorBond` | [`0x0fE4D5fF3f4392bEC36c8003079E31102a403E84`](https://testnet.monadvision.com/address/0x0fE4D5fF3f4392bEC36c8003079E31102a403E84) | [deploy tx](https://testnet.monadvision.com/tx/0x5626ebf0aa10d42a9a3d1ac466a6630eb3b8a6ba8204dbb1c0a0b6904b9fe3c9) |
| `PredgeSettlement` | [`0xf4EE0Af65804D5754E59316b3DBB53D5c3AeeeF9`](https://testnet.monadvision.com/address/0xf4EE0Af65804D5754E59316b3DBB53D5c3AeeeF9) | [deploy tx](https://testnet.monadvision.com/tx/0xfea38d078481884dc13a4dc00d063fb4d58edc3df3e6f48e92c088949ee0071b) |

Smoke run on 2026-10-05 (agentId `2003` in the canonical ERC-8004 IdentityRegistry):

| Step | Tx |
|---|---|
| 1 validationRequest (Predge) | [`0x95b06acc…`](https://testnet.monadvision.com/tx/0x95b06acc13ffd118cbb39d2353431aa0f4cb36001fe71ec63a0373f655cc6f52) |
| fund provider gas | [`0x5a4dfa98…`](https://testnet.monadvision.com/tx/0x5a4dfa986eef4c2d71459eae88fb64f0c5c8a0c2f4a442fb89777ec14763d1da) |
| 2 createJob (escrow) | [`0x1fd80161…`](https://testnet.monadvision.com/tx/0x1fd8016125af780b31c7de7ad5d0b2fedea1ddff3fa92cead54475cd634df224) |
| 3 stakeAndCommit (bond) | [`0x09fe44dc…`](https://testnet.monadvision.com/tx/0x09fe44dc165fe63850762f1a743bff1f9892266348f83665f8c0542da30b1141) |
| 4 submit (provider key) | [`0xce7db23a…`](https://testnet.monadvision.com/tx/0xce7db23a206c372fb74825c0989f2b68f9a0454b1ea33f8d95576e777d42bfc4) |
| 5 validationResponse (verdict 100) | [`0x80aea2ea…`](https://testnet.monadvision.com/tx/0x80aea2ea52ddb0583052d12ad6e93e727f874c3987701d39484b8e6f9a9229a0) |
| 6 recordScore (verdict behind bond) | [`0x40e803d4…`](https://testnet.monadvision.com/tx/0x40e803d4274c2857a785a00344cb8084e307593e50799e13100ff711d270b50b) |
| 7 complete (escrow released) | [`0xd985d51f…`](https://testnet.monadvision.com/tx/0xd985d51f9cd406905f2e4a969646c0367bbbf86c1e7a35691db230f17936398e) |
| 8 payForRoute (pay-per-call) | [`0x9cd46a44…`](https://testnet.monadvision.com/tx/0x9cd46a446a185349b0d3977ee58446b14d5da6a639654c9c82b0a9b09772a63a) |
| 9 ERC-8004 IdentityRegistry.register | [`0x815041cb…`](https://testnet.monadvision.com/tx/0x815041cb953d1de1c55c63f405e3a22134b19304bfa14e446cce2705fad2e80c) |
| 10 ERC-8004 validationRequest | [`0x44c62cb8…`](https://testnet.monadvision.com/tx/0x44c62cb86d999f32f5256848e77ecc433828755c0ba6ae3adf01c1c9f9797977) |
| 11 ERC-8004 validationResponse | [`0x3bb93717…`](https://testnet.monadvision.com/tx/0x3bb937170050e5fc6eaa65e7213da5f6ad66c7d867a04f47ba7dd8a495f9c274) |

After step 6 the bond holds 0.01 MON behind verdict 100, `wouldSlash` is false and a simulated
`challenge()` reverts `VerdictHonest()`. The ERC-8004 record reads back with
`responseHash == keccak256(signed bytes)`. Receipts: `monad/smoke-*.json`, deployment: `monad/deployment.json`.

What is deployed (same audited builds as Arbitrum One, Robinhood Chain and Arc, byte-for-byte):

| Contract | Role |
|---|---|
| `PredgeAgentValidator` | ERC-8004-style validation request/response, 0..100 verdict bound to a signed record |
| `AgentJob` | escrowed job: client, provider, evaluator |
| `PredgeValidatorBond` | validator bond behind each verdict; challengeable for 24 h counted from the verdict |
| `PredgeSettlement` | pay-per-call receipts |

The canonical ERC-8004 `IdentityRegistry` (`0x8004A818…D9e`) and `ValidationRegistry`
(`0x8004Cb1B…4272`) singletons are also live on Monad testnet; the smoke run writes the same verdict there.

Smoke run (`monad/smoke.mjs`): fetches the signed Settlement Risk evidence pack from
data.predge.io, verifies ed25519 and sha256 offline, then on chain: validation request, job with
escrow, bond, provider submit (separate key), verdict 100, verdict recorded behind the bond, job
completed, pay-per-call receipt, then an ERC-8004 agent registration plus request and response on the
canonical registries, read back with `responseHash == keccak256(signed bytes)`. It also simulates a
challenge against the honest verdict, which reverts `VerdictHonest()`.

```bash
node monad/smoke.mjs                                # read-only preflight
CONFIRM_TESTNET=yes node monad/smoke.mjs --send     # broadcast (keys from ~/.predge-monad/monad-testnet.env)
RUN_TAG=demo2 CONFIRM_TESTNET=yes node monad/smoke.mjs --send   # a re-run needs a fresh request (one bond per request)
```

Honest limits: the evidence pack in the demo is signed with a throwaway prototype key, not Predge's
production key. Client and validator are one key in the demo; the provider is a separate key. A slash
only happens when a verdict contradicts what the provider committed on chain, so the honest demo
flow never slashes.

## Grounded feedback: x402-grounded-feedback-v0

[`grounded-feedback/`](grounded-feedback/README.md) writes down the payment-grounded record shape
discussed in [erc-8004/erc-8004-contracts#99](https://github.com/erc-8004/erc-8004-contracts/issues/99).
A record proves that a payment settled, names the rated agent separately from the payee, and says
how it was verified. It maps onto `validationResponse` with no registry change. The folder also
holds test vectors and two independent verifiers:

```bash
npm ci
npm run verify-vectors                            # Node
python3 grounded-feedback/verify_test_vectors.py  # Python
```

## License

MIT, see [LICENSE](LICENSE).
