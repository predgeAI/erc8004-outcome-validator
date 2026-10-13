# Dispute-hedge notes on Kuru: settlement risk as a tradable asset

Entry for Monad Metropolis, "Bring New Assets and Markets to Kuru" (Onchain Finance & Trading).

When a Polymarket proposal is disputed, everyone holding the market is exposed to one question:
**will the final on-chain outcome equal the disputed proposal?** That risk has no market of its own.
This folder makes it one.

For one disputed proposal, the `DisputeNoteFactory` on Monad mints a fully collateralized pair:

| Leg | Pays 1 unit of collateral if | Fair price |
|---|---|---|
| **HOLD** | the final CTF payout vector on Polygon equals the disputed proposal (the dispute fails) | 1 - p |
| **CHANGE** | anything else: the outcome flips, or resolves 50/50 | p |

`p` is the probability that the market settles differently from the disputed proposal. 1 collateral
in = 1 HOLD + 1 CHANGE out, at any time while the note is open; 1 HOLD + 1 CHANGE back = 1 collateral.
CHANGE trades on a Kuru v1 spot order book against a dollar token. The note is a hedge on
**settlement risk, not on the event**: CHANGE always means "the dispute changes the answer",
whichever side the proposal was on.

```
 Polymarket market under dispute (Polygon)            Monad
 ─────────────────────────────────────────            ─────────────────────────────────────────────
 UMA proposal "No" disputed (tx 0x7a19…3b74)   ──▶    DisputeNoteFactory.createNote(conditionId, [0,1], disputeTx, expiry)
                                                       mint: 1 tUSD ─▶ 1 HOLD + 1 CHANGE
                                                       Kuru Router.deployProxy(CHANGE, tUSD) ─▶ order book
                                                       market maker quotes around Predge's reference rate
 UMA vote ─▶ UmaCtfAdapter ─▶ CTF.reportPayouts
 CTF.payoutNumerators / payoutDenominator      ──▶    Chainlink CRE workflow (every DON node reads Polygon
                                                       at one finalized block, nodes agree) ─▶ signed report
                                                       ─▶ KeystoneForwarder ─▶ factory.onReport ─▶ HOLD or CHANGE wins
                                                       redeem: winning leg ─▶ 1 tUSD
```

## Status (13 Oct 2026)

| Piece | State |
|---|---|
| Contracts `DisputeNoteFactory`, `NoteToken` (HOLD/CHANGE), `TestUSD` | written, 14 contract tests + 3 helper tests pass |
| CRE settlement workflow `cre/settle-notes` | builds to WASM; 9 unit tests pass; **`cre workflow simulate` run against real Polygon** (below) |
| Kuru `Router.deployProxy` on testnet | **confirmed permissionless** by `eth_call` and `eth_estimateGas` (1,301,551 gas) |
| Whole lifecycle on live Monad testnet state | **passes in `eth_simulateV1`** (deploy, list, mint, Kuru book, deposits, 4 quotes, a taker fill, settlement report, redeem) |
| Live deployment on Monad testnet | **done**: factory `0x9FAC…3D06`, note on 5219930 with a Kuru CHANGE/tUSD book and four seed quotes (`deployments/monad-testnet.json`) |
| Live settlement by CRE | **done** for two already-resolved markets: list, mint, `cre workflow simulate --broadcast`, redeem (below) |

## Live on testnet: list → mint → CRE settle → redeem

13 Oct 2026, Monad testnet (10143), factory `0x9FAC0dD79cf9D535ae890Cd1Bbf7a838f3B63D06`. Two notes on
Polymarket markets that had a disputed proposal and are already resolved on Polygon CTF. Settlement
came only from the CRE `settle-notes` workflow: `cre workflow simulate --broadcast` read
`payoutDenominator` / `payoutNumerators` on Polygon mainnet at a finalized block, and the report went
through Chainlink's MockKeystoneForwarder (`0xB9F7…D192`) to `onReport`. Full record:
`examples/live-settle-2026-10-13.json`; CRE logs: `cre/out/live-settle-*-2026-10-13.txt`.

