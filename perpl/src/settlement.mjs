// Settlement side: what Perpl's own price says the outcome should be, what UMA has proposed,
// and whether Predge's signed record says the payout is final.
import { extractRecord, isSafeToAct, parseSettlementRisk } from "@predge/settlement-risk";

const PREDGE_API = process.env.PREDGE_API_URL || "https://api.predge.io";

/**
 * Perpl reference for the observation: close of the Perpl candle that ends at the observation time.
 * Perpl prices track Binance, Hyperliquid, OKX and Bybit plus a Chainlink index, not Binance BTC/USDT
 * alone, so a close within `toleranceBps` of the threshold is reported as too close to call.
 */
export async function perplReference(pub, mkt, market, toleranceBps) {
  const start = market.observationMs - market.candleSec * 1000;
  const candles = await pub.candles(mkt, market.candleSec, start, market.observationMs);
  const c = candles.find((x) => x.t === start) ?? candles.filter((x) => x.t <= start).at(-1);
  if (!c) return { available: false, reason: `no Perpl ${market.candleSec}s candle at ${new Date(start).toISOString()}` };
  const gapBps = ((c.c - market.threshold) / market.threshold) * 1e4;
  const implied = c.c > market.threshold ? "Yes" : "No";
  return {
    available: true,
    candleStart: new Date(c.t).toISOString(),
    candleSec: market.candleSec,
    close: c.c,
    threshold: market.threshold,
    gapBps: Math.round(gapBps * 10) / 10,
    implied,
    tooCloseToCall: Math.abs(gapBps) < toleranceBps,
  };
}

/**
 * Predge status for a Polymarket market. A signed record (resolved markets) is verified with the
 * pinned Predge key through @predge/settlement-risk; an open market's free response is unsigned and
 * is labelled as such, used only to watch, never to release funds.
 */
export async function predgeStatus(marketId, { fetch: f = globalThis.fetch } = {}) {
  const url = `${PREDGE_API}/v1/settlement-risk/${marketId}`;
  const res = await f(url, { headers: { accept: "application/json" } });
  if (!res.ok) return { available: false, reason: `HTTP ${res.status}`, url };
  const body = await res.json();
  if (body?.attestation?.canonical || body?.record?.canonical) {
    const r = parseSettlementRisk(extractRecord(body), url);
    const signedPayload = JSON.parse(r.record.canonical); // already verified by parseSettlementRisk
    const cp = signedPayload.current_proposal;
    return {
      available: true, signed: true, url,
      riskLevel: r.riskLevel, umaState: r.umaState, resolved: r.resolvedOnChain, outcome: r.outcome,
      disputeCount: r.disputeCount, openDispute: r.openDispute, disputedProposals: r.disputes.map((d) => d.disputed_proposal),
      proposed: cp?.proposed_outcome ?? cp?.outcome ?? (typeof cp === "string" ? cp : null),
      challengeWindowEnds: cp?.challenge_window_ends ?? null,
      recommendation: r.recommendation, checkedAt: r.checkedAt,
    };
  }
  return {
    available: true, signed: false, url,
    riskLevel: body.risk_level, umaState: body.uma_state, resolved: body.resolved_on_chain === true,
    outcome: body.onchain_resolution?.outcome ?? null,
    disputeCount: Number(body.dispute_count ?? 0), openDispute: body.open_dispute === true,
    disputedProposals: (body.disputes || []).map((d) => d.disputed_proposal),
    proposed: body.current_proposal?.proposed_outcome ?? null,
    challengeWindowEnds: body.current_proposal?.challenge_window_ends ?? null,
    recommendation: body.recommendation, checkedAt: body.checked_at,
    segmentDisputeRate: body.segment_dispute_rate?.rate ?? null,
  };
}

/** Release the payout only when the signed record is resolved (and, if given, matches the expected outcome). */
export async function releaseDecision(marketId, opts = {}) {
  const d = await isSafeToAct(marketId, { maxRisk: "resolved", skipOnchain: opts.skipOnchain ?? true, ...(opts.outcome ? { outcome: opts.outcome } : {}) });
  return { safe: d.safe, reason: d.reason, riskLevel: d.riskLevel, outcome: d.outcome };
}
