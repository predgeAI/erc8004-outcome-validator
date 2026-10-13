# Perpl Settlement Hedger

A trading bot on Perpl for people who hold Polymarket crypto price markets ("Bitcoin above 84,000 on October 14?").

1. **Before the observation time** it delta-hedges the position on the matching Perpl perp (BTC, ETH, SOL, MON, HYPE, ZEC). It prices the binary from Perpl's own mark and Perpl's candle volatility, sizes the hedge, and sends IOC orders in Perpl's `mt 22` format.
2. **In the last 15 minutes** a near-the-money binary's delta swings too fast to chase. The bot goes flat.
3. **After the observation** it flattens the hedge and checks the outcome. It compares the Perpl candle that matches the market's rule with the threshold, and it reads what UMA has proposed through Predge. The expected payout stays **reserved** (it is not counted as free capital) until Predge's signed record says the UMA resolution is final. The bot raises an alert when the proposal disagrees with the Perpl reference, or when the price closed too close to the threshold to call.

It runs in paper mode against live Perpl market data. Live mode places orders only on Perpl testnet. It has no mainnet order path.

## Why traders need it

* **Polymarket crypto threshold markets are short binary options.** A YES position on "BTC above 84,000 tomorrow" carries about $176 of P&L per 1% BTC move (the live example below). Holders and market makers cannot hedge that on Polymarket. A perp can, and Perpl is the perp venue on Monad.
* **The hedge has to stop at the observation, but the money does not arrive then.** Disputed crypto markets stay unpaid for days. In the replay below, BTC above 78,000 on April 24 closed 7.9 bps from the line on Perpl. Both "No" proposals were disputed, and the payout was locked for 56.6 hours. A bot that books the expected payout as margin before it is final is trading on money it may not get. Predge's 2026 scan (in the API response) counts 2,666 disputed Polymarket markets, and 33.5% of the settled ones resolved differently from the disputed proposal.
* **The model is anchored to Perpl, and it agrees with the market.** Across 33 open BTC, ETH and SOL markets on 13 Oct 2026, the bot's probability from Perpl mark and volatility differed from Polymarket's price by 1.1 points on average (2.3 points for the 8 markets priced between 5% and 95%). That is close enough to hedge with. It is not a claim of edge.

## What ran (real outputs in `examples/`)

| File | What it is |
|---|---|
| `scan-mainnet.json` | `scan`: 33 open Polymarket BTC/ETH/SOL markets priced from Perpl mainnet mark and 48h candle vol, with the hedge each needs |
| `paper-run.jsonl` | `run --once` on `positions.json`: two positions hedged (orders and book-walk fills), one waiting on its UMA proposal, one disputed market released on a verified signed record |
| `paper-stream.jsonl` | `run --stream`: re-runs triggered by Perpl's `market-state` WebSocket when a mark moves 8 bps |
| `paper-testnet.jsonl` | the same paper run against Perpl testnet market data (BTC 16, ETH 32) |
| `replay-2007078-yes.json` | 24 hourly steps on real Perpl mainnet candles and real Polymarket prices for "Bitcoin above $78,000 on April 24", then the real settlement |
| `replay-5238640-yes.json`, `replay-5238644-yes.json` | the same for two undisputed Oct 10 BTC markets |

Live paper decision, 13 Oct 2026 06:17 UTC (`paper-run.jsonl`, first line):

```
Will the price of Bitcoin be above $84,000 on October 14?   YES x1000, Polymarket 0.415
Perpl BTC (1) mark 83,538.5, 48h vol 35.3%, 33.7 h to go -> model P(yes) 0.396
target hedge -0.21080 BTC -> frame {mt:22, mkt:1, t:2 OpenShort, p:832557, s:21079, fl:4 IOC, lv:300, lb:head+20}
paper fill 0.21079 BTC @ 83,486.83 (walked the live book), fee $6.07
```

Replay of the disputed market (`bin/replay.mjs --market 2007078`, YES x1000 bought at 0.605, 24 h before):

| | Unhedged | Hedged on Perpl |
|---|---|---|
| Std. dev. of hourly P&L, last 24 h | $90.78 | **$37.16** |
| Final P&L (resolved No) | -$605.00 | -$545.80 |
| Hedge P&L after 5 bps costs | | +$59.20 |

The model tracked Polymarket hour by hour (for example 0.254 vs 0.285 at 10:00, 0.663 vs 0.625 at 12:00). Settlement: the Perpl 1m close was 78,061.6, which is 7.9 bps above the line, so the bot flagged it "too close to call". UMA statuses went proposed, disputed, proposed, disputed. Predge's signed record (verified against the pinned key) says resolved No with 2 disputes. The payout was released only after that record, 56.6 hours after the observation.

Two undisputed controls, run the same way (`replay-5238640-yes.json`, `replay-5238644-yes.json`):

| Market (YES x1000) | Entry | Hourly P&L std. dev., unhedged to hedged | Final P&L, unhedged / hedged | Perpl reference | Locked |
|---|---|---|---|---|---|
| BTC above $78,000 on Apr 24 (disputed twice) | 0.605 | $90.78 to $37.16 | -$605.00 / -$545.80 | +7.9 bps, too close to call | 56.6 h |
| BTC above $82,000 on Oct 10 | 0.835 | $33.61 to $21.96 | +$165.00 / +$92.49 | +117.1 bps, Yes | 0.6 h |
| BTC above $84,000 on Oct 10 | 0.125 | $14.00 to $16.15 | -$125.00 / -$124.97 | -123.8 bps, No | 0.6 h |

