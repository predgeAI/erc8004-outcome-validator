# Monad Metropolis submission: draft texts

Primary track: 01, Onchain Finance & Trading. Drafts for the form fields; not linked from the
README. Numbers come from files in this repo or from the research notes they cite; dollar figures
are Polymarket Gamma lifetime traded volume, not losses.

## Project name

Predge

## One-liner (max 200 characters)

> Predge prices settlement risk before you trade: a signed, bonded verdict on Monad for any Polymarket market, built from 3,005 UMA disputes in 2026, for traders, agents and contracts.

## Description (max 8,000 characters)

**The problem.** On Polymarket an outcome is proposed, can be disputed, and is finally settled by a
UMA vote. From 1 Jan to 2 Oct 2026 Predge counted 3,005 UMA disputes on 2,666 Polymarket markets.
Of the 2,543 disputed markets that settled, 853 (33.5%) settled differently from the disputed
proposal. Those 853 markets traded at least $299M (Polymarket lifetime volume, available for 728 of
them), including "Will Ronaldo Cry at the World Cup?" ($89M) and "U.S. anti-cartel ground operation
in Mexico by January 31?" ($30M). The median time from the first dispute to the on-chain resolution
is 3.3 hours. Anyone holding a position, quoting a market, lending against it or letting an agent
trade it is exposed in exactly that window, and today nothing tells them how exposed.

The risk is predictable. Using only what is known at the first dispute (market type, timing,
the disputer's and proposer's track record), a model trained on January to June ranks July to
October markets with AUC 0.65: the riskiest fifth settled differently 55% of the time against 42%
overall. Half of all disputes come from 23 of 478 addresses, and when the proposer disputes its own
answer, the outcome changed in 74% of cases since July.

**What we built.** Predge turns that history into a pre-trade input.

1. *Signed evidence.* `api.predge.io/v1/settlement-risk/<market>` returns the market's dispute
   history, current proposal, on-chain resolution and a risk level (resolved, ok, watch, caution),
   read live from Polygon and signed with ed25519. Anyone can verify it offline.
2. *A verdict on Monad with money behind it.* Predge writes a 0 to 100 verdict to
   `PredgeAgentValidator`, bound to the hash of the signed record, and can bond it in
   `PredgeValidatorBond`: if a bonded verdict contradicts what the provider committed on chain,
   anyone can slash it. The contracts run on Monad mainnet (deployed 12 Oct) and testnet, and
   Predge has a verdict in the canonical ERC-8004 ValidationRegistry on Monad mainnet (agentId
   10386).
3. *Every way to consume it.* Predge Guard (web app: paste a market, every check runs in the
   browser, act or wait), an SDK and MCP server for agents, a MetaMask Agent Wallet plugin
   (`mm predge check / scan / guard`, run before `mm predict place`), x402 pay-per-call on Monad
   (0.001 USDC per check), a Chainlink CRE workflow that checks markets on every node and writes a
   report on Monad, an Envio indexer over every verdict, bond and slash, and a Nansen-powered
   "dispute exposure" view that shows how much of the top holders' money sits on the contested
   side and answers hedge, size down, wait or fine.

**Why Monad.** A verdict per market is only useful as a pre-trade check if it is cheap and fast to
write, read and slash. On Monad a verdict costs about 0.025 MON, so a venue can read it before it
quotes and a bond can back each verdict instead of one reputation score for everything. The
145-market batch wrote 290 transactions in 25 seconds of chain time.

**What makes it different.** Every prediction-market entry we found in Metropolis builds a new
venue and avoids disputes with an automated oracle. Predge serves the venue where the money and
the disputes already are, and Monad venues that copy or lever it: HermesTrade mirrors more than a
thousand Polymarket markets with its own 2-hour challenge window, and Blinq is building leverage on
Polymarket markets and has written that capital should be locked through contested resolution
windows.

**Built during Metropolis.** The Polymarket dispute pipeline and signing key predate September and
are listed as pre-existing in the README. Built in the window: the Monad contracts and their
mainnet and testnet deployments, the 145-verdict batch, bonded verdicts and the slash demo, x402 on
Monad, the ERC-8004 mainnet verdict, Predge Guard with Privy and Dynamic, the SDK and MCP server,
the MetaMask plugin, the Chainlink CRE workflow, the Envio indexer and the Nansen exposure view.

**Honest limits.** Revenue is $0 and there are no paying customers yet; we sent paid pilot offers
to HermesTrade and Blinq on 12 Oct. Volume figures are lifetime traded volume, not losses. The
dispute data covers Polymarket's UMA adapters only.

## Go-to-market (required)

**First users: Monad venues whose markets copy or reference Polymarket.** HermesTrade (live on
Monad mainnet, 1,444 of 1,477 open markets carry a Polymarket condition id, 2-hour challenge
window) needs to know when the original is disputed or resolved, so its copies halt, close or
propose the right outcome. Blinq (leverage on Polymarket and Kalshi markets) needs a trigger to
stop new leverage and lock lender capital while a market is contested. Both received a paid pilot
offer on 12 Oct: we write the integration in 48 hours, $690 for six weeks.

**Second: market makers and agent builders trading Polymarket.** MetaMask's Agent Wallet already
trades Polymarket through `mm predict`; our plugin adds the check before every order. The SDK and
MCP server do the same for any agent framework. We reach them where they build: MetaMask Agent
Wallet plugins, the Monad App Hub API listing for x402 services, and the ERC-8004 working group,
where we already contribute.

