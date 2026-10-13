// Polymarket market metadata from the public Gamma API (read-only, no key).
const GAMMA = "https://gamma-api.polymarket.com";

// Polymarket asset names -> Perpl symbols. Only assets Perpl lists are hedgeable.
const ASSETS = { bitcoin: "BTC", btc: "BTC", ethereum: "ETH", eth: "ETH", solana: "SOL", sol: "SOL", hyperliquid: "HYPE", hype: "HYPE", zcash: "ZEC", zec: "ZEC", monad: "MON", mon: "MON" };

/**
 * Parse a Polymarket crypto threshold question.
 *  "Bitcoin above 84,800 on October 10, 12PM ET?"          -> hourly market, Binance 1h candle that ends at endDate
 *  "Will the price of Bitcoin be above $78,000 on April 24?" -> daily market, Binance 1m candle closing at 12:00 ET (endDate)
 * Returns null for anything else (ranges, up/down, unsupported assets).
 */
export function parseThresholdMarket(m) {
  const q = String(m.question || "");
  const hourly = q.match(/^(\w+) above \$?([\d,.]+) on (.+?), (\d{1,2}(?:AM|PM)) ET\?$/i);
  const daily = q.match(/^Will the price of (\w+) be above \$?([\d,.]+) on (.+?)\?$/i);
  const hit = hourly || daily;
  if (!hit) return null;
  const symbol = ASSETS[hit[1].toLowerCase()];
  if (!symbol) return null;
  const threshold = Number(hit[2].replace(/,/g, ""));
  const observationMs = Date.parse(m.endDate);
  if (!Number.isFinite(threshold) || !Number.isFinite(observationMs)) return null;
  let outcomes = ["Yes", "No"];
  try { outcomes = JSON.parse(m.outcomes); } catch {}
  let prices = null;
  try { prices = JSON.parse(m.outcomePrices).map(Number); } catch {}
  return {
    marketId: String(m.id),
    question: q,
    symbol,
    threshold,
    observationMs,
    // the candle Polymarket's rules name; Perpl candles are used as a stand-in reference (see README)
    candleSec: hourly ? 3600 : 60,
    outcomes,
    yesPrice: prices ? prices[0] : null,
    closed: m.closed === true,
    umaStatus: m.umaResolutionStatus ?? null,
    umaStatuses: (() => { try { return JSON.parse(m.umaResolutionStatuses || "[]"); } catch { return []; } })(),
    slug: m.slug,
  };
}

export async function getMarket(marketId, { fetch: f = globalThis.fetch } = {}) {
  const res = await f(`${GAMMA}/markets/${encodeURIComponent(marketId)}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Gamma market ${marketId}: HTTP ${res.status}`);
  return res.json();
}

/** Open crypto threshold markets for one Polymarket event search, e.g. "Bitcoin above on October 14". */
export async function searchThresholdMarkets(query, { fetch: f = globalThis.fetch, limit = 5 } = {}) {
  const url = `${GAMMA}/public-search?q=${encodeURIComponent(query)}&limit_per_type=${limit}&events_status=active`;
  const res = await f(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Gamma search: HTTP ${res.status}`);
  const body = await res.json();
  const out = [];
  for (const e of body.events || []) for (const m of e.markets || []) {
    const p = parseThresholdMarket(m);
    if (p) out.push(p);
  }
  return out;
}
