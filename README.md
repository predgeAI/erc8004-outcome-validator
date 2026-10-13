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

**Predge Guard:** https://predgeai.github.io/erc8004-outcome-validator/ checks one market end to end:
paste a Polymarket link, slug or market id, and it fetches the signed record, verifies the ed25519
signature and SHA-256 content hash in your browser, reads Predge's verdict from Monad testnet, confirms
`responseHash == keccak256(signed record)`, and answers "is it safe to act?". Wallet login with Privy
or Dynamic lets you watch markets and send a validationRequest on Monad testnet from your own wallet
(source: [`guard/`](guard/), built into `docs/` with `cd guard && npm install && npm run build`).
The verdict board that re-verifies all 145 verdicts at once is at
[`board.html`](https://predgeai.github.io/erc8004-outcome-validator/board.html) (source: [`docs/board.html`](docs/board.html)).

Target user: builders of agents, trading and signal bots, and protocols that act on or settle
against prediction-market outcomes. Revenue today is $0; there are no paying customers yet.

## Contents

- [Use it from your agent](#use-it-from-your-agent)
- [What is live on Monad testnet](#what-is-live-on-monad-testnet)
- [Nansen dispute exposure](#nansen-dispute-exposure)
- [Architecture](#architecture)
- [Why Monad](#why-monad)
- [Setup and reproduction](#setup-and-reproduction)
- [Built during Metropolis (1 Sep–13 Oct)](#built-during-metropolis-1-sep13-oct)
- [Repository layout](#repository-layout)
- [Honest limits](#honest-limits)
- [AI tools disclosure](#ai-tools-disclosure)
- [Support development](#support-development)
- [License](#license)

## Use it from your agent

Two packages in this repo let any agent check Predge before it acts. Neither is published to npm
yet; `npm ci` at the repo root installs and builds both (npm workspaces). Both are read-only: no key,
no transaction.

**SDK** ([`sdk/`](sdk/README.md), `@predge/settlement-risk`, TypeScript):

```ts
import { isSafeToAct } from "@predge/settlement-risk";

const d = await isSafeToAct("1102588", { maxRisk: "resolved", outcome: "Under" });
if (!d.safe) throw new Error(d.reason); // "wait: risk caution is above resolved. ..." or "refuse: ..."
console.log(d.reason, d.verdict?.bound); // the signed record verified; the Monad verdict is bound to it
```

`isSafeToAct` combines `getSettlementRisk(marketId)` (fetches the signed record, checks ed25519
against the pinned key `13fa3d18a369e6c7` and the sha256 content hash) and
`getOnchainVerdict(marketId | requestHash)` (reads `PredgeAgentValidator` on Monad testnet and
checks `responseHash == keccak256(signed bytes)`). `@predge/settlement-risk/x402` pays per call in
USDC on Monad through Monad's x402 facilitator with an account your code already holds; it never
reads a key itself.

**MCP server** ([`mcp/`](mcp/server.mjs), stdio) with four tools: `settlement_risk`,
`onchain_verdict`, `is_safe_to_act`, and `dispute_exposure` (cached Nansen results, see
[below](#nansen-dispute-exposure)). Add it to any MCP client or agent framework with MCP
support:

```json
{
  "mcpServers": {
    "predge-settlement-risk": {
      "command": "node",
      "args": ["/absolute/path/to/erc8004-outcome-validator/mcp/server.mjs"]
    }
  }
}
```

**MetaMask Agent Wallet plugin** ([`mm-plugin/`](mm-plugin/README.md)): `mm predge check`,
`mm predge scan` and `mm predge guard` for the `mm` CLI. Checks settlement risk before
`mm predict place`, flags disputed or proposed-but-not-final positions in a wallet, and prints the
exact `mm predict` order only when the market is safe. Read-only; installs with `file:`.

Tests: `npm run sdk:test` (13 offline tests on the batch fixtures in `monad/batch/records/`),
`npm run test:live -w @predge/settlement-risk` and `npm run test:live -w @predge/settlement-risk-mcp`
(read-only against api.predge.io and Monad testnet).

### How this differs from a generic ERC-8004 validator

Generic ERC-8004 validators check the agent did what it said; Predge checks the outcome it acts on
will hold.

| | Generic ERC-8004 validator | Predge |
|---|---|---|
| Question answered | did the agent do the task it claimed (re-execution, TEE or zk proof of its own work) | is the external outcome the agent acts on final, or still open to dispute |
| Evidence | the agent's inputs, outputs and execution trace | UMA and Polymarket facts read on Polygon, as an ed25519-signed record anyone can re-verify offline |
| On-chain link | a response score for the agent's work | a 0..100 verdict whose `responseHash` is keccak256 of the signed record |
| If the validator is wrong | depends on the validator design; often nothing on chain | a bonded verdict that contradicts the provider's on-chain commitment can be slashed by anyone, within the dispute window |
| When it is called | after the agent acted | before the agent acts (`isSafeToAct`, `is_safe_to_act`) |

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

Repeated on 2026-10-12 (11 of 11 tx ok, ERC-8004 agentId `2220`) on the evidence pack in
pack_format 2, whose record is signed with the production key `13fa3d18a369e6c7`. Receipts:
[`monad/smoke-2026-10-12T16-26-31-759Z.json`](monad/smoke-2026-10-12T16-26-31-759Z.json).

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

### Batch: 145 verdicts on real disputed markets

2026-10-07: 145 Predge verdicts on an evenly spaced sample of disputed Polymarket markets, each bound
to a signed Settlement Risk record from the production API (stored in `monad/batch/records/`).
Agents claim "the final on-chain outcome equals the first disputed proposal"; Predge answers 100 if
it did, 0 if the market settled differently. 290 transactions, 0 failed, 145 of 145 read back with
`responseHash == keccak256(signed record)`. Requests from 6 agent keys landed in 11 blocks (3 s);
the whole run took 83 blocks and 25 s of chain time, and cost 3.69 MON (0.0255 MON per verdict).
Details, per-market tx hashes and the reproduction script: [`monad/batch/`](monad/batch/README.md).

### x402 on Monad

An agent pays 0.001 USDC on Monad testnet per call through Monad's x402 facilitator
(`x402-facilitator.molandak.org`, x402 v2, scheme `exact`), receives the signed record plus Predge's
on-chain verdict for the market, and checks both before acting. The agent holds no MON; the
facilitator pays gas. Settlement txs:
[`0xa41ba1f9…`](https://testnet.monadvision.com/tx/0xa41ba1f995eb229c322d5bc34c4d69550395356d94459c0706ba065b8da99cea),
[`0x4e52243b…`](https://testnet.monadvision.com/tx/0x4e52243b505c28511dd6740102496afa062006f510d16e5fc09f144085d56a3e).
Details: [`monad/x402/`](monad/x402/README.md).

### Fund from any chain (Aurora Intents)

An agent on Base, Arbitrum, Solana or 20+ other chains funds itself on Monad without a bridge or MON:
Aurora Intents (powered by NEAR Intents) issues a one-time deposit address on the origin chain, solvers
deliver native USDC on Monad mainnet in about 37 s, and the agent spends it on x402 checks on Monad mainnet
(`MONAD_NETWORK=mainnet`, eip155:143). CLI `aurora/fund.mjs`, panel "Fund from any chain" in Predge Guard.
Details and the live-run steps: [`aurora/`](aurora/README.md).

## Nansen dispute exposure

Predge knows that a market is disputed and which proposed outcome was disputed; Nansen knows who
holds each side. [`nansen/exposure.mjs`](nansen/README.md) joins them: it verifies the signed Predge
record with the SDK, pays Nansen per call over x402 in USDC on Monad mainnet (top-holders,
position-detail, address-summary for the top 3 holders, about 0.13 USDC per market), and returns the
dollars on the contested outcome vs the other side, the top-3 share, whether high-win-rate wallets sit
on the contested side, and one decision: hedge, size down, wait or fine.

```
node nansen/exposure.mjs 5219930 --no-pay   # cached, free
```

On the live dispute in "Will Trump say Ammunition this week?" (5219930, in a UMA vote) it says
hedge: Nansen (2026-10-12T21:10Z) prices Yes at 0.0135 while Predge's signed reference rate that the
market settles differently from the disputed No is 21.66%. Spend is capped in code at 2.00 USDC
lifetime with a ledger; 0.65 USDC spent across 5 markets, every payment's Monad settlement tx is in
[`nansen/README.md`](nansen/README.md). The MCP tool `dispute_exposure` serves the cached results and
never pays.

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
next to the decision it informs. What we measured on Monad testnet (2026-10-07):

| | Measured |
|---|---|
| 145 agent requests from 6 keys in parallel | on chain within 11 blocks, 3 s of chain time |
| 145 verdicts + 145 requests (290 tx) | 83 blocks, 25 s of chain time, 28.3 s wall clock |
| Cost per verdict (request + response) | 0.0255 MON at 100 gwei base fee |
| x402 paid call, USDC on Monad, through Monad's facilitator | 6.7 s end to end, the agent holds no MON |
| Dishonest bonded verdict to slash | 17 blocks, by a third party |

What in Monad made that possible, and what we had to adapt to:

- **No global mempool, nonces per sender.** Six agent keys submitted in parallel without contending
  for one queue. A single key is limited by how fast one client submits (the 145 verdicts from one
  key took 53 blocks, paced by our own submission loop).
- **Fast blocks.** 83 blocks in 25 s, so a verdict is on chain seconds after the decision it backs.
- **Gas is charged on the gas limit.** Every script sets the limit to the measured estimate plus
  10%.
- **Reserve balance.** Accounts under 10 MON can only move value in an "emptying" transaction; a
  burst of funding transfers reverted until the batch script spaced them 4 blocks apart.
- **Official x402 facilitator with testnet USDC**, so agents pay per call in USDC.
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
node monad/batch/verify-batch.mjs         # re-check all 145 batch verdicts on Monad testnet
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

## Built during Metropolis (1 Sep–13 Oct)

Metropolis allows pre-existing code if it is listed and the submission adds substantial new work.
Everything below can be checked: commit dates with `git log --date=short`, chain dates from the block
numbers on [MonadVision](https://testnet.monadvision.com) and the receipt files in `monad/`.

**Pre-existing (before 1 Sep 2026), reused here:**

| Component | Where | Date |
|---|---|---|
| Predge API and data stack: api.predge.io, the x402 pay-per-call API on Base (whale data routes), the ed25519 signing key and canonical JSON format | predge-x402-api, not part of this repo | before September |
| This repo's first version: ed25519 attestation to ERC-8004 `validationResponse` mapping (`src/`) | this repo, 2 commits | 2026-07-31 and 2026-08-01 |
| `PredgeSettlement` contract | predgeAI/predge-arc | 2026-08-03 |
| `PredgeAgentValidator`, `AgentJob`, `PredgeValidatorBond` v1 | predgeAI/predge-arc | 2026-08-14 |
| Port of those contracts to Robinhood Chain | predgeAI/predge-robinhood | 2026-08-17 |

**Built during the window, outside this repo** (dates from those repos' history, not reproducible
from this one):

| Component | Date |
|---|---|
| `PredgeValidatorBond` v2: the challenge reads the deliverable from the job contract, so a challenger cannot supply bytes | 2026-09-18 |
| Settlement Risk dataset (3,005 disputes on 2,666 markets) and the signed `/v1/settlement-risk/<market>` route in the Predge API | September to October |
| `PredgeValidatorBond` v2.1: dispute window counted from the verdict, not from the stake | 2026-10-03 |

**Built during the window, in this repo** (every commit after 2026-08-01 is dated 2026-10-03 or
later):

| Component | Commit dates |
|---|---|
| x402-grounded-feedback-v0 schema, test vectors, Node and Python verifiers (`grounded-feedback/`) | 2026-10-03 |
| Monad testnet deployment of the four contracts, Sourcify verification, smoke run with ERC-8004 records (`monad/`) | 2026-10-05 |
| Oracle outcome state and superseding, ERC-8404 oracle-outcome verification profile (`erc8404-profile/`) | 2026-10-05 to 2026-10-07 |
| Contract sources in this repo, reproducible build check, deploy script (`monad/contracts/`) | 2026-10-07 |
| Batch of 145 verdicts, slash demo, x402 on Monad, verdict board (`monad/batch/`, `monad/slash/`, `monad/x402/`, `docs/`) | 2026-10-07 |
| Smoke run on the production-signed evidence pack (pack_format 2), receipts | 2026-10-12 |
| SDK `@predge/settlement-risk` (`sdk/`) and MCP server (`mcp/`) | 2026-10-12 |
| MetaMask Agent Wallet plugin `mm predge` (`mm-plugin/`) | 2026-10-13 |

**On chain, Monad testnet (chain 10143):**

| What | Date (UTC) | Blocks | Receipts |
|---|---|---|---|
| Deploy of the four contracts | 2026-10-05 08:04:57 to 08:05:10 | 68349040 to 68349085 | [`monad/deployment.json`](monad/deployment.json) |
| Smoke run, 11 tx | 2026-10-05 | 68349122 to 68349171 | [`monad/smoke-2026-10-05T08-05-41-255Z.json`](monad/smoke-2026-10-05T08-05-41-255Z.json) |
| Slash demo | 2026-10-07 | 68958546 to 68958599 | [`monad/slash/slash-2026-10-07T11-29-42-252Z.json`](monad/slash/slash-2026-10-07T11-29-42-252Z.json) |
| x402 paid calls on Monad | 2026-10-07 | 68959337, 68961131 | [`monad/x402/runs/`](monad/x402/runs/) |
| Batch, 145 requests and 145 verdicts | 2026-10-07 | 68960430 to 68960512 | [`monad/batch/results-2026-10-07T11-39-11-867Z.json`](monad/batch/results-2026-10-07T11-39-11-867Z.json) |
| Smoke run, 11 of 11 tx ok | 2026-10-12 | 70444717 to 70444799 | [`monad/smoke-2026-10-12T16-26-31-759Z.json`](monad/smoke-2026-10-12T16-26-31-759Z.json) |

## Repository layout

| Path | What |
|---|---|
| `sdk/` | `@predge/settlement-risk`: `getSettlementRisk`, `getOnchainVerdict`, `isSafeToAct`, x402 helper, offline and live tests |
| `mcp/` | MCP server (stdio): `settlement_risk`, `onchain_verdict`, `is_safe_to_act`, `dispute_exposure` |
| `mm-plugin/` | MetaMask Agent Wallet plugin: `mm predge check`, `scan`, `guard`, agent skill, captured outputs |
| `monad/contracts/` | Solidity sources of the four deployed contracts, attribution, bytecode check, deploy script |
| `monad/smoke.mjs`, `monad/deployment.json` | Monad testnet smoke run and deployment record |
| `monad/slash/` | slash demo: dishonest bonded verdict challenged and slashed |
| `monad/batch/` | 145 verdicts on real disputed markets: markets, signed records, runner, results, verifier |
| `monad/x402/` | x402 pay-per-call on Monad testnet: resource server and paying agent |
| `nansen/` | dispute exposure: Predge dispute record + Nansen holders (x402, USDC on Monad mainnet, capped), examples, spend ledger |
| `guard/` | Predge Guard web app (Vite, React, TypeScript); its static build is `docs/index.html` and `docs/assets/` |
| `docs/board.html`, `monad/board/` | verdict board (GitHub Pages) and the script that builds its data file |
| `indexer/` | Envio HyperIndex indexer for all of the above: verdicts, bonds and slashes, jobs, receipts, per-agent and per-market stats over GraphQL ([README](indexer/README.md)) |
| `src/attest.mjs` | ed25519 and canonical JSON primitive |
| `src/map-to-validation.mjs` | signed attestation to ERC-8004 request and response calldata |
| `src/prove.mjs` | offline proof (`npm run prove`) |
| `src/fire-testnet.mjs` | owner-run broadcast to an ERC-8004 testnet (`npm run fire`) |
| `abi/ValidationRegistry.json` | ValidationRegistry ABI from `erc-8004/erc-8004-contracts` |
| `grounded-feedback/` | x402-grounded-feedback-v0 ([erc-8004-contracts#99](https://github.com/erc-8004/erc-8004-contracts/issues/99)), oracle-outcome-validation-v0, vectors and two verifiers |
| `erc8404-profile/oracle-outcome/` | ERC-8404 verification profile for oracle outcomes |
| `tools/collect-uma-ctf.mjs` | collects the Polygon facts behind the oracle-outcome vectors |

## Honest limits

- The Predge contracts run on Monad testnet only. The same contracts are deployed on Arbitrum One,
  Robinhood Chain and Arc; on Monad mainnet they are not deployed. On Monad mainnet there is one
  verdict in the canonical ERC-8004 v2.0.0 registries: agentId 10386, market 1112268, response 100,
  responseHash bound to the signed record
  ([request](https://monadvision.com/tx/0xb67376ee79ad9fa2f0bccdc6417f13d8e092bee1a5abd95b74219f59431227e5),
  [response](https://monadvision.com/tx/0xbd6ff81a066d99be913bfcace9a743a3701e2802297cab86a290d0bef9ccae28),
  script and receipts in `monad/mainnet/`).
- Revenue is $0 and there are no paying customers yet.
- The evidence pack in the 2026-10-05 smoke run is signed with a prototype key, not the production
  key; the 2026-10-12 run uses the production-signed pack.
- The SDK finds the signed record a batch verdict is bound to in the verdict board's data file. That
  file is not trusted: the SDK checks each record against the pinned key and against `responseHash`
  on chain. Markets without a Predge verdict on Monad get the signed record only.
- The x402 helper pays the Monad demo server (`monad/x402/server.mjs`); api.predge.io does not offer
  Monad as a payment network yet. The paid path was run on 2026-10-07 with `monad/x402/agent.mjs`;
  the SDK helper's paid path has not been run against the chain.
- The SDK and MCP server are not published to npm or listed in an MCP registry yet.
- Client and validator are one key in the smoke run; the provider is a separate key. A slash only
  happens when a bonded verdict contradicts what the provider committed on chain, so the honest
  flow never slashes; the slash demo uses its own bond instance and four separate keys.
- Demo bonds are 0.01 MON, about the gas cost of one challenge on Monad. A production validator
  must size the bond well above challenge gas.
- The validator checks ed25519 off chain (see the trust boundary above).

## AI tools disclosure

AI coding assistants were used for parts of the implementation; all code was reviewed and tested by the author.

## Support development

This repo is open source (MIT) and maintained by a solo developer as part of Predge. If it is useful to you, you can support its development with a crypto donation. Donations cover RPC and hosting costs, test vectors and ongoing maintenance of the open-source tools. A donation does not buy a service, a token or any special treatment.

- EVM (Base preferred; the same address works on Arbitrum and Arc): `0x9084f5000E07C7133D6dA5eE4f271AB6D1821144`
- Solana: `9dxMRRtC7RKZH5rFZpUywjmnQ87H9qHhtW43u5LYmpV`

These are the same addresses Predge already uses to receive x402 payments. Send USDC or the network's native token only. You can also fund the repo through [Drips](https://www.drips.network/app/projects/github/predgeAI/erc8004-outcome-validator). All options are listed on the [support page](https://predgeai.github.io/erc8004-outcome-validator/support/).

## License

MIT, see [LICENSE](LICENSE). The contract sources in `monad/contracts/` are Predge's own code under
the same license; see [`monad/contracts/SOURCES.md`](monad/contracts/SOURCES.md).
