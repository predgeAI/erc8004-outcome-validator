#!/usr/bin/env node
// Dispute exposure: who holds the contested side of a disputed Polymarket market, and what to do about it.
//
//   node nansen/exposure.mjs <market_id> [--no-pay] [--budget 0.20]
//
// Predge says whether a market's UMA resolution is disputed and which proposed outcome was disputed
// (signed record, verified with the SDK). Nansen says who holds each side and how good those wallets are.
// Neither source has the other half. Together: dollars on the contested outcome vs the other side, how
// concentrated it is, whether high-win-rate wallets sit on the contested side, and one decision:
// hedge / size down / wait / fine.
//
// Nansen calls (x402, USDC on Monad mainnet, capped, cached; see nansen-x402.mjs):
//   top-holders      $0.05   largest holders, side and share count
//   position-detail  $0.05   per-wallet cost, unrealized value, redemption value, outcome labels
//   address-summary  $0.01   x3, win rate / PnL / markets traded for the top 3 holders
// Output: JSON on stdout (or --summary for text only), nansen/cache/exposure-<id>.json, nansen/examples/<id>.json
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseSettlementRisk, extractRecord, PREDGE_API } from "@predge/settlement-risk";
import { nansenCall, readChallenge, readLedger, spentUnits, CAP_UNITS, MAX_PRICE_UNITS, MONAD, USDC_MONAD } from "./nansen-x402.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const marketId = args.find((a) => /^\d{1,12}$/.test(a));
if (!marketId) { console.error("usage: node nansen/exposure.mjs <market_id> [--no-pay] [--budget 0.20] [--summary]"); process.exit(2); }
const noPay = args.includes("--no-pay") || process.env.NANSEN_NO_PAY === "1";
const bi = args.indexOf("--budget");
const runBudgetUnits = ethers.parseUnits(bi >= 0 ? args[bi + 1] : "0.20", 6);
const runSpent = { units: 0n };
const HOLDERS_N = 50;
const SMART = { minWinRate: 0.6, minMarkets: 20 }; // "high win rate": >= 60% of >= 20 traded markets
const norm = (s) => String(s ?? "").trim().toLowerCase();
const r2 = (x) => (x === null || x === undefined || Number.isNaN(x) ? null : Math.round(x * 100) / 100);
const usd0 = (x) => (x === null || x === undefined ? "n/a" : `$${Number(x).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
const sum = (xs, f) => xs.reduce((s, x) => s + (Number(f(x)) || 0), 0);

// 1. Predge: signed settlement-risk record, verified against the pinned key
// The raw API body is cached in nansen/cache/predge-<id>.json (--refresh-predge to refetch); the signature
// and content hash are re-verified with the SDK on every run, cached or not.
const predgeCache = path.join(HERE, "cache", `predge-${marketId}.json`);
let predgeBody = existsSync(predgeCache) && !args.includes("--refresh-predge") ? JSON.parse(readFileSync(predgeCache, "utf8")) : null;
for (let i = 0; !predgeBody && i < 4; i++) {
  const res = await fetch(`${PREDGE_API}/v1/settlement-risk/${marketId}`, { headers: { accept: "application/json" } });
  if (res.status === 429) { const s = Number(res.headers.get("retry-after") || 30); console.error(`Predge rate limit, retrying in ${s}s`); await new Promise((r) => setTimeout(r, (s + 1) * 1000)); continue; }
  if (!res.ok) throw new Error(`Predge HTTP ${res.status}`);
  predgeBody = await res.json();
  mkdirSync(path.dirname(predgeCache), { recursive: true });
  writeFileSync(predgeCache, JSON.stringify(predgeBody, null, 2) + "\n");
}
if (!predgeBody) throw new Error("Predge record unavailable (rate limited)");
const risk = parseSettlementRisk(extractRecord(predgeBody), `${PREDGE_API}/v1/settlement-risk/${marketId}`);
if (risk.marketId !== marketId) throw new Error(`signed record is for market ${risk.marketId}, asked for ${marketId}`);
const signed = JSON.parse(risk.record.canonical);
const contested = risk.disputes.length ? risk.disputes[risk.disputes.length - 1].disputed_proposal : null;
const predge = {
  marketId: risk.marketId, conditionId: risk.conditionId, umaQuestionId: risk.umaQuestionId, riskLevel: risk.riskLevel, umaState: risk.umaState,
  resolvedOnChain: risk.resolvedOnChain, outcome: risk.outcome, openDispute: risk.openDispute, sentToUmaVote: risk.sentToUmaVote,
  disputeCount: risk.disputeCount, disputes: risk.disputes, currentProposal: signed.current_proposal ?? null,
  settlesDifferentlyProbability: signed.settlement_estimate?.settles_differently_probability ?? null,
  recommendation: risk.recommendation, checkedAt: risk.checkedAt, signatureVerified: risk.verified,
};

// 2. Nansen. Market id: Nansen's prediction-market endpoints take the Polymarket market id, which is the
// id Predge signs (market_id); condition_id is kept alongside for cross-checking.
const pay = { pay: !noPay, runBudgetUnits, runSpent };
if (!noPay) {
  const pre = await readChallenge("top-holders", { market_id: marketId, pagination: { page: 1, per_page: HOLDERS_N }, order_by: [{ field: "position_size", direction: "DESC" }] });
  if (pre.httpStatus === 402 && !pre.acceptable) { console.error(`preflight: Monad option not acceptable, aborting: ${JSON.stringify(pre.monad)}`); process.exit(1); }
  console.error(`preflight 402: ${pre.monad?.network} asset ${pre.monad?.asset} amount ${pre.monad?.amount} payTo ${pre.monad?.payTo}; lifetime spend ${ethers.formatUnits(spentUnits(), 6)} / ${ethers.formatUnits(CAP_UNITS, 6)} USDC`);
}
const calls = [];
const call = async (ep, body) => { const r = await nansenCall(ep, body, pay); calls.push({ endpoint: ep, request: body, fetchedAt: r.fetchedAt, fromCache: r.fromCache, payment: r.payment }); return r; };

const th = await call("top-holders", { market_id: marketId, pagination: { page: 1, per_page: HOLDERS_N }, order_by: [{ field: "position_size", direction: "DESC" }] });
const holders = th.data?.data ?? [];
let pd = null;
try { pd = await call("position-detail", { market_id: marketId, pagination: { page: 1, per_page: HOLDERS_N } }); }
catch (e) { console.error(`position-detail skipped: ${e.message}`); }
const positions = pd?.data?.data ?? [];

// outcome labels: position-detail carries the label per outcome_index; top-holders carries side
const labelOf = new Map();
for (const p of positions) if (p.outcome_index !== undefined && p.outcome) labelOf.set(p.outcome_index, p.outcome);
const sideOf = (x) => x.outcome ?? labelOf.get(x.outcome_index) ?? x.side ?? `outcome ${x.outcome_index}`;
const isContested = (x) => contested !== null && norm(sideOf(x)) === norm(contested);

// top 3 distinct holders by share count, then address-summary
const top3 = [];
for (const h of holders) if (h.address && !top3.find((t) => t.address === h.address)) { top3.push(h); if (top3.length === 3) break; }
const summaries = {};
for (const h of top3) {
  try { const s = await call("address-summary", { address: h.address }); summaries[h.address] = (s.data?.data ?? [])[0] ?? null; }
  catch (e) { console.error(`address-summary ${h.address} skipped: ${e.message}`); summaries[h.address] = null; }
}
const isSmart = (s) => !!s && Number(s.win_rate) >= SMART.minWinRate && Number(s.markets_traded) >= SMART.minMarkets;

// 3. Exposure. Every dollar figure is a Nansen field (or a sum of Nansen fields), labeled with fetchedAt.
const sideStats = (pred) => {
  const hs = holders.filter(pred), ps = positions.filter(pred);
  return {
    holders: hs.length,
    shares: r2(sum(hs, (h) => h.position_size)),
    unrealizedPnlUsd: r2(sum(hs, (h) => h.unrealized_pnl_usd)),
    currentPrice: hs.find((h) => h.current_price !== undefined)?.current_price ?? ps.find((p) => p.current_price !== undefined)?.current_price ?? null,
    positions: ps.length,
    buyCostUsd: r2(sum(ps, (p) => p.buy_cost_usd)),
    unrealizedValueUsd: r2(sum(ps, (p) => p.unrealized_value_usd)),
    redemptionValueUsd: r2(sum(ps, (p) => p.redemption_value_usd)),
  };
};
const contestedSide = contested !== null ? sideStats(isContested) : null;
const otherSide = contested !== null ? sideStats((x) => !isContested(x)) : null;
const allShares = sum(holders, (h) => h.position_size);
const top3Shares = sum(top3, (h) => h.position_size);
const top3View = top3.map((h, i) => {
  const s = summaries[h.address];
  const pos = positions.filter((p) => p.address === h.address);
  return {
    rank: i + 1, address: h.address, owner: h.owner_address ?? null, side: sideOf(h), onContestedSide: isContested(h),
    shares: r2(h.position_size), avgEntryPrice: h.avg_entry_price ?? null, currentPrice: h.current_price ?? null, unrealizedPnlUsd: r2(h.unrealized_pnl_usd),
    buyCostUsd: pos.length ? r2(sum(pos, (p) => p.buy_cost_usd)) : null, unrealizedValueUsd: pos.length ? r2(sum(pos, (p) => p.unrealized_value_usd)) : null,
    winRate: s?.win_rate ?? null, marketsTraded: s?.markets_traded ?? null, marketsWon: s?.markets_won ?? null, totalPnlUsd: r2(s?.total_pnl_usd), walletAgeDays: s?.wallet_age_days ?? null,
    highWinRate: isSmart(s),
  };
});
const smartOn = top3View.filter((t) => t.highWinRate && t.onContestedSide);
const smartAgainst = top3View.filter((t) => t.highWinRate && !t.onContestedSide);
const top3Share = allShares > 0 ? top3Shares / allShares : null;

const fetchedAt = calls.map((c) => c.fetchedAt).sort().at(-1) ?? null;
// 4. Decision, for someone holding (or about to buy) the contested outcome. Two signals:
//    a) price of the hedge: Nansen's current price of the other side vs Predge's signed probability that
//       the market settles differently from the disputed proposal (a reference rate, not a forecast)
//    b) informed money: Nansen buy cost of high-win-rate top-3 wallets on each side
let decision, reason;
const pct = (x) => (x === null || x === undefined ? "n/a" : `${Math.round(x * 1000) / 10}%`);
const flipP = predge.settlesDifferentlyProbability === null ? null : Number(predge.settlesDifferentlyProbability);
const hedgePrice = otherSide?.currentPrice ?? null;
const smartCostOn = sum(smartOn, (t) => t.buyCostUsd), smartCostAgainst = sum(smartAgainst, (t) => t.buyCostUsd);
const who = (ts) => ts.map((t) => `${t.address.slice(0, 8)} (win rate ${pct(t.winRate)} over ${t.marketsTraded} markets, cost ${usd0(t.buyCostUsd)} on ${t.side})`).join(", ");
const stage = risk.sentToUmaVote ? "disputed and in a UMA vote" : "disputed";
const signals = { settlesDifferentlyProbability: flipP, hedgePrice, hedgeCheapBy: flipP !== null && hedgePrice !== null ? Math.round((flipP - hedgePrice) * 10000) / 10000 : null, highWinRateCostOnUsd: r2(smartCostOn), highWinRateCostAgainstUsd: r2(smartCostAgainst), top3Share };
if (risk.resolvedOnChain) {
  decision = "fine";
  reason = `resolved on chain (${risk.outcome}); nothing left to settle${contested ? `. The disputed proposal was ${contested} and the market ${norm(contested) === norm(risk.outcome) ? "settled as proposed" : "settled differently from it"}` : ""}.` + (contested && contestedSide && otherSide ? ` Retrospective (Nansen position-detail, first ${HOLDERS_N} positions, as of ${fetchedAt}): buy cost ${usd0(contestedSide.buyCostUsd)} on ${contested} vs ${usd0(otherSide.buyCostUsd)} on the other side.` : "");
} else if (!contested) {
  decision = risk.riskLevel === "ok" ? "fine" : "wait";
  reason = risk.riskLevel === "ok" ? "no dispute on record; positioning shows no settlement conflict." : `no dispute yet but Predge risk is ${risk.riskLevel}: ${risk.recommendation}`;
} else if ((signals.hedgeCheapBy !== null && signals.hedgeCheapBy >= 0.05) || smartCostAgainst > smartCostOn) {
  decision = "hedge";
  reason = `${contested} is ${stage}. Nansen as of ${fetchedAt}: ` + (signals.hedgeCheapBy !== null && signals.hedgeCheapBy >= 0.05 ? `the other side trades at ${hedgePrice} while Predge's signed reference rate that it settles differently from ${contested} is ${pct(flipP)}, so the hedge is cheap relative to the risk. ` : "") + (smartAgainst.length ? `High-win-rate money against ${contested}: ${who(smartAgainst)}` : "No high-win-rate top-3 wallet is against it") + (smartOn.length ? `; for it: ${who(smartOn)}.` : ".");
} else if ((top3Share !== null && top3Share > 0.5) || smartAgainst.length) {
  decision = "size down";
  reason = `${contested} is ${stage}; Nansen as of ${fetchedAt}: ` + (top3Share > 0.5 ? `the top 3 wallets hold ${pct(top3Share)} of the shares in Nansen's top ${HOLDERS_N}, so a few holders can move the price while it is open` : `high-win-rate money is on both sides (against: ${who(smartAgainst)})`) + ".";
} else {
  decision = "wait";
  reason = `${contested} is ${stage}${flipP !== null ? ` (Predge reference rate ${pct(flipP)} that it settles differently; Nansen hedge price ${hedgePrice ?? "n/a"})` : ""}; no high-win-rate top-3 wallet is against it and holdings are not concentrated, so wait for the resolution rather than add.`;
}

