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

## Broadcasting to a testnet (owner only)

Needs a **funded key**, a **registered `agentId`** you own, and the **deployed registry
address** on your chosen testnet. Supported testnet chainIds (from the reference repo)
include **Base Sepolia 84532**, **Sepolia 11155111**, and **Arc testnet 5042002** (Predge
already deploys on Arc). The registry is a per-chain singleton (CREATE2/vanity) — get the
address from `erc-8004/erc-8004-contracts` (README / `scripts/addresses.ts`) or the chain explorer.

```bash
export RPC_URL='https://sepolia.base.org'            # or your testnet RPC
export PRIVATE_KEY='0x…'                              # funded; owns AGENT_ID; is the validator
export VALIDATION_REGISTRY='0x…'                      # deployed registry on that chain
export AGENT_ID='…'                                   # an agentId you own in the Identity Registry
export CONFIRM_TESTNET=yes
npm run fire
```

The script refuses mainnet chainIds and refuses without `CONFIRM_TESTNET=yes`. It prints
the tx hashes and reads the record back, confirming `responseHash` matches the signed attest.
Prerequisite: register an agent in the Identity Registry first (so `ownerOf(agentId)` is your key).

## Next step (outreach — owner-gated)

This is the **artifact** the EF/ERC-8004 outreach was gated on (see
`briefs/predge-ethereum-ef-buterin-prep.md`). Once a real testnet tx exists, the credible
contact path is a concrete validator-method proposal in the ERC-8004 GitHub / Ethereum
Magicians thread to **Davide Crapis / the EF dAI team** — not a cold DM, not Vitalik. Send is owner's call.
