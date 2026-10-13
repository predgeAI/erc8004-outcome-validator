// Perpl public market-data WebSocket: market-state@<chain_id> (mt 9) carries mark prices for every
// market. The hedger re-runs when a watched mark moves more than `triggerBps` since the last run.
import WebSocket from "ws";

export class MarkTrigger {
  constructor({ net, marketIds, triggerBps = 10, onTrigger, WebSocketImpl = WebSocket, log = () => {} }) {
    Object.assign(this, { net, marketIds: new Set(marketIds.map(Number)), triggerBps, onTrigger, WebSocketImpl, log });
    this.anchor = new Map(); // market id -> mark at the last run
    this.backoff = 1000;
    this.closed = false;
  }

  /** Pure decision, exported for tests: returns the markets whose mark moved past the trigger. */
  moved(update) {
    const hits = [];
    for (const [id, s] of Object.entries(update || {})) {
      const mid = Number(id);
      if (!this.marketIds.has(mid) || !s?.mrk) continue;
      const a = this.anchor.get(mid);
      if (a === undefined) { this.anchor.set(mid, s.mrk); continue; }
      const bps = Math.abs(s.mrk / a - 1) * 1e4;
      if (bps >= this.triggerBps) { hits.push({ market: mid, bps: Math.round(bps * 10) / 10 }); this.anchor.set(mid, s.mrk); }
    }
    return hits;
  }

  start() {
    const ws = new this.WebSocketImpl(`${this.net.wsUrl}/ws/v1/market-data`);
    this.ws = ws;
    ws.on("open", () => {
      ws.send(JSON.stringify({ mt: 5, subs: [{ stream: `market-state@${this.net.chainId}`, subscribe: true }] }));
      // The docs say market-data sockets need no application ping, but mainnet closes them with
      // 1008 "ping timeout" after about 55 s without one, and once with 25 s pings (seen 13 Oct 2026). Ping every 15 s.
      this.pinger = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ mt: 1, t: Date.now() })), 15_000);
    });
    ws.on("message", (raw) => {
      const m = JSON.parse(String(raw));
      if (m.mt !== 9) return;
      this.backoff = 1000;
      const hits = this.moved(m.d);
      if (hits.length) this.onTrigger(hits);
    });
    ws.on("close", (code, why) => {
      clearInterval(this.pinger);
      if (this.closed) return;
      this.log(`market-data socket closed (${code} ${why}); reconnecting in ${this.backoff} ms`);
      setTimeout(() => this.start(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 30_000);
    });
    ws.on("error", (e) => this.log(`market-data socket error: ${e.message}`));
  }

  stop() { this.closed = true; clearInterval(this.pinger); this.ws?.close(); }
}