const out = {
  kind: "predge-nansen-dispute-exposure", version: 1, generatedAt: new Date().toISOString(),
  market: { marketId, conditionId: risk.conditionId, question: null },
  decision, reason,
  predge,
  exposure: {
    contestedOutcome: contested,
    asOf: fetchedAt,
    source: `Nansen prediction-market top-holders (top ${HOLDERS_N} by shares) and position-detail (first ${HOLDERS_N} positions), fetched ${fetchedAt}`,
    contestedSide, otherSide,
    top3ShareOfTopHolders: top3Share === null ? null : Math.round(top3Share * 1000) / 1000,
    highWinRateRule: `win_rate >= ${SMART.minWinRate} and markets_traded >= ${SMART.minMarkets} (Nansen address-summary)`,
    signals,
    highWinRateOnContestedSide: smartOn.map((t) => t.address),
    highWinRateAgainstContestedSide: smartAgainst.map((t) => t.address),
    top3: top3View,
    holdersReturned: holders.length, positionsReturned: positions.length,
  },
  nansen: { calls, paidThisRunUSDC: ethers.formatUnits(runSpent.units, 6), costUSDC: ethers.formatUnits(calls.reduce((a, c) => a + (c.payment?.tx ? ethers.parseUnits(c.payment.amountUSDC, 6) : 0n), 0n), 6), payments: calls.filter((c) => c.payment?.tx).map((c) => ({ endpoint: c.endpoint, amountUSDC: c.payment.amountUSDC, tx: c.payment.tx, explorer: c.payment.explorer })) },
  spend: { lifetimeUSDC: ethers.formatUnits(spentUnits(readLedger()), 6), capUSDC: ethers.formatUnits(CAP_UNITS, 6), maxPerCallUSDC: ethers.formatUnits(MAX_PRICE_UNITS, 6), asset: `USDC ${USDC_MONAD}`, network: MONAD.network },
};
// unsigned display field only
out.market.question = predgeBody?.market?.question ?? null;