The hedge cuts the swings where the binary is near the money (first two rows). It gives up upside when the position wins, and it adds noise when the position is far out of the money with little delta (third row). Three markets are a sanity check, not a backtest. The other disputed crypto markets in Predge's records (March 14 ETH, SOL, XRP) predate Perpl's listings, so Perpl has no candles for them.

## Perpl endpoints used

| Endpoint | Use |
|---|---|
| `GET /api/v1/pub/context` | market ids, price/size decimals, taker fee, `order_ttl_blocks`, `is_open` |
| `GET /api/v1/market-data/:id/ticker` | mark, oracle, bid/ask, head block |
| `GET /api/v1/market-data/:id/book?levels=20` | touch price for IOC limits; paper fills walk these levels |
| `GET /api/v1/market-data/:id/candles/3600/:from-:to` | 48 h realized volatility |
| `GET /api/v1/market-data/:id/candles/{60,3600}/:from-:to` | reference close at the observation (1m for daily markets, 1h for hourly) |
| `wss /ws/v1/market-data`, stream `market-state@<chain_id>` (`mt 5`, `mt 9`, keep-alive `mt 1`) | re-run trigger on mark moves |
| `wss /ws/v1/trading`: `ApiKeySignIn` (`mt 29`), `WalletSnapshot` (`mt 19`, `lfr` seeds `rq`), `PositionsSnapshot` (`mt 26`), `OrderRequest` (`mt 22`), `StatusResponse` (`mt 3`, matched by `cid` = our `sn`) | live testnet orders |
| Ed25519 request signing (REST canonical string and WS sign-in) | `src/auth.mjs`, checked against the docs' worked example and RFC 8032 vector |

Other sources: Polymarket Gamma (market rules, prices), Polymarket CLOB `prices-history` (replay only), and `api.predge.io/v1/settlement-risk/:id` through `@predge/settlement-risk` (`../sdk`). That package verifies the ed25519 signature against the pinned Predge key, plus the content hash and market id, before any field is used. `isSafeToAct(id, { maxRisk: "resolved" })` gates every payout release.

## Run it

```bash
npm ci                       # at the repo root; builds ../sdk
cd perpl
npm test                     # 17 offline tests (stubbed Perpl, Polymarket, Predge; local WS server)
node bin/hedger.mjs scan                                       # open markets, priced from Perpl
node bin/hedger.mjs run --positions examples/positions.json --state /tmp/s.json --once
node bin/hedger.mjs run --positions examples/positions-hedging.json --state /tmp/s.json --stream --trigger-bps 8 --interval 600
node bin/replay.mjs --market 2007078 --side Yes --shares 1000
```

`positions.json` is a list of `{ marketId, side: "Yes"|"No", shares, overrides? }`. You can override any default in `src/config.mjs` per position: `hedgeRatio`, `maxHedgeUsd` (default $25,000), `pinZoneMinutes` (15), `rebalanceBand` (25%), `minTradeUsd` ($50), `maxSlippageBps` (30), `leverage` (3), `referenceToleranceBps` (15).

## Going live on testnet (what the owner provides)

Nothing below has been created. Live mode refuses to start without it and refuses any chain other than 10143.

1. A Monad testnet wallet with a little MON for gas.
2. Testnet AUSD (`0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`, 6 decimals). Opening an account needs at least **100 AUSD** (`min_account_open_amount` 100000000 in `/v1/pub/context`). For margin, about **1,000 AUSD** covers a demo with 100 to 300 share positions at 3x. The 1,000-share BTC example needs about $5.9k of margin at 3x.
3. An exchange account. Approve AUSD, then call `createAccount(uint256)` on the testnet Exchange `0x1964C32f0bE608E7D29302AFF5E61268E72080cc`. Note the account id.
4. A `read|trade` API key from testnet.perpl.xyz/apikeys. Save the 32-byte Ed25519 secret (hex) to a file with mode 600.
5. Then:

```bash
export PERPL_API_KEY=<X-API-Key token> PERPL_API_KEY_SECRET_FILE=/path/to/secret.hex PERPL_ACCOUNT_ID=<id>
node bin/hedger.mjs run --mode live --network testnet --positions examples/positions-hedging.json --stream --interval 600
```

The bot never prints or logs the secret. Withdrawals cannot be done with an API key on Perpl in any case.

## Limits, stated plainly

* Polymarket settles on Binance BTC/USDT. The Perpl reference is a Perpl candle (Perpl's mark blends Binance, Hyperliquid, OKX, Bybit and a Chainlink index), so closes within 15 bps of the line are reported as too close to call, not as an answer.
* The model is a driftless lognormal with realized vol and no funding carry. A full hedge of a near-the-money binary is notional-heavy. Use `hedgeRatio` and `maxHedgeUsd`.
* The live executor has been tested against a local WebSocket server that follows the documented frames, not against Perpl testnet, because there is no key yet. Order outcomes after admission (`mt 24`) are logged, not reconciled.
* API notes found while building: the market-data WebSocket is closed with `1008 ping timeout` after about 55 s unless the client sends `mt 1` pings, although the docs say market-data connections do not need them (the bot pings every 15 s; one close still happened with 25 s pings, and the bot reconnects). Mainnet `/v1/pub/context` returns an empty `symbol` for markets 1 (BTC) and 10 (MON), so the bot falls back to the documented id table. Max leverage from `initial_margin` is ambiguous (api-docs issue #7). Funding `rate` units are not documented.
