// One decision step for one Polymarket position: hedge before the observation, stand flat in the
// pin zone, flatten after the observation and hold the payout until Predge's signed record is final.
import { DEFAULTS } from "./config.mjs";
import { realizedVol, targetHedge, YEAR_MS } from "./model.mjs";
import { idSource, orderFrame, planLegs } from "./orders.mjs";
import { getMarket, parseThresholdMarket } from "./polymarket.mjs";
import { perplReference, predgeStatus, releaseDecision } from "./settlement.mjs";

const r2 = (x) => (x === null || x === undefined ? x : Math.round(x * 100) / 100);
const r6 = (x) => Math.round(x * 1e6) / 1e6;

export function phaseAt(nowMs, observationMs, pinZoneMinutes) {
  if (nowMs >= observationMs) return "settling";
  if (observationMs - nowMs <= pinZoneMinutes * 60_000) return "pin-zone";
  return "hedging";
}

export class Hedger {
  constructor({ pub, executor, accountId = 0, ids = idSource(), now = () => Date.now(), deps = {} }) {
    Object.assign(this, { pub, executor, accountId, ids, now });
    this.deps = { getMarket, perplReference, predgeStatus, releaseDecision, ...deps };
  }

  async step(position) {
    const o = { ...DEFAULTS, ...position.overrides };
    const now = this.now();
    const raw = await this.deps.getMarket(position.marketId);
    const market = parseThresholdMarket(raw);
    if (!market) return { marketId: position.marketId, action: "skip", reason: `not a supported crypto threshold market: ${raw.question}` };
    const mkt = await this.pub.market(market.symbol);
    const key = `${market.marketId}:${position.side}`;
    const phase = phaseAt(now, market.observationMs, o.pinZoneMinutes);
    const tick = await this.pub.ticker(mkt);
    const current = this.executor.position(key, mkt);
    const out = {
      at: new Date(now).toISOString(),
      mode: this.executor.mode,
      network: this.pub.net.name,
      polymarket: { marketId: market.marketId, question: market.question, side: position.side, shares: position.shares, yesPrice: market.yesPrice, observation: new Date(market.observationMs).toISOString(), umaStatuses: market.umaStatuses },
      perpl: { market: `${market.symbol} (${mkt.id})`, block: tick.block, mark: tick.mark, oracle: tick.oracle, bid: tick.bid, ask: tick.ask },
      phase,
      hedge: { current },
    };

    let target = 0;
    if (phase === "hedging") {
      const lookback = o.volLookbackHours * 3600_000;
      const candles = await this.pub.candles(mkt, 3600, now - lookback, now);
      const vol = realizedVol(candles, 3600, o.volFloor);
      const years = (market.observationMs - now) / YEAR_MS;
      const h = targetHedge({ side: position.side, shares: position.shares * o.hedgeRatio, spot: tick.mark, strike: market.threshold, vol, years, maxHedgeUsd: o.maxHedgeUsd });
      target = h.target;
      out.model = {
        vol: r6(vol), hoursToObservation: r2((market.observationMs - now) / 3600_000), threshold: market.threshold,
        hedgeRatio: o.hedgeRatio, probYes: r6(h.prob), polymarketYes: market.yesPrice, exposure: r6(h.exposure), dollarDeltaPer1Pct: r2(h.dollarDeltaPer1Pct), capped: h.capped,
      };
    } else if (phase === "pin-zone") {
      out.note = `inside ${o.pinZoneMinutes} min of the observation the binary's delta swings too fast to chase; holding the hedge flat`;
    } else {
      out.settlement = await this.settle(market, mkt, position, o);
    }

    out.hedge.target = r6(target);
    const diffUsd = Math.abs(target - current) * tick.mark;
    const inBand = target !== 0 && Math.abs(target - current) <= o.rebalanceBand * Math.abs(target);
    if (diffUsd < o.minTradeUsd || inBand) {
      out.action = "hold";
      out.reason = diffUsd < o.minTradeUsd ? `off target by $${r2(diffUsd)}, under the $${o.minTradeUsd} minimum` : `within the ${o.rebalanceBand * 100}% rebalance band`;
      return out;
    }
    const legs = planLegs(current, target, mkt.sizeDecimals);
    if (!legs.length) { out.action = "hold"; out.reason = "difference below one size unit"; return out; }
    const book = await this.pub.book(mkt, 20);
    const touch = { bid: book.bids[0]?.price ?? tick.bid, ask: book.asks[0]?.price ?? tick.ask };
    const frames = legs.map((leg) => orderFrame({ leg, mkt, accountId: this.accountId, touch, slippageBps: o.maxSlippageBps, leverage: o.leverage, headBlock: book.block, ids: this.ids }));
    out.action = target === 0 ? "flatten" : "rebalance";
    out.orders = frames;
    out.fills = await this.executor.execute(key, frames, { mkt, book });
    out.hedge.after = this.executor.position(key, mkt);
    return out;
  }

  async settle(market, mkt, position, o) {
    const [reference, predge] = await Promise.all([
      this.deps.perplReference(this.pub, mkt, market, o.referenceToleranceBps).catch((e) => ({ available: false, reason: e.message })),
      this.deps.predgeStatus(market.marketId).catch((e) => ({ available: false, reason: e.message })),
    ]);
    const s = { reference, predge, alerts: [] };
    const win = (outcome) => (outcome === position.side ? position.shares : 0);

    if (predge.available && predge.signed && predge.resolved) {
      const rel = await this.deps.releaseDecision(market.marketId);
      s.release = rel;
      s.payout = rel.safe ? { state: "released", usd: win(predge.outcome), outcome: predge.outcome } : { state: "reserved", reason: rel.reason };
    } else {
      const expected = predge.proposed ?? (reference.available && !reference.tooCloseToCall ? reference.implied : null);
      s.payout = { state: "reserved", expectedOutcome: expected, expectedUsd: expected ? win(expected) : null, reason: predge.available ? predge.recommendation : "Predge status unavailable; nothing is released without a signed final record" };
    }
    if (reference.available && reference.tooCloseToCall) {
      s.alerts.push(`Perpl close ${reference.close} is ${reference.gapBps} bps from the ${reference.threshold} threshold: too close to call from Perpl data, expect a contested resolution`);
    }
    if (predge.proposed && reference.available && !reference.tooCloseToCall && predge.proposed !== reference.implied) {
      s.alerts.push(`UMA proposal "${predge.proposed}" disagrees with the Perpl reference "${reference.implied}" (${reference.gapBps} bps); challenge window ends ${predge.challengeWindowEnds}`);
    }
    if (predge.openDispute) s.alerts.push("dispute open: payout stays reserved until the signed record is resolved");
    return s;
  }
}
