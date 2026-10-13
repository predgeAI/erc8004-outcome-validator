// Perpl OrderRequest (mt 22) frames, as specified in
// https://docs.perpl.xyz/resources/for-developers/api/websocket#placing-orders-mt-22
export const ORDER_TYPE = { OpenLong: 1, OpenShort: 2, CloseLong: 3, CloseShort: 4, Cancel: 5 };
export const FLAG_IOC = 4;

const floorTo = (x, d) => Math.floor(x * 10 ** d + 1e-9) / 10 ** d;

/**
 * Turn "move the perp position from `current` to `target`" (signed base units) into IOC frames.
 * Reducing uses Close orders, adding uses Open orders, and a flip is a Close followed by an Open.
 */
export function planLegs(current, target, sizeDecimals) {
  const legs = [];
  let cur = current;
  const diff = target - current;
  if (Math.abs(diff) < 10 ** -sizeDecimals) return legs;
  if (cur > 0 && diff < 0) {
    const close = Math.min(-diff, cur);
    legs.push({ type: "CloseLong", side: "sell", size: close });
    cur -= close;
  } else if (cur < 0 && diff > 0) {
    const close = Math.min(diff, -cur);
    legs.push({ type: "CloseShort", side: "buy", size: close });
    cur += close;
  }
  const rest = target - cur;
  if (rest > 0) legs.push({ type: "OpenLong", side: "buy", size: rest });
  if (rest < 0) legs.push({ type: "OpenShort", side: "sell", size: -rest });
  return legs
    .map((l) => ({ ...l, size: floorTo(l.size, sizeDecimals) }))
    .filter((l) => l.size > 0);
}

/** Build the wire frame for one leg. `ids` supplies strictly increasing rq and unique non-zero sn. */
export function orderFrame({ leg, mkt, accountId, touch, slippageBps, leverage, headBlock, ids }) {
  const k = 10 ** mkt.priceDecimals;
  const limit = leg.side === "buy" ? touch.ask * (1 + slippageBps / 1e4) : touch.bid * (1 - slippageBps / 1e4);
  const p = leg.side === "buy" ? Math.ceil(limit * k) : Math.floor(limit * k);
  return {
    mt: 22,
    sn: ids.nextSn(),
    rq: ids.nextRq(),
    mkt: mkt.id,
    acc: accountId,
    t: ORDER_TYPE[leg.type],
    p,
    s: Math.round(leg.size * 10 ** mkt.sizeDecimals),
    fl: FLAG_IOC,
    lv: Math.round(leverage * 100),
    lb: headBlock + mkt.orderTtlBlocks,
  };
}

export function idSource(lastRq = 0, startSn = 1) {
  let rq = lastRq, sn = startSn - 1;
  return {
    seed(lfr) { rq = Math.max(rq, Number(lfr) || 0); },
    nextRq: () => ++rq,
    nextSn: () => ++sn,
    last: () => ({ rq, sn }),
  };
}
