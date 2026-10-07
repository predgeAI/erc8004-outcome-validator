# Predge: settlement risk for agents that act on prediction-market outcomes

Prediction markets settle through optimistic oracles, and disputes are common. From 1 Jan to
2 Oct 2026 Predge counted **3,005 disputes on 2,666 Polymarket markets**; 323 markets were disputed
twice or more. Of the 2,543 settled disputed markets, **853 (33.5%) settled differently from the
disputed proposal**. The median time from the first dispute to the on-chain resolution was 3.3 h,
and 88.5 h after a second dispute.

An agent that acts on a proposed outcome before final settlement carries that risk. Predge gives it
two things it can check without trusting us:

1. **Signed evidence.** A per-market Settlement Risk record (dispute history, on-chain resolution,
   bulletin-board updates), served as ed25519-signed canonical JSON from
   `https://api.predge.io/v1/settlement-risk/<market_id>` and verifiable offline.
2. **A verdict on chain, with money behind it.** Predge writes a 0..100 verdict whose
   `responseHash` is the keccak256 of the signed evidence, and can stake a bond behind it. If a
   bonded verdict contradicts what the provider committed on chain, anyone can slash the bond,
   within a dispute window counted from the verdict.

This repository is Predge's submission to the **Monad Metropolis hackathon, Track 4 (Trust,
Identity and AI Infrastructure)**. Everything below runs on **Monad testnet (chain 10143)**.

Target user: builders of agents, trading and signal bots, and protocols that act on or settle
against prediction-market outcomes. Revenue today is $0; there are no paying customers yet.

## Contents

