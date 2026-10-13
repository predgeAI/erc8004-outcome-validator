#!/usr/bin/env node
// Replay a resolved Polymarket crypto threshold market through the hedger, hour by hour, using
// real Perpl mainnet candles and real Polymarket prices, then walk the real UMA settlement.
//   node bin/replay.mjs --market 2007078 [--side Yes] [--shares 1000] [--hours 24] [--out file]
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { DEFAULTS } from "../src/config.mjs";
import { realizedVol, targetHedge, YEAR_MS } from "../src/model.mjs";
import { PerplPublic } from "../src/perpl-api.mjs";
import { getMarket, parseThresholdMarket } from "../src/polymarket.mjs";
import { perplReference, predgeStatus, releaseDecision } from "../src/settlement.mjs";

const { values: a } = parseArgs({ options: { market: { type: "string", default: "2007078" }, side: { type: "string", default: "Yes" }, shares: { type: "string", default: "1000" }, hours: { type: "string", default: "24" }, costBps: { type: "string", default: "5" }, out: { type: "string" } } });
const shares = Number(a.shares), H = Number(a.hours), costBps = Number(a.costBps);
const sign = a.side === "Yes" ? 1 : -1;

const raw = await getMarket(a.market);
const m = parseThresholdMarket(raw);
if (!m) throw new Error(`unsupported market: ${raw.question}`);
const pub = new PerplPublic("mainnet");
const mkt = await pub.market(m.symbol);
const T = m.observationMs, HOUR = 3600_000;
const candles = (await pub.candles(mkt, 3600, T - (H + DEFAULTS.volLookbackHours + 1) * HOUR, T)).filter((c) => c.c > 0);
const tokenYes = JSON.parse(raw.clobTokenIds)[0];
const hist = await (await fetch(`https://clob.polymarket.com/prices-history?market=${tokenYes}&startTs=${(T - (H + 1) * HOUR) / 1000}&endTs=${T / 1000}&fidelity=60`)).json();
// nearest Polymarket print within 10 minutes of t (history points land a few seconds after the hour)
const pYesAt = (ms) => { let best = null, gap = 600_000; for (const x of hist.history || []) { const g = Math.abs(x.t * 1000 - ms); if (g <= gap) { gap = g; best = x.p; } } return best; };
const sidePrice = (ms) => { const y = pYesAt(ms); return y === null ? null : a.side === "Yes" ? y : 1 - y; };

const steps = [];
let pos = 0, cash = 0, costs = 0;
const start = T - H * HOUR;
const p0 = sidePrice(start);
for (let t = start; t <= T - DEFAULTS.pinZoneMinutes * 60_000; t += HOUR) {
  const past = candles.filter((c) => c.t + HOUR <= t);              // candles fully closed by t
  const spot = past.at(-1)?.c;
  if (!spot) continue;
  const vol = realizedVol(past.slice(-DEFAULTS.volLookbackHours), 3600, DEFAULTS.volFloor);
  const h = targetHedge({ side: a.side, shares, spot, strike: m.threshold, vol, years: (T - t) / YEAR_MS, maxHedgeUsd: DEFAULTS.maxHedgeUsd });
  const trade = h.target - pos;
  const fee = Math.abs(trade) * spot * costBps / 1e4;
  cash -= trade * spot; costs += fee; pos = h.target;
  const px = sidePrice(t);
  const polyPnl = px === null ? null : shares * (px - p0);
  const hedgePnl = cash + pos * spot - costs;
  steps.push({ at: new Date(t).toISOString(), spot, vol: +vol.toFixed(3), modelYes: +h.prob.toFixed(3), polymarketYes: pYesAt(t), hedge: +pos.toFixed(5), polyPnl: polyPnl === null ? null : +polyPnl.toFixed(2), hedgePnl: +hedgePnl.toFixed(2), combined: polyPnl === null ? null : +(polyPnl + hedgePnl).toFixed(2) });
}
if (!steps.length) throw new Error(`no Perpl ${m.symbol} candles before ${new Date(T).toISOString()} (market not listed on Perpl mainnet yet)`);
// flatten at the last pre-observation step's price (the pin-zone exit)
const lastSpot = steps.at(-1).spot;
cash += pos * lastSpot; costs += Math.abs(pos) * lastSpot * costBps / 1e4; pos = 0;

const sd = (xs) => { const v = xs.filter((x) => x !== null); const mu = v.reduce((s, x) => s + x, 0) / v.length; return Math.sqrt(v.reduce((s, x) => s + (x - mu) ** 2, 0) / (v.length - 1)); };
const hourly = (key) => steps.slice(1).map((s, i) => (s[key] === null || steps[i][key] === null ? null : s[key] - steps[i][key]));

const reference = await perplReference(pub, mkt, m, DEFAULTS.referenceToleranceBps);
const predge = await predgeStatus(m.marketId);
const release = predge.signed && predge.resolved ? await releaseDecision(m.marketId) : null;
const payout = predge.outcome === a.side ? shares : 0;
const closedMs = Date.parse(String(raw.closedTime).replace(" ", "T").replace(/\+00$/, "Z"));

const report = {
  market: { id: m.marketId, question: m.question, observation: new Date(T).toISOString(), umaStatuses: m.umaStatuses },
  position: { side: a.side, shares, entryPrice: p0, entryAt: new Date(start).toISOString() },
  assumptions: { perplMarket: `${m.symbol} (${mkt.id}) mainnet, 1h candle closes`, fills: `candle close, ${costBps} bps all-in cost`, pinZoneMinutes: DEFAULTS.pinZoneMinutes, volLookbackHours: DEFAULTS.volLookbackHours, maxHedgeUsd: DEFAULTS.maxHedgeUsd },
  preObservation: {
    hourlySteps: steps.length,
    hourlyPnlStdevUnhedged: +sd(hourly("polyPnl")).toFixed(2),
    hourlyPnlStdevHedged: +sd(hourly("combined")).toFixed(2),
    perpHedgePnlAfterCosts: +(cash - costs).toFixed(2),
    costs: +costs.toFixed(2),
    maxHedge: Math.max(...steps.map((s) => Math.abs(s.hedge))),
  },
  settlement: {
    perplReference: reference,
    predge: { signed: predge.signed, riskLevel: predge.riskLevel, outcome: predge.outcome, disputeCount: predge.disputeCount, disputedProposals: predge.disputedProposals },
    release,
    payoutUsd: payout,
    finalPnlUnhedged: +(payout - shares * p0).toFixed(2),
    finalPnlHedged: +(payout - shares * p0 + cash - costs).toFixed(2),
    payoutLockedHours: Number.isFinite(closedMs) ? +((closedMs - T) / HOUR).toFixed(1) : null,
  },
  steps,
};
console.log(JSON.stringify({ ...report, steps: `${steps.length} rows (see file)` }, null, 2));
if (a.out) writeFileSync(a.out, JSON.stringify(report, null, 2) + "\n");
