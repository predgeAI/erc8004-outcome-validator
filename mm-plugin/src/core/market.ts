// Resolve what the user typed (Polymarket market id, slug, or condition id) to one market,
// using Polymarket's public Gamma API. Gamma is unsigned context: the Predge record is checked
// against it (condition id must match the signed bytes) before anything is trusted.

import { type FetchLike, getJson, HttpError } from "./http.js";

export const GAMMA_API = "https://gamma-api.polymarket.com";

export type InputKind = "marketId" | "conditionId" | "slug";

export interface Market {
  input: string;
  inputKind: InputKind;
  marketId: string;
  conditionId: string;
  slug: string;
  question: string;
  outcomes: string[];
  tokenIds: string[];
  prices: number[];
  bestBid: number | null;
  bestAsk: number | null;
  tickSize: number | null;
  closed: boolean;
  acceptingOrders: boolean | null;
  negRisk: boolean;
  umaResolutionStatus: string | null;
  endDate: string | null;
}

export function classifyInput(raw: string): InputKind {
  const s = raw.trim();
  if (/^\d{1,12}$/.test(s)) return "marketId";
  if (/^0x[0-9a-fA-F]{64}$/.test(s)) return "conditionId";
  if (/^[a-z0-9][a-z0-9-]{2,200}$/i.test(s)) return "slug";
  throw new Error(`not a Polymarket market id, slug or condition id: ${JSON.stringify(raw)}`);
}

/** Pull a slug out of a polymarket.com URL, if one was pasted. */
export function normaliseInput(raw: string): string {
  const s = raw.trim();
  const m = s.match(/polymarket\.com\/(?:[a-z]{2}\/)?(?:event|market)\/(?:[^/?#]+\/)?([^/?#]+)/i);
  return m ? m[1] : s;
}

const parseList = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.startsWith("[")) { try { return (JSON.parse(v) as unknown[]).map(String); } catch { return []; } }
  return [];
};
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

export function marketFromGamma(m: Record<string, any>, input: string, inputKind: InputKind): Market {
  return {
    input,
    inputKind,
    marketId: String(m.id),
    conditionId: String(m.conditionId ?? "").toLowerCase(),
    slug: String(m.slug ?? ""),
    question: String(m.question ?? ""),
    outcomes: parseList(m.outcomes),
    tokenIds: parseList(m.clobTokenIds),
    prices: parseList(m.outcomePrices).map(Number),
    bestBid: num(m.bestBid),
    bestAsk: num(m.bestAsk),
    tickSize: num(m.orderPriceMinTickSize),
    closed: m.closed === true,
    acceptingOrders: typeof m.acceptingOrders === "boolean" ? m.acceptingOrders : null,
    negRisk: m.negRisk === true,
    umaResolutionStatus: m.umaResolutionStatus ?? null,
    endDate: m.endDate ?? null,
  };
}

export async function resolveMarket(raw: string, opts: { fetch?: FetchLike; gammaUrl?: string } = {}): Promise<Market> {
  const input = normaliseInput(raw);
  const kind = classifyInput(input);
  const base = (opts.gammaUrl ?? GAMMA_API).replace(/\/$/, "");
  const get = (path: string) => getJson<any>(`${base}${path}`, { fetch: opts.fetch, timeoutMs: 20_000 });

  let m: Record<string, any> | undefined;
  try {
    if (kind === "marketId") m = await get(`/markets/${input}`);
    else if (kind === "slug") m = await get(`/markets/slug/${encodeURIComponent(input)}`);
    else {
      // the list endpoint hides closed markets unless asked, so try both
      for (const closed of ["false", "true"]) {
        const list = await get(`/markets?condition_ids=${input}&closed=${closed}&limit=1`);
        if (Array.isArray(list) && list.length) { m = list[0]; break; }
      }
    }
  } catch (e) {
    if (e instanceof HttpError && (e.status === 404 || e.status === 422)) m = undefined;
    else throw e;
  }
  if (!m || !m.id) throw new Error(`Polymarket has no market for ${kind} ${input}`);
  return marketFromGamma(m, input, kind);
}

/**
 * Map a side the agent asked for to one outcome. YES/NO map to outcome 0/1 (Polymarket orders
 * binary markets that way); an outcome label (e.g. "Over") is matched case-insensitively.
 */
export function pickOutcome(market: Market, side: string): { index: number; label: string; tokenId: string; mappedFrom: string | null } {
  const s = side.trim();
  const labels = market.outcomes.map((o) => o.toLowerCase());
  let index = labels.indexOf(s.toLowerCase());
  let mappedFrom: string | null = null;
  if (index < 0 && /^(yes|no)$/i.test(s) && market.outcomes.length === 2) {
    index = /^yes$/i.test(s) ? 0 : 1;
    mappedFrom = s.toUpperCase();
  }
  if (index < 0 || !market.tokenIds[index]) {
    throw new Error(`side ${JSON.stringify(side)} is not an outcome of this market (outcomes: ${market.outcomes.join(", ") || "unknown"})`);
  }
  return { index, label: market.outcomes[index], tokenId: market.tokenIds[index], mappedFrom };
}

export const CLOB_API = "https://clob.polymarket.com";

/** Best bid and ask for one outcome token from Polymarket's public CLOB book. */
export async function bestPrices(tokenId: string, opts: { fetch?: FetchLike } = {}): Promise<{ bestBid: number | null; bestAsk: number | null; tickSize: number | null; minOrderSize: number | null }> {
  const b = await getJson<any>(`${CLOB_API}/book?token_id=${tokenId}`, { fetch: opts.fetch, timeoutMs: 15_000 });
  const prices = (rows: any[]) => (Array.isArray(rows) ? rows.map((r) => Number(r.price)).filter((p) => p > 0 && p < 1) : []);
  const bids = prices(b?.bids), asks = prices(b?.asks);
  return {
    bestBid: bids.length ? Math.max(...bids) : null,
    bestAsk: asks.length ? Math.min(...asks) : null,
    tickSize: num(b?.tick_size),
    minOrderSize: num(b?.min_order_size),
  };
}
