// Public Perpl REST market data. No key needed.
// Endpoints: https://docs.perpl.xyz/resources/for-developers/api/rest
import { network as netConfig } from "./config.mjs";

export class PerplPublic {
  constructor(net = "mainnet", { fetch: f = globalThis.fetch } = {}) {
    this.net = typeof net === "string" ? netConfig(net) : net;
    this.fetch = f;
    this.calls = []; // endpoint log, kept for the run report
    this._ctx = null;
  }

  async get(path) {
    const url = `${this.net.apiUrl}${path}`;
    const res = await this.fetch(url, { headers: { accept: "application/json" } });
    this.calls.push(`GET ${path} -> ${res.status}`);
    if (!res.ok) throw new Error(`Perpl ${url}: HTTP ${res.status}`);
    return res.json();
  }

  /** GET /v1/pub/context: chain, collateral token, market configs. Cached per instance. */
  async context() {
    if (!this._ctx) this._ctx = await this.get("/v1/pub/context");
    return this._ctx;
  }

  /** Market config for a symbol. Mainnet context returns an empty `symbol` for some markets, so fall back to the documented ID table. */
  async market(symbol) {
    const ctx = await this.context();
    const id = this.net.markets[symbol] ?? ctx.markets.find((m) => m.symbol === symbol)?.id;
    const m = ctx.markets.find((x) => x.id === id);
    if (!m) throw new Error(`no Perpl ${this.net.name} market for ${symbol}`);
    if (!m.config?.is_open) throw new Error(`Perpl ${symbol} market ${id} is not open`);
    const c = m.config;
    return {
      id, symbol,
      priceDecimals: c.price_decimals,
      sizeDecimals: c.size_decimals,
      initialMarginBps: c.initial_margin, // hundredths of a percent == bps (1000 = 10%); see api-docs issue #7 on max leverage
      takerFee: c.taker_fee / 1e6,
      makerFee: c.maker_fee / 1e6,
      orderTtlBlocks: m.order_ttl_blocks,
      maxMarketSlippageBps: m.order_max_market_slippage_bps,
      fundingIntervalSec: m.funding_interval_sec,
    };
  }

  /** GET /v1/market-data/:id/ticker -> prices in USD and the head block. */
  async ticker(mkt) {
    const t = await this.get(`/v1/market-data/${mkt.id}/ticker`);
    const d = t.d[String(mkt.id)];
    const k = 10 ** mkt.priceDecimals;
    return { block: d.at.b, time: d.at.t, mark: d.mrk / k, oracle: d.orl / k, last: d.lst / k, bid: d.bid / k, ask: d.ask / k, mid: d.mid / k, openInterest: d.oi / 10 ** mkt.sizeDecimals };
  }

  /** GET /v1/market-data/:id/book?levels=N -> levels in USD / base units. */
  async book(mkt, levels = 20) {
    const b = await this.get(`/v1/market-data/${mkt.id}/book?levels=${levels}`);
    const kp = 10 ** mkt.priceDecimals, ks = 10 ** mkt.sizeDecimals;
    const side = (arr) => (arr || []).map((l) => ({ price: l.p / kp, size: l.s / ks }));
    return { block: b.at.b, time: b.at.t, bids: side(b.bid), asks: side(b.ask) };
  }

  /** GET /v1/market-data/:id/candles/:res/:from-:to (ms). */
  async candles(mkt, resolutionSec, fromMs, toMs) {
    const c = await this.get(`/v1/market-data/${mkt.id}/candles/${resolutionSec}/${fromMs}-${toMs}`);
    const k = 10 ** mkt.priceDecimals;
    return (c.d || []).map((x) => ({ t: x.t, o: x.o / k, h: x.h / k, l: x.l / k, c: x.c / k, n: x.n }));
  }

  /** GET /v1/market-data/:id/funding/:from-:to (ms). `rate` is passed through raw (units are not documented). */
  async funding(mkt, fromMs, toMs) {
    const f = await this.get(`/v1/market-data/${mkt.id}/funding/${fromMs}-${toMs}`);
    return (f.d || []).map((x) => ({ t: x.at.t, rawRate: x.rate }));
  }
}
