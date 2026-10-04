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

**Status: deployment pending faucet funding of the deployer
[`0x9F0Af03C5695b72903c03852f7Dd4Fe5A0d49Fc9`](https://testnet.monadvision.com/address/0x9F0Af03C5695b72903c03852f7Dd4Fe5A0d49Fc9).**
Addresses and transaction links go here once the contracts are live.

What gets deployed (same audited builds as Arbitrum One, Robinhood Chain and Arc, byte-for-byte):

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