| Market | Disputed proposal | Polygon CTF payouts (block) | Result | |
|---|---|---|---|---|
| 1112268 Torino vs Roma O/U 2.5 | Over `[1,0]` (dispute [0x7e59…4540](https://polygonscan.com/tx/0x7e59d684ba06456639386a8ec25d04ef02a2769d2cf1435887188b91ea664540)) | `[0,1]` Under (95473532) | **CHANGE wins** | note 1 |
| 1004831 four drug-boat strikes in 2025 | No `[0,1]` (dispute [0x251f…a62d](https://polygonscan.com/tx/0x251f550e549a43d5433a611a480fc9c3bbf1ca36dc20a4067356bbab9feca62d)) | `[0,1]` No (95473549) | **HOLD wins** | note 2 |

| Step | 1112268 | 1004831 |
|---|---|---|
| createNote | [0x7144…e89a](https://testnet.monadvision.com/tx/0x71444b6ad8bb3ab0e072fe99a173cd0c9d92793a4bc8534b52884fb7497ee89a) | [0x5062…36b1](https://testnet.monadvision.com/tx/0x50628d677e6a538ecaaf1cb1149fcce16d94414412eafa9809749b89e80e36b1) |
| mint 10 HOLD + 10 CHANGE (10 tUSD) | [0xde9e…589f](https://testnet.monadvision.com/tx/0xde9e48f1b980e4b9d73b0d0ce60629eb0165bff78d9f2c29502c2453eb1b589f) | [0xff2e…1195](https://testnet.monadvision.com/tx/0xff2ee0eed48b7b288f98aa308880a6161aaf51eae88410b6d7d9d843acfd1195) |
| CRE report → forwarder → `onReport` | [0x2691…63d5](https://testnet.monadvision.com/tx/0x2691279bb6c16de5974a92576613472d399cdaad51095567102dabdf8b4863d5) `Settled(1, CHANGE)` | [0xda13…4164](https://testnet.monadvision.com/tx/0xda13f97081c1882ae3ce440d8cee97a575b3d0457d466a68e490ce86108b4164) `Settled(2, HOLD)` |
| redeem winning leg | 10 CHANGE → 10 tUSD [0xeeed…2ce1](https://testnet.monadvision.com/tx/0xeeedfe094feea0a86bd6b01c0ce9571fd354cc2caa8d719f02d6079f3dc32ce1) | 10 HOLD → 10 tUSD [0x2c61…9478](https://testnet.monadvision.com/tx/0x2c615a505e056f3b554668817c08c2d8c098df0d09944a12236e60a0a3569478) |

(Setup: faucet [0xa7a0…42d8](https://testnet.monadvision.com/tx/0xa7a0ba0a14674de22dd84f7d82f0193d4c657cd1b733490ca2a479e2671342d8), approve [0x8795…2a24](https://testnet.monadvision.com/tx/0x87957eca6b396a8bf747d6359930c81a6e52c94d70e0505b51c11892b3b02a24).)

After redemption both notes hold 0 collateral; the holder keeps 10 losing tokens per note, worth 0.
On testnet the MockKeystoneForwarder does not check DON signatures (see trust assumptions); on
mainnet the same workflow writes through the production KeystoneForwarder with `pinWorkflow` set.

```bash
CONFIRM_TESTNET=yes node kuru/scripts/live-settle.mjs list      # createNote x2, faucet, approve, mint x2
cd kuru/cre && CRE_ETH_PRIVATE_KEY=... cre workflow simulate ./settle-notes --target staging-settings \
  --non-interactive --trigger-index 1 --http-payload '{"condition_id":"0xddff…f1e0"}' --broadcast
CONFIRM_TESTNET=yes node kuru/scripts/live-settle.mjs redeem    # redeem the winning leg of each note
```

## The five sponsor questions

### 1. Asset class

Settlement-risk notes: binary claims on whether a disputed prediction-market resolution keeps or
changes its answer. The underlying is not an event (an election, a match) but a process: UMA's
dispute and vote on Polymarket. Every disputed market creates a new instrument with a short,
well-defined life (median 3.3 h from first dispute to on-chain resolution; 88.5 h after a second
dispute, which goes to a UMA vote).

What makes it a class and not one more YES/NO market (Isotherm and Hunch Book already run YES/NO
event markets on Kuru):

- **Same meaning across markets.** CHANGE is always "the dispute flips the outcome". Notes on 50
  different disputes are 50 draws of one risk, so they can be quoted from one model, netted, and
  pooled into a basket. YES tokens of 50 markets cannot.
- **It pays on 50/50 resolutions.** If a "No" proposal is disputed and the market resolves 50/50,
  YES pays 0.5 and NO pays 0.5; CHANGE pays 1. That is the exact risk a NO holder carries.
- **It reaches people who cannot or will not touch Polymarket**: agents and protocols on Monad,
  lenders who take Polymarket positions as collateral, desks that quote Polymarket and want to lay
  off resolution risk somewhere other than the market they quote.

### 2. Customer and demand evidence

Who is exposed, with numbers from Predge's scan of UMA Optimistic Oracle and UmaCtfAdapter logs on
Polygon (1 Jan to 2 Oct 2026; the first three are in every live record at
`api.predge.io/v1/settlement-risk/<id>`, checked 13 Oct):

- **2,543** disputed Polymarket markets settled in 2026; **853 (33.5%)** settled differently from
  the disputed proposal. Every holder of the disputed side in those markets lost a position they
  were told was winning.
- Those 853 markets traded **at least $299M** of Polymarket lifetime volume (Gamma volume available
  for 728 of them; from Predge's earlier analysis in `docs/SUBMISSION-DRAFT.md`, not recomputed here).
- **3,005 disputes** on 2,666 markets in nine months: about 11 a day, so a steady supply of new notes.
- The risk is priceable, which is what makes a two-sided market possible: on a July to October
  holdout, the riskiest fifth of markets at first dispute settled differently **55%** of the time
  against **42%** overall (same source as the $299M figure).
- The live example, market 5219930 ("Will Trump say 'Ammunition' this week?"): proposal "No",
  disputed twice, now in a UMA vote. On 12 Oct 21:10 UTC the top 50 positions held **$91,170 of No
  cost basis** and $36,208 of Yes (Nansen data, `nansen/README.md`). The No side is the natural
  CHANGE buyer.

Who buys and sells what:

| Participant | Trade |
|---|---|
| Holder of the disputed side (here: No) | buys CHANGE to insure the position through the vote |
| Holder of the other side, or a disputer | buys HOLD (or sells CHANGE) as the opposite view |
| Lender against Polymarket positions | buys CHANGE on collateral that is under dispute |
| Market maker / Predge | mints pairs, quotes both sides, hedges across many notes |

Not yet evidenced: signed customers for this instrument. Predge's existing users buy settlement-risk
data (API, MCP, Monad verdicts); this is the first tradable form of it.

### 3. Issuance, redemption and settlement

- **Issuance.** `createNote(conditionId, proposal, disputeTx, expiry, marketId, symbol)` lists a
  note and deploys its two ERC-20s. Listing is curated by the factory owner (Predge) so that each
  note is checked against its dispute transaction; `disputeTx` is stored on chain so anyone can
  re-check the proposal on Polygon. Then anyone can `mint`: 1 collateral in, 1 HOLD + 1 CHANGE out.
- **Redemption before settlement.** `merge`: 1 HOLD + 1 CHANGE back to 1 collateral, any time while
  the note is open. This keeps both legs anchored to par (HOLD + CHANGE = 1).
- **Settlement comes from the chain, not from Predge.** The only entry point that settles is
  `onReport`, callable only by the configured Chainlink CRE forwarder. The workflow in
  `cre/settle-notes` reads `getOutcomeSlotCount`, `payoutDenominator` and `payoutNumerators(0..1)`
  from Polymarket's Conditional Tokens contract on Polygon
  (`0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`), all at the same finalized block, on every DON node.
  If the denominator is 0 (not resolved) nothing is written. Otherwise the DON signs
  `abi.encode(conditionId, payout0, payout1, denominator, polygonBlock)`, the forwarder verifies the
  signatures and calls `onReport`. HOLD wins if the payout vector equals the proposal vector up to
  scale (`p0*q1 == p1*q0`), otherwise CHANGE. CTF payouts can be set only once, so the factory
  accepts one report per condition and it is final. The owner cannot settle, cannot move
  collateral, and cannot change a listed note.
- **Redemption after settlement.** `redeem`: the winning leg pays 1 collateral, the other 0.
- **Fallback.** If no report arrives before `expiry` (60 days by default), anyone can call
  `expire`; each leg then redeems for 0.5. Collateral can never be stuck, and the books always
  balance (tested: the factory ends every scenario with zero collateral after all redemptions).

The Predge API is used for two things only: to read the dispute (condition id, proposal, dispute tx)
when listing, and to set the market maker's first quotes. Neither touches settlement.

CRE simulation against real Polygon (13 Oct 2026, `kuru/cre/out/simulate-2026-10-13.txt`):

```
[0x50d4…96a8] Polygon CTF @95444351: slots=2 denominator=0 payouts=[0,0] -> unresolved   5219930, in a UMA vote
[0x4e1c…f478] Polygon CTF @95444359: slots=2 denominator=1 payouts=[0,1] -> resolved     1004831, proposal No, settled No  -> HOLD
[0xddff…f1e0] Polygon CTF @95444364: slots=2 denominator=1 payouts=[0,1] -> resolved     1112268, proposal Over, settled Under -> CHANGE
```

### 4. Legal and operational approach; market formation and liquidity

Legal and operational:

- Testnet only in this submission. Collateral is `TestUSD`, a 6-decimal token with an open faucet
  and no value, because the official Kuru testnet USDC has no public mint. The factory takes any
  ERC-20; `--collateral 0x3bA3…1570` switches the same scripts to Kuru's testnet USDC.
- Fully collateralized, no leverage, no oracle price feeds, no admin path to user funds. Settlement
  is a reading of public chain state that anyone can repeat.
- A note on a prediction market is itself an event contract. Before mainnet: restrict the front end
  by geography the way Polymarket does, list only markets whose underlying is permitted for the
  user base, publish the listing rules, and take legal advice on whether the issuer (Predge) or an
  independent listing entity should hold the `createNote` role. The
  factory is built so that this role can be moved (`setOwner`) without touching listed notes.
- Operations: Predge already watches every Polymarket dispute live (that is its product). A note
  is listed within minutes of a dispute, and the CRE cron settles open notes every 10 minutes.

Market formation and liquidity:

- **Day one: Predge is the maker.** It mints pairs, sells CHANGE on the Kuru book and keeps HOLD
  (or sells both legs on two books). Seed quotes are centered on Predge's reference rate for the
  dispute stage; for 5219930 that is 0.2166 (68 of 314 twice-disputed 2026 markets settled
  differently, 95% CI 0.175 to 0.265), giving bids 0.18 / 0.15 and asks 0.25 / 0.28, 50 CHANGE each.
- **The rate is a base rate, not a view on this market.** On 12 Oct 21:10 UTC Polymarket's Yes on
  5219930 traded at 0.0135, and the question creator had posted a clarification against Yes. That
  gap is exactly what the book is for: if CHANGE is too expensive relative to Polymarket's Yes,
  anyone can sell CHANGE on Kuru and buy Yes on Polymarket. Cross-venue arbitrage ties the two
  prices and brings in takers. `--ref` lets the maker quote nearer Polymarket.
- **Mint-and-sell keeps the book two-sided.** Any holder of collateral can mint a pair and sell the
  leg they do not want, so supply is never capped by the maker's inventory.
- **Kuru's AMM vault** (`kuruAmmSpread` 100 bps) can add backstop liquidity once a note has a price.
- **Short life helps.** Most notes resolve within hours to days, so inventory turns fast and the
  maker's risk across many small notes averages toward the base rate it quotes.

Kuru market parameters (from `@kuru-labs/kuru-sdk` `ParamCreator.calculatePrecisions(0.2, 1, 1, 1, 500)`):
price precision 10^4 (tick 0.01), size precision 10^4, min size 1 CHANGE, max 1,000,000 CHANGE,
taker 30 bps, maker 10 bps.

### 5. Roadmap

1. **This week (testnet):** deployed and settled live for two resolved markets (above); settle the
   5219930 note from the real UMA vote result through the same `cre workflow simulate --broadcast`.
2. **Next 4 weeks:** automatic listing for every new Polymarket dispute (Predge already detects
   them), Kuru testnet books for each, a small maker bot quoting from the reference rate and the
   Polymarket price, and a CHANGE basket token across all open notes.
3. **Mainnet gate:** a deployed CRE workflow on the production KeystoneForwarder with the workflow
   owner pinned in the factory (`pinWorkflow`), an audit of `DisputeNotes.sol`, USDC or AUSD
   collateral, and the legal review above. Kuru mainnet book creation is owner-only, so mainnet
   listing would be with Kuru's team.
4. **After:** notes on other optimistic-oracle settlements (UMA-based markets beyond Polymarket),
   and use of notes as a hedge leg inside lending against prediction-market positions.

## Trust assumptions, stated plainly

- **Settlement trusts the CRE DON and Polygon's finalized state.** On this testnet build the
  forwarder is Chainlink's `MockKeystoneForwarder` (`0xB9F7…D192`), which is what
  `cre workflow simulate --broadcast` uses. **It does not check DON signatures, so on testnet anyone
  could call it with a fake report.** That is acceptable for a testnet demo and not for value. On
  mainnet the forwarder is the production KeystoneForwarder, and `pinWorkflow` pins the workflow
  owner (and optionally name) carried in the report metadata.
- **The disputed proposal is set at listing by the issuer**, not proven on chain. It is public
  (`notes(id).proposal0/1` and `disputeTx`) so a buyer can check it before trading. A future version
  could have the CRE workflow also read the disputed price from UMA's Optimistic Oracle.
- **Binary conditions only.** Non-binary CTF conditions are refused by the workflow. Labels other than
  Yes/No/50-50 (for example Over/Under) need the vector passed by hand.
- **Expiry fallback is a choice.** If a market is still unresolved at expiry, both legs pay 0.5.
  A late resolution after `expire()` no longer changes the payout.
- **Kuru market buys reverted in simulation.** `placeAndExecuteMarketBuy` reverted without data in
  `eth_simulateV1` (both `isMargin` true and false); a crossing limit order filled correctly. Not
  investigated further.

## What was run

```bash
cd kuru && npm install && npm test                 # 17 pass (ganache, contracts compiled for shanghai)
cd kuru/cre/settle-notes && bun install && bun test # 9 pass (CRE SDK test runtime)
cd kuru/cre && cre workflow build ./settle-notes --target staging-settings
cre workflow simulate ./settle-notes --target staging-settings --non-interactive --trigger-index 1 \
  --http-payload '{"condition_id":"0xddff7251af9c56b2048edd2513019e55ae104143faa97d5799978f926bfcf1e0"}'
node kuru/scripts/deploy.mjs                         # dry run (from the repo root)
node kuru/scripts/simulate.mjs                       # full lifecycle in eth_simulateV1, nothing sent
```

`deploy.mjs` dry run, 13 Oct 2026:

```
Kuru Router.deployProxy check (eth_call with stand-in tokens): succeeds, would return 0x275D…367E, gas 1301551
  TestUSD deploy                           gas    393593
  DisputeNoteFactory deploy                gas   2485497
  createNote (2 NoteTokens)                gas   1290000   (ganache)
  faucet + approve + mint                  gas    310000   (ganache)
  Kuru Router.deployProxy                  gas   1301551
  approve x2 + MarginAccount.deposit x2    gas    400000   (guess)
  4 limit orders                           gas   1400000   (guess)
total gas limit 8338704  cost ~0.85 MON at 102 gwei; required balance with 25% headroom 1.06 MON (balance 0.0067)
```

`simulate.mjs` on live Monad testnet state, 13 Oct 2026 (`deployments/simulate-*.json`):

```
ok   deploy TestUSD / deploy DisputeNoteFactory / createNote / faucet / approve / mint 200 HOLD + 200 CHANGE
ok   Kuru Router.deployProxy CHANGE/tUSD
ok   approve + MarginAccount.deposit CHANGE, approve + MarginAccount.deposit tUSD
ok   buy 50 CHANGE @ 0.18 / sell 50 @ 0.25 / buy 50 @ 0.15 / sell 50 @ 0.28
ok   bestBidAsk                                  bid 0.18 ask 0.25 (1e18 scale)
ok   taker deposits 5 tUSD, crossing limit buy 8 CHANGE @ 0.25   -> 7.976 CHANGE (after 30 bps taker fee)
ok   taker withdraws CHANGE from the margin account
ok   HYPOTHETICAL CRE report via forwarder: payouts [1,0]   note state 2 (CHANGE wins)
ok   taker redeems 7.976 CHANGE                  -> 7.976 tUSD
```

The settlement step is hypothetical (5219930 is still in a UMA vote); in the simulation the forwarder
address calls `onReport` directly, the same call the forwarder makes on chain.

To go live once the deployer is funded:

```bash
CONFIRM_TESTNET=yes node kuru/scripts/deploy.mjs --send   # writes kuru/deployments/monad-testnet.json
```

Then set `notes.factory` and `"write": true` in `cre/settle-notes/config.staging.json`, and after the
UMA vote run the simulate command above with `--broadcast` (needs `CRE_ETH_PRIVATE_KEY` with a
little testnet MON).

## Files

| Path | What |
|---|---|
| `contracts/DisputeNotes.sol` | `DisputeNoteFactory` (list, mint, merge, CRE settlement, redeem, expiry) and `NoteToken` (HOLD/CHANGE ERC-20) |
| `contracts/TestUSD.sol` | testnet collateral with an open faucet, no value |
| `scripts/deploy.mjs` | dry run by default; `--send` deploys, lists, mints, opens the Kuru book, seeds quotes; resumable |
| `scripts/simulate.mjs` | the whole lifecycle in `eth_simulateV1` on live testnet state |
| `scripts/compile.mjs` | solc 0.8.26 from the repo root, same settings as `monad/contracts/deploy.mjs` |
| `test/` | contract tests (ganache) and helper tests |
| `cre/settle-notes/` | CRE workflow: Polygon CTF read, decision, report to the factory; tests |
| `cre/out/simulate-2026-10-13.txt` | `cre workflow simulate` output for three real conditions |
