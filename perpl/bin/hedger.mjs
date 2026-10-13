#!/usr/bin/env node
// perpl-hedger: settlement-aware delta hedger for Polymarket crypto threshold positions on Perpl.
//   scan  [--query "Bitcoin above on October 14"] [--network mainnet]
//   run   --positions file.json [--state state.json] [--mode paper|live] [--network mainnet|testnet]
//         [--once | --interval 60] [--stream --trigger-bps 10] [--max-runs N] [--out run.jsonl]
//   --stream re-runs on Perpl market-state (WebSocket) whenever a watched mark moves --trigger-bps;
//   --interval is the fallback timer (pin-zone and settlement checks need time, not price, to move).
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadCredentials } from "../src/auth.mjs";
import { DEFAULTS } from "../src/config.mjs";
import { LiveTestnetExecutor, PaperExecutor } from "../src/executors.mjs";
import { Hedger } from "../src/hedger.mjs";
import { realizedVol, targetHedge, YEAR_MS } from "../src/model.mjs";
import { idSource } from "../src/orders.mjs";
import { PerplPublic } from "../src/perpl-api.mjs";
import { getMarket, parseThresholdMarket, searchThresholdMarkets } from "../src/polymarket.mjs";
import { MarkTrigger } from "../src/stream.mjs";

const { positionals, values: a } = parseArgs({
  allowPositionals: true,
  options: {
    network: { type: "string" }, mode: { type: "string", default: "paper" }, positions: { type: "string" },
    state: { type: "string" }, once: { type: "boolean", default: false }, interval: { type: "string" },
    out: { type: "string" }, stream: { type: "boolean", default: false }, "trigger-bps": { type: "string", default: "10" }, "max-runs": { type: "string" }, query: { type: "string", multiple: true }, shares: { type: "string", default: "1000" },
  },
});
const cmd = positionals[0] ?? "run";

if (cmd === "scan") {
  const pub = new PerplPublic(a.network ?? "mainnet");
  const queries = a.query ?? ["Bitcoin above on October 14", "Ethereum above on October 14", "Solana above on October 14"];
  const now = Date.now();
  const shares = Number(a.shares);
  const rows = [];
  const seen = new Set();
  for (const q of queries) {
    for (const m of await searchThresholdMarkets(q)) {
      if (m.closed || seen.has(m.marketId) || m.observationMs <= now) continue;
      seen.add(m.marketId);
      const mkt = await pub.market(m.symbol).catch(() => null);
      if (!mkt) continue;
      const tick = await pub.ticker(mkt);
      const vol = realizedVol(await pub.candles(mkt, 3600, now - DEFAULTS.volLookbackHours * 3600_000, now), 3600, DEFAULTS.volFloor);
      const h = targetHedge({ side: "Yes", shares, spot: tick.mark, strike: m.threshold, vol, years: (m.observationMs - now) / YEAR_MS, maxHedgeUsd: Infinity });
      rows.push({ marketId: m.marketId, question: m.question, perpl: `${m.symbol}(${mkt.id})`, mark: tick.mark, vol: +vol.toFixed(3), hours: +((m.observationMs - now) / 3600_000).toFixed(2), modelYes: +h.prob.toFixed(4), polymarketYes: m.yesPrice, [`hedge_for_${shares}_YES`]: `${h.target.toFixed(mkt.sizeDecimals)} ${m.symbol} ($${Math.round(h.hedgeUsd)})` });
    }
  }
  rows.sort((x, y) => Math.abs(0.5 - x.modelYes) - Math.abs(0.5 - y.modelYes));
  const report = { at: new Date(now).toISOString(), network: pub.net.name, endpoints: [...new Set(pub.calls.map((c) => c.replace(/\/\d+(?:-\d+)?(?=\/|$|\?| )/g, "/:x")))], markets: rows };
  console.log(JSON.stringify(report, null, 2));
  if (a.out) writeFileSync(a.out, JSON.stringify(report, null, 2) + "\n");
  process.exit(0);
}

if (cmd !== "run") { console.error(`unknown command ${cmd}`); process.exit(2); }
if (!a.positions) { console.error("run needs --positions <file.json>"); process.exit(2); }
const positions = JSON.parse(readFileSync(a.positions, "utf8"));

let executor, accountId = 0, ids = idSource(), pub;
if (a.mode === "live") {
  // Live orders go to Perpl testnet only. There is no mainnet switch in this tool.
  if ((a.network ?? "testnet") !== "testnet") { console.error("live mode is testnet-only"); process.exit(2); }
  pub = new PerplPublic("testnet");
  const creds = loadCredentials();
  accountId = creds.accountId;
  executor = new LiveTestnetExecutor({ net: pub.net, creds, ids });
  await executor.connect();
} else if (a.mode === "paper") {
  pub = new PerplPublic(a.network ?? "mainnet");
  const state = a.state && existsSync(a.state) ? JSON.parse(readFileSync(a.state, "utf8")) : {};
  executor = new PaperExecutor(state.positions ?? {});
  ids = idSource(state.lastRq ?? 0, (state.lastSn ?? 0) + 1);
} else { console.error("--mode must be paper or live"); process.exit(2); }

const hedger = new Hedger({ pub, executor, accountId, ids });

let runs = 0, busy = false;
async function tick(trigger) {
  if (busy) return;
  busy = true;
  runs += 1;
  for (const p of positions) {
    let rec;
    try { rec = await hedger.step(p); if (trigger) rec.trigger = trigger; } catch (e) { rec = { at: new Date().toISOString(), marketId: p.marketId, action: "error", error: e.message }; }
    console.log(JSON.stringify(rec));
    if (a.out) appendFileSync(a.out, JSON.stringify(rec) + "\n");
  }
  if (a.mode === "paper" && a.state) {
    const { rq: lastRq, sn: lastSn } = ids.last();
    writeFileSync(a.state, JSON.stringify({ positions: executor.state, lastRq, lastSn }, null, 2) + "\n");
  }
  busy = false;
  if (a["max-runs"] && runs >= Number(a["max-runs"])) { trigger$?.stop(); executor.close?.(); process.exit(0); }
}

let trigger$ = null;
await tick();
if (a.once) { executor.close?.(); process.exit(0); }
if (a.stream) {
  const symbols = new Set();
  for (const p of positions) { const m = parseThresholdMarket(await getMarket(p.marketId)); if (m) symbols.add(m.symbol); }
  const ids = [...symbols].map((s) => pub.net.markets[s]).filter(Boolean);
  trigger$ = new MarkTrigger({ net: pub.net, marketIds: ids, triggerBps: Number(a["trigger-bps"]), log: (x) => console.error(x), onTrigger: (hits) => tick({ source: `market-state@${pub.net.chainId}`, moved: hits }).catch((e) => console.error(e.message)) });
  trigger$.start();
}
if (a.interval) setInterval(() => tick({ source: "timer" }).catch((e) => console.error(e.message)), Number(a.interval) * 1000);
if (!a.stream && !a.interval) executor.close?.();