**Pricing.** Free signed record per market (rate limited), 0.001 USDC per paid check over x402,
and venue pilots that convert to a monthly feed license. Bonded verdicts are priced per market by
bond size.

**Distribution channel.** One channel first: X (@PredgeAI), posting every notable live dispute
with the signed record and the Monad verdict, so the account becomes the place traders look when a
market is contested.

**Proof so far.** Selected for Circle's Arc Programmable Money Accelerator (run by Encode Club) on
the strength of the dispute verifier.

## Judge access (optional, private)

Nothing below needs a key or sends a transaction.

- Predge Guard: https://predgeai.github.io/erc8004-outcome-validator/ (try 1137824, then any market id)
- Mainnet contracts (chain 143): PredgeAgentValidator 0xf4EE0Af65804D5754E59316b3DBB53D5c3AeeeF9,
  PredgeValidatorBond 0xd7bC19f836a92561b368eFf34667c32cAe4E7111, AgentJob
  0x64668df7917A84a26d53Fff7883DD998258D6987, PredgeSettlement 0xb4540AD38FE0bCd08578664151689d4E9dd67F35
- Mainnet ERC-8004 verdict: https://monadvision.com/tx/0xbd6ff81a066d99be913bfcace9a743a3701e2802297cab86a290d0bef9ccae28

```bash
git clone https://github.com/predgeAI/erc8004-outcome-validator && cd erc8004-outcome-validator
npm ci
node monad/contracts/check-bytecode.mjs          # sources == live code on Monad testnet
node monad/batch/verify-batch.mjs                # re-check all 145 testnet verdicts
curl -s https://api.predge.io/v1/settlement-risk/2241873 | head -c 800
```

## Sponsor answers

### Chainlink: Best workflow with CRE

`cre/settlement-watch/` is a CRE workflow used as the orchestration layer between Predge's signed
evidence and Monad. Triggers: cron over a market list and an HTTP trigger with a market id. On
every node it fetches the signed record, verifies ed25519, the content hash and the canonical
bytes, then nodes must agree on every field. It reads `getValidationStatus` on PredgeAgentValidator
on Monad testnet, compares the on-chain verdict with what the record implies, and writes a
DON-signed report to the consumer contract `PredgeSettlementWatch`
(0x1518ad21cF96Ed0429D022b038263e68fD50A90c), which exposes `safeToAct(requestHash)`.
Evidence: `cre workflow simulate` output for both triggers in `cre/README.md`; broadcast report tx
0xfc7af2fc6b0b9ad0f21e55bb0182df3a48f5379183f1f743c32ff466993e7d2a (status 1, `Watched` event,
`safeToAct` true); 26 unit tests.

### Envio: Best Use of Envio

`indexer/` is an Envio HyperIndex indexer (envio 3.14) over every Predge contract on Monad
testnet plus the ERC-8004 registries filtered to Predge: verdicts, validation requests, bonds,
slashes, jobs, receipts and per-agent, per-market and global stats. It powers the verdict counts,
the slash view and agent rankings. Queries and their real outputs are in `indexer/queries/`.
[Add the hosted endpoint once Envio Cloud is connected.]

### Nansen: Best use of Nansen

`nansen/exposure.mjs` joins Predge's signed dispute record with Nansen prediction-market data
(top-holders, position-detail, address-summary), paid per call over x402 in USDC on Monad mainnet
(25 payments, 0.65 USDC, every settlement tx in `nansen/README.md`). Nansen tells us who holds what;
Predge tells us whether the outcome they hold will hold. The output is a decision, not a table:
hedge, size down, wait or fine, with the dollars on each side. Example: market 5219930, under a
UMA vote, top-50 positions $91,170 on No vs $36,208 on Yes, Yes trading at 1.35% against Predge's
21.7% reference rate for a different settlement: hedge. Also served as the MCP tool
`dispute_exposure`.

### Privy

Predge Guard uses Privy beyond login: the embedded wallet created at login signs an EIP-712 "risk
acknowledgement" receipt for each verified check (`useSignTypedData`, verified in the browser with
viem), sends the ERC-8004 validation request on Monad (`useSendTransaction`), shows balance, and
offers key export (`useExportWallet`). Code: `guard/src/wallet/PrivyHost.tsx`, `receipt.ts`.

### Dynamic

Predge Guard integrates the Dynamic SDK for authentication, embedded wallets and signing: the
Dynamic embedded wallet (created on demand with `useDynamicWaas`) signs the same EIP-712 risk
receipt via `getWalletClient().signTypedData()` and sends the validation request on Monad. Monad
mainnet and testnet are enabled in the Dynamic environment. Code: `guard/src/wallet/DynamicHost.tsx`.

### MetaMask: Best Agent Wallet Plugin

`mm-plugin/` adds `mm predge` to the MetaMask Agent Wallet. MetaMask already trades Polymarket via
`mm predict`, with no check on disputes or finality. `mm predge check` returns risk, dispute
timeline and the verdict on Monad; `scan --address` flags every open position in a disputed or
proposed market; `guard` prints the exact `mm predict quote/place` command only when the outcome is
safe and exits with `PREDGE_GUARD_REFUSED` otherwise. The bundled `SKILL.md` makes the check a rule
for the agent. Tested inside `mm` 7.1.0 with captured outputs in `mm-plugin/examples/`.
