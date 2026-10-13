import assert from "node:assert/strict";
import { verify } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { WebSocketServer } from "ws";
import { keyFromSeedHex, publicKeyHex, restCanonical, signRest, wsSignInFrame } from "../src/auth.mjs";
import { NETWORKS } from "../src/config.mjs";
import { LiveTestnetExecutor, PaperExecutor } from "../src/executors.mjs";
import { Hedger, phaseAt } from "../src/hedger.mjs";
import { binaryAbove, cdf, realizedVol, targetHedge } from "../src/model.mjs";
import { idSource, orderFrame, planLegs } from "../src/orders.mjs";
import { parseThresholdMarket } from "../src/polymarket.mjs";
import { predgeStatus } from "../src/settlement.mjs";

const SEED = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60"; // RFC 8032 test vector 1
const BTC = { id: 1, symbol: "BTC", priceDecimals: 1, sizeDecimals: 5, takerFee: 345e-6, orderTtlBlocks: 20 };

test("REST canonical string matches the documented worked example layout", () => {
  const c = restCanonical({ chainId: 143, method: "get", target: "/v1/trading/fills?count=1", timestamp: "1751932800000", nonce: "9Nq0Yp3kZ2c1aVb7" });
  assert.equal(c, "143\nGET\n/v1/trading/fills?count=1\n1751932800000\n9Nq0Yp3kZ2c1aVb7\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("Ed25519 key from seed gives the RFC 8032 public key, and signatures verify", () => {
  const key = keyFromSeedHex(SEED);
  assert.equal(publicKeyHex(key), "0xd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
  const { canonical, headers } = signRest({ chainId: 10143, apiKey: "k", key, method: "POST", target: "/v1/x", body: "{}" });
  assert.ok(verify(null, Buffer.from(canonical), key, Buffer.from(headers["X-API-Signature"], "base64url")));
  const f = wsSignInFrame({ chainId: 10143, apiKey: "k", key, timestamp: "1", nonce: "n" });
  assert.equal(f.mt, 29);
  assert.ok(verify(null, Buffer.from("10143\ntrading-ws-signin\n1\nn"), key, Buffer.from(f.signature, "base64url")));
});

test("binary maths: CDF, probability, analytic delta equals the numerical derivative", () => {
  assert.ok(Math.abs(cdf(0) - 0.5) < 1e-7);
  assert.ok(Math.abs(cdf(1.96) - 0.975) < 1e-3);
  const args = { spot: 83500, strike: 84000, vol: 0.4, years: 30 / 8760 };
  const b = binaryAbove(args);
  const h = 1;
  const num = (binaryAbove({ ...args, spot: args.spot + h }).prob - binaryAbove({ ...args, spot: args.spot - h }).prob) / (2 * h);
  assert.ok(Math.abs(num - b.deltaPerShare) / b.deltaPerShare < 1e-3);
  assert.deepEqual(binaryAbove({ ...args, years: 0 }).prob, 0);
});

test("hedge direction: YES is hedged short, NO long, cap applies", () => {
  const base = { shares: 1000, spot: 83500, strike: 84000, vol: 0.4, years: 30 / 8760, maxHedgeUsd: 1e9 };
  assert.ok(targetHedge({ ...base, side: "Yes" }).target < 0);
  assert.ok(targetHedge({ ...base, side: "No" }).target > 0);
  const capped = targetHedge({ ...base, side: "Yes", maxHedgeUsd: 1000 });
  assert.ok(capped.capped && Math.abs(Math.abs(capped.target) * 83500 - 1000) < 1e-6);
});

test("realized vol annualises hourly log returns", () => {
  const cs = Array.from({ length: 50 }, (_, i) => ({ c: 100 * Math.exp((i % 2 ? 1 : -1) * 0.01) }));
  const v = realizedVol(cs, 3600);
  assert.ok(v > 1.5 && v < 2.5); // ~0.02 per hour * sqrt(8760)
  assert.equal(realizedVol([], 3600, 0.2), 0.2);
});

test("order legs: open, reduce, flip", () => {
  assert.deepEqual(planLegs(0, -0.2, 5), [{ type: "OpenShort", side: "sell", size: 0.2 }]);
  assert.deepEqual(planLegs(-0.2, -0.05, 5), [{ type: "CloseShort", side: "buy", size: 0.15 }]);
  assert.deepEqual(planLegs(0.1, -0.1, 5), [{ type: "CloseLong", side: "sell", size: 0.1 }, { type: "OpenShort", side: "sell", size: 0.1 }]);
  assert.deepEqual(planLegs(0.1, 0.1, 5), []);
});

test("order frame follows the mt 22 schema with scaled price and size", () => {
  const ids = idSource(41);
  const f = orderFrame({ leg: { type: "OpenShort", side: "sell", size: 0.21079 }, mkt: BTC, accountId: 7, touch: { bid: 83506.3, ask: 83506.4 }, slippageBps: 30, leverage: 3, headBlock: 100, ids });
  assert.deepEqual(f, { mt: 22, sn: 1, rq: 42, mkt: 1, acc: 7, t: 2, p: 832557, s: 21079, fl: 4, lv: 300, lb: 120 });
});

test("Polymarket question parsing: hourly, daily, unsupported", () => {
  const h = parseThresholdMarket({ id: "5503633", question: "Bitcoin above 84,800 on October 10, 12PM ET?", endDate: "2026-10-10T16:00:00Z", outcomes: '["Yes","No"]', outcomePrices: '["0","1"]' });
  assert.equal(h.symbol, "BTC"); assert.equal(h.threshold, 84800); assert.equal(h.candleSec, 3600);
  const d = parseThresholdMarket({ id: "2007078", question: "Will the price of Bitcoin be above $78,000 on April 24?", endDate: "2026-04-24T16:00:00Z" });
  assert.equal(d.threshold, 78000); assert.equal(d.candleSec, 60);
  assert.equal(parseThresholdMarket({ question: "Will the price of XRP be above $1.60 on March 14?", endDate: "2026-03-14T16:00:00Z" }), null);
  assert.equal(parseThresholdMarket({ question: "Will Bitcoin be between 80,000 and 82,000 on Oct 14?", endDate: "2026-10-14T16:00:00Z" }), null);
});

test("paper executor walks the book up to the IOC limit and charges taker fee", async () => {
  const ex = new PaperExecutor();
  const book = { asks: [{ price: 100, size: 1 }, { price: 101, size: 1 }, { price: 103, size: 5 }], bids: [] };
  const mkt = { ...BTC, priceDecimals: 0, sizeDecimals: 2 };
  const fills = await ex.execute("k", [{ rq: 1, t: 1, p: 102, s: 300 }], { mkt, book });
  assert.equal(fills[0].filled, 2); assert.equal(fills[0].status, "partial-ioc"); assert.equal(fills[0].avgPrice, 100.5);
  assert.equal(ex.position("k"), 2);
});

test("phases", () => {
  assert.equal(phaseAt(0, 3600_000, 15), "hedging");
  assert.equal(phaseAt(3600_000 - 60_000, 3600_000, 15), "pin-zone");
  assert.equal(phaseAt(3600_000, 3600_000, 15), "settling");
});

// --- hedger step with stubbed Perpl and Polymarket ---
const T = Date.parse("2026-10-14T16:00:00Z");
function stubPub() {
  return {
    net: NETWORKS.mainnet,
    market: async () => BTC,
    ticker: async () => ({ block: 1000, mark: 83500, oracle: 83500, bid: 83499.9, ask: 83500.1 }),
    candles: async () => Array.from({ length: 48 }, (_, i) => ({ t: i, c: 83500 * (1 + 0.003 * Math.sin(i)) })),
    book: async () => ({ block: 1000, bids: [{ price: 83499.9, size: 5 }], asks: [{ price: 83500.1, size: 5 }] }),
  };
}
const gamma = (q, end) => async (id) => ({ id, question: q, endDate: new Date(end).toISOString(), outcomes: '["Yes","No"]', outcomePrices: '["0.4","0.6"]' });

test("hedger opens a short hedge for a YES holder, then holds inside the band", async () => {
  const ex = new PaperExecutor();
  const hg = new Hedger({ pub: stubPub(), executor: ex, now: () => T - 30 * 3600_000, deps: { getMarket: gamma("Will the price of Bitcoin be above $84,000 on October 14?", T) } });
  const r1 = await hg.step({ marketId: "1", side: "Yes", shares: 1000 });
  assert.equal(r1.phase, "hedging"); assert.equal(r1.action, "rebalance"); assert.equal(r1.orders[0].t, 2);
  assert.ok(ex.position("1:Yes") < 0);
  const r2 = await hg.step({ marketId: "1", side: "Yes", shares: 1000 });
  assert.equal(r2.action, "hold");
});

test("after the observation the hedge is flattened and the payout reserved until the signed record is final", async () => {
  const ex = new PaperExecutor({ "1:No": { size: 0.1, cash: 0, fees: 0, trades: 1 } });
  const deps = {
    getMarket: gamma("Bitcoin above 85,600 on October 13, 2AM ET?", T),
    perplReference: async () => ({ available: true, close: 83574.5, threshold: 85600, gapBps: -236.6, implied: "No", tooCloseToCall: false }),
    predgeStatus: async () => ({ available: true, signed: true, resolved: false, proposed: "Yes", challengeWindowEnds: "x", recommendation: "watch", openDispute: false }),
    releaseDecision: async () => { throw new Error("must not be called before resolution"); },
  };
  const hg = new Hedger({ pub: stubPub(), executor: ex, now: () => T + 60_000, deps });
  const r = await hg.step({ marketId: "1", side: "No", shares: 2000 });
  assert.equal(r.phase, "settling"); assert.equal(r.action, "flatten"); assert.equal(r.orders[0].t, 3);
  assert.equal(r.settlement.payout.state, "reserved");
  assert.match(r.settlement.alerts[0], /disagrees with the Perpl reference/);
});

test("payout is released only on a resolved signed record", async () => {
  const deps = {
    getMarket: gamma("Will the price of Bitcoin be above $78,000 on April 24?", T),
    perplReference: async () => ({ available: true, close: 78061.6, threshold: 78000, gapBps: 7.9, implied: "Yes", tooCloseToCall: true }),
    predgeStatus: async () => ({ available: true, signed: true, resolved: true, outcome: "No", openDispute: false }),
    releaseDecision: async () => ({ safe: true, reason: "act", outcome: "No" }),
  };
  const hg = new Hedger({ pub: stubPub(), executor: new PaperExecutor(), now: () => T + 3600_000, deps });
  const r = await hg.step({ marketId: "1", side: "No", shares: 1000 });
  assert.deepEqual(r.settlement.payout, { state: "released", usd: 1000, outcome: "No" });
  assert.match(r.settlement.alerts[0], /too close to call/);
});

test("Predge status verifies a real signed record (fixture, no network)", async () => {
  const body = JSON.parse(readFileSync(new URL("../../monad/batch/records/2007078.json", import.meta.url)));
  const fetchStub = async () => ({ ok: true, json: async () => body });
  const s = await predgeStatus("2007078", { fetch: fetchStub });
  assert.equal(s.signed, true); assert.equal(s.outcome, "No"); assert.equal(s.disputeCount, 2);
  const tampered = structuredClone(body); tampered.attestation.canonical = tampered.attestation.canonical.replace('"No"}', '"Yes"}');
  await assert.rejects(predgeStatus("2007078", { fetch: async () => ({ ok: true, json: async () => tampered }) }));
});

test("live executor refuses mainnet", () => {
  assert.throws(() => new LiveTestnetExecutor({ net: NETWORKS.mainnet, creds: {}, ids: idSource() }), /testnet-only/);
});

test("live executor: signs in first, seeds rq from lfr, reads positions, matches mt 3 by sn", async () => {
  const key = keyFromSeedHex(SEED);
  const wss = new WebSocketServer({ port: 0 });
  const seen = [];
  wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      const m = JSON.parse(String(raw)); seen.push(m);
      if (m.mt === 29) {
        ws.send(JSON.stringify({ mt: 19, sn: 5, d: { accounts: [{ id: 7, lfr: 900, b: "100000000" }] } }));
        ws.send(JSON.stringify({ mt: 26, d: [{ mkt: 16, acc: 7, pid: 1, sd: 2, s: 5000, st: 1 }] }));
      }
      if (m.mt === 22) ws.send(JSON.stringify({ mt: 3, sid: 100, sn: 77, cid: m.sn, status: { code: 0, error: "" } }));
    });
  });
  await new Promise((r) => wss.once("listening", r));
  const net = { ...NETWORKS.testnet, wsUrl: `ws://127.0.0.1:${wss.address().port}` };
  const ids = idSource();
  const ex = new LiveTestnetExecutor({ net, creds: { apiKey: "k", key, accountId: 7 }, ids, timeoutMs: 3000 });
  await ex.connect();
  assert.equal(seen[0].mt, 29);
  assert.ok(verify(null, Buffer.from(`10143\ntrading-ws-signin\n${seen[0].timestamp}\n${seen[0].nonce}`), key, Buffer.from(seen[0].signature, "base64url")));
  const mkt = { ...BTC, id: 16 };
  assert.equal(ex.position("x", mkt), -0.05);
  const f = orderFrame({ leg: { type: "CloseShort", side: "buy", size: 0.05 }, mkt, accountId: 7, touch: { bid: 1, ask: 83500 }, slippageBps: 30, leverage: 3, headBlock: 1, ids });
  assert.equal(f.rq, 901);
  const res = await ex.execute("x", [f]);
  assert.deepEqual(res[0].admission, { code: 0, error: "" });
  ex.close(); wss.close();
});

test("mark trigger fires only for watched markets that moved past the threshold", async () => {
  const { MarkTrigger } = await import("../src/stream.mjs");
  const t = new MarkTrigger({ net: NETWORKS.mainnet, marketIds: [1], triggerBps: 10, onTrigger() {} });
  assert.deepEqual(t.moved({ 1: { mrk: 835000 }, 20: { mrk: 1 } }), []);       // first sight anchors
  assert.deepEqual(t.moved({ 1: { mrk: 835500 } }), []);                       // 6 bps
  assert.deepEqual(t.moved({ 1: { mrk: 836000 } }), [{ market: 1, bps: 12 }]); // 12 bps, re-anchors
  assert.deepEqual(t.moved({ 1: { mrk: 836100 } }), []);
});