const side = (n, s) => s ? `${n}: ${s.holders} top holders, ${Number(s.shares).toLocaleString("en-US")} shares, cost ${usd0(s.buyCostUsd)}, unrealized value ${usd0(s.unrealizedValueUsd)}, price ${s.currentPrice ?? "n/a"}` : "";
out.summary = [
  `${out.market.question ?? `market ${marketId}`} (Polymarket ${marketId})`,
  `Predge: ${risk.riskLevel}, UMA ${risk.umaState}, disputes ${risk.disputeCount}${contested ? `, disputed proposal ${contested}` : ""}${risk.resolvedOnChain ? `, resolved ${risk.outcome}` : ""}; signature verified ${risk.verified.signature && risk.verified.pinnedKey}`,
  ...(contested ? [`Nansen, as of ${fetchedAt}:`, `  contested (${contested}) ${side("", contestedSide).slice(2)}`, `  other side ${side("", otherSide).slice(2)}`] : []),
  `  top 3 hold ${pct(top3Share)} of top-${HOLDERS_N} shares: ${top3View.map((t) => `${t.address.slice(0, 10)} ${t.side} ${Number(t.shares).toLocaleString("en-US")} sh, win rate ${t.winRate === null ? "n/a" : pct(t.winRate)} of ${t.marketsTraded ?? "n/a"}`).join("; ")}`,
  `DECISION: ${decision.toUpperCase()}: ${reason}`,
  `Nansen data for this market cost ${out.nansen.costUSDC} USDC on Monad (${out.nansen.payments.length} x402 payments, ${out.nansen.paidThisRunUSDC} paid this run, rest from cache); lifetime ${out.spend.lifetimeUSDC} / ${out.spend.capUSDC} USDC`,
].join("\n");

for (const dir of ["cache", "examples"]) mkdirSync(path.join(HERE, dir), { recursive: true });
writeFileSync(path.join(HERE, "cache", `exposure-${marketId}.json`), JSON.stringify(out, null, 2) + "\n");
writeFileSync(path.join(HERE, "examples", `${marketId}.json`), JSON.stringify(out, null, 2) + "\n");
writeFileSync(path.join(HERE, "examples", `${marketId}.txt`), out.summary + "\n");
console.error(out.summary);
if (!args.includes("--summary")) console.log(JSON.stringify(out, null, 2));
