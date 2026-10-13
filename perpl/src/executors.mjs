import WebSocket from "ws";
import { wsSignInFrame } from "./auth.mjs";

/**
 * Paper executor: fills IOC frames against the live Perpl order book it is handed, walking levels up
 * to the limit price, and charges the market's base taker fee. Nothing is sent anywhere.
 */
export class PaperExecutor {
  constructor(state = {}) { this.state = state; this.mode = "paper"; }
  position(key) { return this.state[key]?.size ?? 0; }

  async execute(key, frames, { mkt, book }) {
    const fills = [];
    const s = (this.state[key] ??= { size: 0, cash: 0, fees: 0, trades: 0 });
    for (const f of frames) {
      const buy = f.t === 1 || f.t === 4;
      const limit = f.p / 10 ** mkt.priceDecimals;
      let want = f.s / 10 ** mkt.sizeDecimals, got = 0, cost = 0;
      for (const lvl of buy ? book.asks : book.bids) {
        if (want <= 0 || (buy ? lvl.price > limit : lvl.price < limit)) break;
        const q = Math.min(want, lvl.size);
        got += q; cost += q * lvl.price; want -= q;
      }
      const fee = cost * mkt.takerFee;
      if (got > 0) {
        s.size += buy ? got : -got;
        s.cash += buy ? -cost : cost;
        s.fees += fee; s.trades += 1;
      }
      fills.push({ rq: f.rq, t: f.t, requested: f.s / 10 ** mkt.sizeDecimals, filled: Math.round(got * 1e8) / 1e8, avgPrice: got ? Math.round((cost / got) * 100) / 100 : null, fee: Math.round(fee * 100) / 100, status: got === 0 ? "expired-unfilled" : want > 1e-12 ? "partial-ioc" : "filled" });
    }
    s.size = Math.round(s.size * 1e8) / 1e8;
    return fills;
  }
}

/**
 * Live executor for Perpl TESTNET only. Signs in on /ws/v1/trading (mt 29), seeds rq from the
 * account's `lfr`, reads positions from the snapshot, sends mt 22 frames and collects mt 3 / mt 24.
 * It refuses any chain other than Monad testnet (10143).
 */
export class LiveTestnetExecutor {
  constructor({ net, creds, ids, WebSocketImpl = WebSocket, timeoutMs = 15_000, log = () => {} }) {
    if (net.chainId !== 10143) throw new Error(`live mode is testnet-only; refusing chain ${net.chainId}`);
    Object.assign(this, { net, creds, ids, WebSocketImpl, timeoutMs, log });
    this.mode = "live-testnet";
    this.positions = new Map(); // mkt -> signed size (base units, raw)
    this.messages = [];
  }

  async connect() {
    const ws = new this.WebSocketImpl(`${this.net.wsUrl}/ws/v1/trading`);
    this.ws = ws;
    await new Promise((ok, fail) => { ws.once("open", ok); ws.once("error", fail); });
    ws.send(JSON.stringify(wsSignInFrame({ chainId: this.net.chainId, apiKey: this.creds.apiKey, key: this.creds.key })));
    ws.on("message", (raw) => this.onMessage(JSON.parse(String(raw))));
    this.pinger = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ mt: 1, t: Date.now() })), 25_000); // documented keep-alive
    await this.waitFor((m) => m.mt === 26, "PositionsSnapshot");
  }

  onMessage(m) {
    this.messages.push(m);
    const walk = (o) => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) return o.forEach(walk);
      if ("lfr" in o && "id" in o && Number(o.id) === this.creds.accountId) this.ids.seed(o.lfr);
      if ("pid" in o && "sd" in o && "mkt" in o && Number(o.acc) === this.creds.accountId) {
        const open = o.st === undefined || o.st === 0 || o.st === 1; // PositionStatus 1 = Open; 2+ = closed/liquidated/etc.
        this.positions.set(o.mkt, open ? (o.sd === 1 ? 1 : -1) * Number(o.s) : 0);
      }
      Object.values(o).forEach(walk);
    };
    walk(m);
  }

  waitFor(pred, what) {
    return new Promise((ok, fail) => {
      const hit = this.messages.find(pred);
      if (hit) return ok(hit);
      const t = setTimeout(() => fail(new Error(`timed out waiting for ${what}`)), this.timeoutMs);
      const on = (raw) => { const m = JSON.parse(String(raw)); if (pred(m)) { clearTimeout(t); this.ws.off("message", on); ok(m); } };
      this.ws.on("message", on);
    });
  }

  position(_key, mkt) { return (this.positions.get(mkt.id) ?? 0) / 10 ** mkt.sizeDecimals; }

  async execute(_key, frames) {
    const out = [];
    for (const f of frames) {
      this.ws.send(JSON.stringify(f));
      const st = await this.waitFor((m) => m.mt === 3 && m.cid === f.sn, `status for sn ${f.sn}`);
      out.push({ rq: f.rq, sn: f.sn, admission: st.status });
    }
    return out;
  }

  close() { clearInterval(this.pinger); this.ws?.close(); }
}