- [What is live on Monad testnet](#what-is-live-on-monad-testnet)
- [Architecture](#architecture)
- [Why Monad](#why-monad)
- [Setup and reproduction](#setup-and-reproduction)
- [Pre-existing vs built during the hackathon (1 Sep to 13 Oct)](#pre-existing-vs-built-during-the-hackathon-1-sep-to-13-oct)
- [Repository layout](#repository-layout)
- [Honest limits](#honest-limits)
- [AI tools disclosure](#ai-tools-disclosure)
- [License](#license)

## What is live on Monad testnet

Chain: Monad Testnet, chain id `10143`, RPC `https://testnet-rpc.monad.xyz`, explorer
[testnet.monadvision.com](https://testnet.monadvision.com). Testnet MON has no value.

Deployer and validator: [`0x9F0Af03C5695b72903c03852f7Dd4Fe5A0d49Fc9`](https://testnet.monadvision.com/address/0x9F0Af03C5695b72903c03852f7Dd4Fe5A0d49Fc9).
All four contracts are verified on Sourcify (exact match, shown on MonadVision). Their sources are in
[`monad/contracts/`](monad/contracts/SOURCES.md), and `node monad/contracts/check-bytecode.mjs`
recompiles them and compares the result with the live code byte for byte.

| Contract | Address | Role |
|---|---|---|
| `PredgeAgentValidator` | [`0x884764736dBe1FD36291bDd3Afd50A75465F6e8A`](https://testnet.monadvision.com/address/0x884764736dBe1FD36291bDd3Afd50A75465F6e8A) | ERC-8004 style validation request and response; the request is recorded before the verdict, the verdict is written once |
| `AgentJob` | [`0x34F1ef2f39Bfdd6c10Fcaa02f5B257A5dB2e93E9`](https://testnet.monadvision.com/address/0x34F1ef2f39Bfdd6c10Fcaa02f5B257A5dB2e93E9) | escrowed job (ERC-8183 style): client, provider, evaluator |
| `PredgeValidatorBond` | [`0x0fE4D5fF3f4392bEC36c8003079E31102a403E84`](https://testnet.monadvision.com/address/0x0fE4D5fF3f4392bEC36c8003079E31102a403E84) | bond behind a verdict; slashable by anyone if the verdict contradicts the provider's on-chain commitment, within a 24 h dispute window counted from the verdict |
| `PredgeSettlement` | [`0xf4EE0Af65804D5754E59316b3DBB53D5c3AeeeF9`](https://testnet.monadvision.com/address/0xf4EE0Af65804D5754E59316b3DBB53D5c3AeeeF9) | pay-per-call receipts |

ERC-8004 registries used on Monad testnet:

- `IdentityRegistry` [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://testnet.monadvision.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e): canonical (listed in `erc-8004/erc-8004-contracts`).
- `ReputationRegistry`: canonical; not written to by this submission.
- `ValidationRegistry` at [`0x8004Cb1BF31DAf7788923b405b754f57acEB4272`](https://testnet.monadvision.com/address/0x8004Cb1BF31DAf7788923b405b754f57acEB4272): a deployment of the reference ValidationRegistry code exists at this address and the smoke run writes to it, but it is **not** listed as canonical for Monad testnet (Monad's docs say the Validation Registry is coming soon). We treat it as a reference deployment only.

### Smoke run

2026-10-05, 11 transactions, one full accountability loop: request, escrowed job, bond, provider
submit with a separate key, verdict 100, verdict recorded behind the bond, job completed,
pay-per-call receipt, then an ERC-8004 agent registration (agentId `2003`) and a request and
response read back with `responseHash == keccak256(signed bytes)`. Receipts:
[`monad/smoke-2026-10-05T08-05-41-255Z.json`](monad/smoke-2026-10-05T08-05-41-255Z.json).

| Step | Tx |
|---|---|
| 1 validationRequest (Predge) | [`0x95b06acc…`](https://testnet.monadvision.com/tx/0x95b06acc13ffd118cbb39d2353431aa0f4cb36001fe71ec63a0373f655cc6f52) |
| 2 createJob (escrow) | [`0x1fd80161…`](https://testnet.monadvision.com/tx/0x1fd8016125af780b31c7de7ad5d0b2fedea1ddff3fa92cead54475cd634df224) |
| 3 stakeAndCommit (bond) | [`0x09fe44dc…`](https://testnet.monadvision.com/tx/0x09fe44dc165fe63850762f1a743bff1f9892266348f83665f8c0542da30b1141) |
| 4 submit (provider key) | [`0xce7db23a…`](https://testnet.monadvision.com/tx/0xce7db23a206c372fb74825c0989f2b68f9a0454b1ea33f8d95576e777d42bfc4) |
| 5 validationResponse (verdict 100) | [`0x80aea2ea…`](https://testnet.monadvision.com/tx/0x80aea2ea52ddb0583052d12ad6e93e727f874c3987701d39484b8e6f9a9229a0) |
| 6 recordScore (verdict behind bond) | [`0x40e803d4…`](https://testnet.monadvision.com/tx/0x40e803d4274c2857a785a00344cb8084e307593e50799e13100ff711d270b50b) |
| 7 complete (escrow released) | [`0xd985d51f…`](https://testnet.monadvision.com/tx/0xd985d51f9cd406905f2e4a969646c0367bbbf86c1e7a35691db230f17936398e) |
| 8 payForRoute (pay-per-call) | [`0x9cd46a44…`](https://testnet.monadvision.com/tx/0x9cd46a446a185349b0d3977ee58446b14d5da6a639654c9c82b0a9b09772a63a) |
| 9 ERC-8004 IdentityRegistry.register | [`0x815041cb…`](https://testnet.monadvision.com/tx/0x815041cb953d1de1c55c63f405e3a22134b19304bfa14e446cce2705fad2e80c) |
| 10 ValidationRegistry.validationRequest | [`0x44c62cb8…`](https://testnet.monadvision.com/tx/0x44c62cb86d999f32f5256848e77ecc433828755c0ba6ae3adf01c1c9f9797977) |
| 11 ValidationRegistry.validationResponse | [`0x3bb93717…`](https://testnet.monadvision.com/tx/0x3bb937170050e5fc6eaa65e7213da5f6ad66c7d867a04f47ba7dd8a495f9c274) |

### Slash demo

2026-10-07, four separate keys: a dishonest validator bonds 0.01 MON behind the test "deliver
Predge's signed record for market 2169995", the provider delivers a tampered copy, the validator
records verdict 100 anyway, and a third party calls `challenge()`. The bond is slashed to the
challenger in the same flow, within the dispute window counted from the verdict. Bond instance
[`0x95652b86…9Bc2`](https://testnet.monadvision.com/address/0x95652b86c10Eb0E012b22E08dBC98481d4a19Bc2)
(Sourcify exact match), dishonest verdict
[`0xb46e399a…`](https://testnet.monadvision.com/tx/0xb46e399a74ebd9a9ed1d79a6d65dbedcdce885091ab5115f825836424be27faa),
slash
[`0x96f861d0…`](https://testnet.monadvision.com/tx/0x96f861d0c7810e5687d6694899ce70994e90e86233c12362b19fad118b0184ab).
Details and every tx: [`monad/slash/`](monad/slash/README.md).

## Architecture

```
            Polygon: UMA Optimistic Oracle + Polymarket UMA CTF adapter
                                  |  eth_call / eth_getLogs
                                  v
   api.predge.io /v1/settlement-risk/<market>  ->  ed25519-signed canonical JSON record
                                  |
        agent fetches the record, verifies it offline, decides whether to act
                                  |
   ------------------------- Monad testnet (10143) -------------------------
   |                                                                        |
   | agent key   PredgeAgentValidator.validationRequest(requestHash=claim)  |
   | Predge key  PredgeAgentValidator.validationResponse(score 0..100,      |
   |             responseHash = keccak256(signed record bytes))             |
   |                                                                        |
   | bonded path AgentJob.createJob (escrow)                                |
   |             -> PredgeValidatorBond.stakeAndCommit (validator)          |
   |             -> AgentJob.submit (provider key)                          |
   |             -> PredgeValidatorBond.recordScore (verdict)               |
   |             -> challenge(): anyone, slashes iff the verdict            |
   |                contradicts the provider's commitment, within the       |
   |                window counted from the verdict; else reclaim()         |
   |                                                                        |
   | ERC-8004    IdentityRegistry (agentId); ValidationRegistry reference   |
   | payments    PredgeSettlement receipts                                  |
   --------------------------------------------------------------------------
```

Trust boundary: ed25519 verification is too expensive on chain, so the validator checks the
signature off chain and commits `responseHash`. The chain enforces that the request precedes the
verdict and that a verdict is written once. Anyone can recompute `responseHash` from the published
signed record and compare it with the chain.

Stack: Solidity 0.8.26 (no external libraries), Node.js 20 with ethers v6, solc-js for the
reproducible build, Python 3 for the second verifier and the ERC-8404 profile gate.

## Why Monad

Agents make many small decisions, and each verdict is a write that has to land quickly and cheaply
next to the decision it informs. Monad fits that loop:

- **Fast blocks.** Monad documents ~0.4 s block times, so a verdict is readable on chain within
  seconds of the decision it backs.
- **No global mempool, nonces per sender.** Many agents can post requests in parallel from their
  own keys without contending for one queue.
- **Gas is charged on the gas limit, not gas used.** Our scripts set the limit to the estimate plus
  a small margin for every transaction; this is a Monad-specific detail that matters for cost.
- **Official x402 facilitator on Monad** with testnet USDC, so an agent can pay per call in USDC
  without holding MON.
- **ERC-8004 Identity and Reputation registries are canonical on Monad testnet**, so a Predge
  verdict can sit next to the agent identity other Monad apps already read.

## Setup and reproduction

Requirements: Node.js 20+, npm, Python 3 (only for the Python verifier). No key is needed for the
read-only checks.

```bash
git clone https://github.com/predgeAI/erc8004-outcome-validator
cd erc8004-outcome-validator
npm ci

# read-only, no key
node monad/contracts/check-bytecode.mjs   # sources == live code on Monad testnet
node monad/smoke.mjs                      # preflight: contracts live, evidence pack verifies offline
npm run prove                             # offline proof of the attestation -> validationResponse mapping
npm run verify-vectors                    # grounded-feedback test vectors (Node)
```

To send transactions you need a Monad testnet key with some MON (faucet: https://faucet.monad.xyz).
Put keys in a `KEY=VALUE` file with mode 600 (default `~/.predge-monad/monad-testnet.env`):
`PRIVATE_KEY` (client and validator) and `PROVIDER_PRIVATE_KEY` (a separate provider key).
Scripts never print keys and refuse any chain id other than 10143.

```bash
# your own fresh stack (dry run first)
node monad/contracts/deploy.mjs
CONFIRM_TESTNET=yes node monad/contracts/deploy.mjs --send

# a full loop on the deployed contracts (point monad/deployment.json at your own stack)
RUN_TAG=mytest CONFIRM_TESTNET=yes node monad/smoke.mjs --send
```

## Pre-existing vs built during the hackathon (1 Sep to 13 Oct)

Metropolis allows pre-existing code if it is listed and the submission adds substantial new work.
Dates come from git history.

**Pre-existing (before 1 Sep 2026):**

| Component | Where | Date |
|---|---|---|
| `PredgeSettlement` contract | predgeAI/predge-arc | 2026-08-03 |
| `PredgeAgentValidator`, `AgentJob`, `PredgeValidatorBond` v1 | predgeAI/predge-arc | 2026-08-14 |
| Port of those contracts to Robinhood Chain | predgeAI/predge-robinhood | 2026-08-17 |
| This repo's first version: ed25519 attestation to ERC-8004 `validationResponse` mapping (`src/`) | this repo | 2026-07-31 and 2026-08-01 |
| x402 pay-per-call API on Base (whale data routes) | predge-x402-api, not part of this repo | before September |

**Built during the hackathon window:**

| Component | Date |
|---|---|
| `PredgeValidatorBond` v2: the challenge reads the deliverable from the job contract, so a challenger cannot supply bytes | 2026-09-18 |
| `PredgeValidatorBond` v2.1: dispute window counted from the verdict, not from the stake | 2026-10-03 |
| Settlement Risk dataset (3,005 disputes on 2,666 markets) and the signed `/v1/settlement-risk/<market>` route | September to October |
| x402-grounded-feedback-v0 schema, test vectors, Node and Python verifiers (`grounded-feedback/`) | 2026-10-03 |
| Monad testnet deployment of the four contracts, Sourcify verification, smoke run with ERC-8004 records (`monad/`) | 2026-10-05 |
| Oracle outcome state and superseding, ERC-8404 oracle-outcome verification profile (`erc8404-profile/`) | 2026-10-05 to 2026-10-07 |
| Contract sources in this repo, reproducible build check, deploy script (`monad/contracts/`) | 2026-10-07 |
| Batch of verdicts on historical disputed markets, slash demo, x402 on Monad, verdict board | from 2026-10-07 |

## Repository layout

| Path | What |
|---|---|
| `monad/contracts/` | Solidity sources of the four deployed contracts, attribution, bytecode check, deploy script |
| `monad/smoke.mjs`, `monad/deployment.json` | Monad testnet smoke run and deployment record |
| `monad/slash/` | slash demo: dishonest bonded verdict challenged and slashed |
| `src/attest.mjs` | ed25519 and canonical JSON primitive |
| `src/map-to-validation.mjs` | signed attestation to ERC-8004 request and response calldata |
| `src/prove.mjs` | offline proof (`npm run prove`) |
| `src/fire-testnet.mjs` | owner-run broadcast to an ERC-8004 testnet (`npm run fire`) |
| `abi/ValidationRegistry.json` | ValidationRegistry ABI from `erc-8004/erc-8004-contracts` |
| `grounded-feedback/` | x402-grounded-feedback-v0 ([erc-8004-contracts#99](https://github.com/erc-8004/erc-8004-contracts/issues/99)), oracle-outcome-validation-v0, vectors and two verifiers |
| `erc8404-profile/oracle-outcome/` | ERC-8404 verification profile for oracle outcomes |
| `tools/collect-uma-ctf.mjs` | collects the Polygon facts behind the oracle-outcome vectors |

## Honest limits

- Testnet only. The same contracts are deployed on Arbitrum One, Robinhood Chain and Arc; Monad
  mainnet is not deployed.
- Revenue is $0 and there are no paying customers yet.
- The evidence pack in the smoke run is signed with a prototype key, not the production key.
- Client and validator are one key in the smoke run; the provider is a separate key. A slash only
  happens when a bonded verdict contradicts what the provider committed on chain, so the honest
  flow never slashes; the slash demo uses its own bond instance and four separate keys.
- Demo bonds are 0.01 MON, about the gas cost of one challenge on Monad. A production validator
  must size the bond well above challenge gas.
- The validator checks ed25519 off chain (see the trust boundary above).

## AI tools disclosure

AI coding assistants were used for parts of the implementation; all code was reviewed and tested by the author.

## License

MIT, see [LICENSE](LICENSE). The contract sources in `monad/contracts/` are Predge's own code under
the same license; see [`monad/contracts/SOURCES.md`](monad/contracts/SOURCES.md).
