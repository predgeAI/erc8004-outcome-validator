// `mm predge guard`: run check, then either print the exact `mm predict` commands or refuse.
// It never places an order itself.

import { checkFull, type CheckOptions, type CheckReport, renderCheck } from "./check.js";
import { bestPrices, pickOutcome } from "./market.js";

export interface GuardOptions extends CheckOptions {
  side: string;
  size: number;
  /** buy (default) or sell */
  action?: "buy" | "sell";
  /** worst price per share for the limit order; default the current best ask (buy) or bid (sell) */
  price?: number;
}

export interface GuardReport {
  allowed: boolean;
  reason: string;
  side: string;
  outcome: string | null;
  outcomeIndex: number | null;
  tokenId: string | null;
  action: "buy" | "sell";
  size: number;
  price: number | null;
  priceSource: string | null;
  commands: { quote: string; place: string } | null;
  check: CheckReport;
}

const fmtPrice = (p: number, tick: number | null) => {
  const decimals = tick ? Math.max(0, Math.ceil(-Math.log10(tick))) : 3;
  return p.toFixed(decimals);
};

export async function guard(input: string, opts: GuardOptions): Promise<GuardReport> {
  if (!(opts.size > 0)) throw new Error("--size must be a positive number of shares");
  const action = opts.action ?? "buy";
  if (opts.price !== undefined && !(opts.price > 0 && opts.price < 1)) throw new Error("--price must be between 0 and 1");

  const { report: c, market } = await checkFull(input, opts);
  const base = { side: opts.side, action, size: opts.size, check: c };
  let pick: ReturnType<typeof pickOutcome> | null = null;
  try { pick = pickOutcome(market, opts.side); } catch (e) {
    return { ...base, allowed: false, reason: (e as Error).message, outcome: null, outcomeIndex: null, tokenId: null, price: null, priceSource: null, commands: null };
  }
  const refuse = (reason: string): GuardReport => ({ ...base, allowed: false, reason, outcome: pick!.label, outcomeIndex: pick!.index, tokenId: pick!.tokenId, price: null, priceSource: null, commands: null });

  if (!c.safeToAct) return refuse(c.reason);
  if (c.finalOutcome && action === "buy" && c.finalOutcome.toLowerCase() !== pick.label.toLowerCase()) {
    return refuse(`the market already resolved on chain to ${c.finalOutcome}; ${pick.label} shares redeem at 0`);
  }
  if (market.closed) return refuse(`the market is closed for trading${c.finalOutcome ? ` (final outcome ${c.finalOutcome})` : ""}; settlement risk is ${c.riskLevel}`);
  if (market.acceptingOrders === false) return refuse("the market is not accepting orders");

  // price: --price, else the token's own CLOB book, else Gamma's outcome-0 quote (outcome 1 = complement)
  let price = opts.price ?? null;
  let priceSource: string | null = opts.price !== undefined ? "--price" : null;
  let tickSize = market.tickSize;
  let minOrderSize: number | null = null;
  try {
    const book = await bestPrices(pick.tokenId, { fetch: opts.fetch });
    tickSize = book.tickSize ?? tickSize;
    minOrderSize = book.minOrderSize;
    if (price === null) {
      price = action === "buy" ? book.bestAsk : book.bestBid;
      if (price !== null) priceSource = `best ${action === "buy" ? "ask" : "bid"} on the Polymarket CLOB book`;
    }
  } catch { /* fall back to Gamma below */ }
  if (price === null) {
    const ask0 = market.bestAsk, bid0 = market.bestBid;
    if (action === "buy") price = pick.index === 0 ? ask0 : bid0 !== null ? 1 - bid0 : null;
    else price = pick.index === 0 ? bid0 : ask0 !== null ? 1 - ask0 : null;
    if (price !== null) priceSource = `best ${action === "buy" ? "ask" : "bid"} from Polymarket Gamma`;
  }
  if (price === null || !(price > 0 && price < 1)) return refuse(`no ${action === "buy" ? "asks" : "bids"} on the book for ${pick.label}; pass --price to set a limit`);
  if (minOrderSize !== null && opts.size < minOrderSize) return refuse(`size ${opts.size} is below the market's minimum order size ${minOrderSize}`);

  const p = fmtPrice(price, tickSize);
  const tick = tickSize ? ` --tick-size ${tickSize}` : "";
  const commands = {
    quote: `mm predict quote --token-id ${pick.tokenId} --side ${action} --size ${opts.size} --limit-price ${p}${tick}`,
    place: `mm predict place --token-id ${pick.tokenId} --side ${action} --size ${opts.size} --price ${p}${tick}`,
  };
  return { ...base, allowed: true, reason: c.reason, outcome: pick.label, outcomeIndex: pick.index, tokenId: pick.tokenId, price: Number(p), priceSource, commands };
}

export function renderGuard(g: GuardReport): string {
  const L = [renderCheck(g.check), ""];
  const what = `${g.action} ${g.size} ${g.outcome ?? g.side}${g.outcome && g.side.toUpperCase() !== g.outcome.toUpperCase() ? ` (${g.side.toUpperCase()} = outcome ${g.outcomeIndex})` : ""}`;
  if (!g.allowed) {
    L.push(`GUARD: REFUSED to ${what}: ${g.reason}`);
    return L.join("\n");
  }
  L.push(`GUARD: allowed to ${what} at up to ${g.price} (${g.priceSource}). Run:`);
  L.push(`  ${g.commands!.quote}`);
  L.push(`  ${g.commands!.place}`);
  return L.join("\n");
}
