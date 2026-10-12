# Monad Metropolis submission: draft texts

Track 4: Trust, Identity and AI Infrastructure. Drafts for the form fields; not linked from the
README. Every number below comes from files in this repo (README.md, monad/batch/, monad/x402/,
monad/slash/, monad/smoke-*.json, monad/deployment.json).

## One-liner (max 200 characters)

> Agents call Predge before acting on a prediction-market outcome: signed UMA dispute evidence plus a bonded, slashable verdict on Monad, via SDK, MCP server and x402.

## Description (max 8,000 characters)

On 17 Jan 2026 the Polymarket market "Manchester United FC vs. Manchester City FC: O/U 2.5"
(market 1102588) had "Over" proposed as its outcome. At 14:23 UTC the proposal was disputed, and at
16:44 UTC the market resolved on chain as "Under". An agent that read the proposal and acted on
"Over" in that window, by trading, hedging, releasing an escrow or settling a bet it had
brokered, acted on an outcome that did not hold. Predge's verdict for this market is on Monad
testnet: score 0, bound to the signed record
([tx 0x97b0b7e7…](https://testnet.monadvision.com/tx/0x97b0b7e7ba92a534b3b4aa8dcaeb5fd497fad28835b49b8de18d1b5ab5d2279d)).

This is not rare. From 1 Jan to 2 Oct 2026 Predge counted 3,005 disputes on 2,666 Polymarket
markets; 323 markets were disputed twice or more. Of the 2,543 settled disputed markets, 853
(33.5%) settled differently from the disputed proposal. The median time from the first dispute to
the on-chain resolution was 3.3 h, and 88.5 h after a second dispute. Agents that act on outcomes
need to know, before acting, whether the outcome they see is final.

**What Predge gives an agent**

1. Signed evidence. `https://api.predge.io/v1/settlement-risk/<market_id>` returns a record of the
   market's UMA dispute history, on-chain resolution and bulletin-board updates, read from Polygon,
   with a risk level (resolved, ok, watch, caution). It is ed25519-signed canonical JSON and verifies
   offline against a pinned key.
2. A verdict on Monad with money behind it. Predge writes a 0..100 verdict to
   `PredgeAgentValidator`, an ERC-8004 style validation contract, with
   `responseHash = keccak256(signed record bytes)`, so anyone can check that the verdict and the
   evidence match. Predge can bond the verdict in `PredgeValidatorBond`: if a bonded verdict
   contradicts what the provider committed on chain, anyone can slash the bond within a dispute
   window counted from the verdict.

**Why bonded, slashable evidence matters on Monad.** ERC-8004 reputation feedback is open to
anyone who can pay gas. On a fast, low-fee chain, a set of freshly funded addresses can write as
much positive feedback as it likes, so feedback alone is weak evidence of a validator's honesty.
Predge's answer is evidence that can be re-checked by anyone (a signed record whose hash is on
chain) and a bond that a third party can slash when the verdict is provably wrong. We ran that:
a dishonest validator bonded 0.01 MON, recorded verdict 100 on a tampered deliverable, and a third
party slashed it 17 blocks later (2026-10-07, four separate keys).

**Infrastructure other developers can use (new in this submission)**

- `@predge/settlement-risk` (TypeScript SDK, `sdk/`): `getSettlementRisk(marketId)` verifies the
  signature against the pinned key and the sha256 content hash; `getOnchainVerdict(marketId or
  requestHash)` reads the verdict on Monad and checks `responseHash == keccak256(signed bytes)`;
  `isSafeToAct(marketId, { maxRisk, outcome })` combines both into one yes or no with a reason;
  an x402 helper pays per call in USDC on Monad with an account the caller already holds.
- An MCP server (`mcp/`, stdio) with tools `settlement_risk`, `onchain_verdict`, `is_safe_to_act`,
  so any agent framework with MCP support can call Predge before acting, with no code.
- A public verdict board that reads every verdict from Monad testnet and verifies the signatures in
  the browser: https://predgeai.github.io/erc8004-outcome-validator/

Generic ERC-8004 validators check that the agent did what it said. Predge checks that the outcome
the agent acts on will hold.

**What runs on Monad testnet today**

- Four contracts deployed on 2026-10-05, verified on Sourcify (exact match); a script recompiles
  them and compares with the live bytecode.
- Smoke runs on 2026-10-05 and 2026-10-12, 11 transactions each: request, escrowed job, bond,
  provider submit with a separate key, verdict, verdict behind the bond, job completed, pay-per-call
  receipt, ERC-8004 agent registration, and a ValidationRegistry request and response read back
  bound to the signed record.
- A batch of 145 verdicts on real disputed Polymarket markets (2026-10-07): 290 transactions,
  0 failed, 145 of 145 read back bound to the signed record. Requests from 6 agent keys landed in
  11 blocks (3 s); the whole run took 83 blocks and 25 s of chain time, at 0.0255 MON per verdict.
- x402 on Monad: an agent paid 0.001 USDC per call through Monad's x402 facilitator and got the
  signed record plus the on-chain verdict, 6.7 s end to end; the agent holds no MON.

**Why Monad.** Agents make many small decisions, and each verdict is a write that should land next
to the decision it backs. No global mempool and per-sender nonces let six agent keys submit in
parallel; fast blocks put a verdict on chain seconds after the decision; Monad's x402 facilitator
with testnet USDC lets agents pay per call; and ERC-8004 Identity and Reputation registries are
canonical on Monad testnet, so a Predge verdict sits next to agent identities other Monad apps
already read.

**Honest limits.** Testnet only. Revenue is $0 and there are no paying customers yet. The
production API does not offer Monad as an x402 payment network yet; the Monad x402 path runs on a
separate demo server that serves the same signed records. The validator checks ed25519 off chain
and commits the hash on chain. Demo bonds are 0.01 MON; a production validator must size the bond
well above challenge gas. The SDK and MCP server are not published to npm or an MCP registry yet.

**Pre-existing work, listed.** The Predge API and data stack (api.predge.io, the x402 API on Base,
the signing key and format), the first version of this repo (31 Jul and 1 Aug 2026) and v1 of the
contracts (August 2026, other Predge repos) existed before 1 Sep. The README section "Built during
Metropolis" lists what was built in the window with commit dates and on-chain block numbers.

## Go-to-market

**First users.** Builders of agents and trading or signal bots that act on prediction-market
outcomes (trade, hedge, release escrow, settle a bet between users), and Monad-native prediction
markets and outcome-dependent apps as integration targets: they can call `is_safe_to_act` before
settling against an outcome, or read Predge's verdict on Monad from their own contracts through
`getValidationStatus`.

**Channels.**
- x402 Bazaar listing of the pay-per-call Settlement Risk route, so agents that discover services
  through x402 find it.
- MCP registries, with the MCP server in this repo, so agent frameworks can add Predge as a tool.
- Monad developer Discord and X: the SDK, the verdict board and the reproducible batch as the
  technical pitch to Monad builders.

**Pricing.** Per call in USDC via x402 (0.001 USDC per call in the Monad demo). Reading the
on-chain verdict is free for anyone; the paid product is the fresh signed record and, later,
bonded verdicts on request.

**Traction today.** Revenue $0, no paying customers yet. The signed route is live at api.predge.io
and the Monad deployment, batch and verdict board are public.

## Judge access

Nothing below needs a key or sends a transaction.

```bash
git clone https://github.com/predgeAI/erc8004-outcome-validator
cd erc8004-outcome-validator
npm ci                                      # installs and builds the SDK and MCP server

node monad/contracts/check-bytecode.mjs     # sources == live code on Monad testnet
node monad/batch/verify-batch.mjs           # re-check all 145 batch verdicts on Monad testnet
npm run sdk:test                            # SDK offline tests (fixtures from monad/batch/records/)
npm run test:live -w @predge/settlement-risk       # SDK live: api.predge.io + Monad testnet
npm run test:live -w @predge/settlement-risk-mcp   # MCP server over stdio, live

# one call, the way an agent would
node -e 'import("@predge/settlement-risk").then(async m => console.log((await m.isSafeToAct("1102588", { outcome: "Under" })).reason))'
curl -s https://api.predge.io/v1/settlement-risk/1102588 | head -c 600
curl -s https://api.predge.io/.well-known/predge-keys.json
```

- Verdict board: https://predgeai.github.io/erc8004-outcome-validator/
- Monad mainnet, canonical ERC-8004 v2.0.0 ValidationRegistry: agentId 10386, market 1112268, response 100, responseHash bound to the signed record: https://monadvision.com/tx/0xbd6ff81a066d99be913bfcace9a743a3701e2802297cab86a290d0bef9ccae28 (request https://monadvision.com/tx/0xb67376ee79ad9fa2f0bccdc6417f13d8e092bee1a5abd95b74219f59431227e5)
- `PredgeAgentValidator`: https://testnet.monadvision.com/address/0x884764736dBe1FD36291bDd3Afd50A75465F6e8A
- `PredgeValidatorBond`: https://testnet.monadvision.com/address/0x0fE4D5fF3f4392bEC36c8003079E31102a403E84
- `AgentJob`: https://testnet.monadvision.com/address/0x34F1ef2f39Bfdd6c10Fcaa02f5B257A5dB2e93E9
- `PredgeSettlement`: https://testnet.monadvision.com/address/0xf4EE0Af65804D5754E59316b3DBB53D5c3AeeeF9
- Verdict for market 1102588 (score 0): https://testnet.monadvision.com/tx/0x97b0b7e7ba92a534b3b4aa8dcaeb5fd497fad28835b49b8de18d1b5ab5d2279d
- Slash: https://testnet.monadvision.com/tx/0x96f861d0c7810e5687d6694899ce70994e90e86233c12362b19fad118b0184ab
- x402 settlement on Monad: https://testnet.monadvision.com/tx/0xa41ba1f995eb229c322d5bc34c4d69550395356d94459c0706ba065b8da99cea
- Smoke run 2026-10-12, verdict: https://testnet.monadvision.com/tx/0xba6a5e52c72c618953885eb889e86103dcde4d3f306572fe62464d2201f57872
