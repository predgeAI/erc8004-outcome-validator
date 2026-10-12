#!/usr/bin/env node
// Local JSON-RPC proxy for syncing Monad testnet over public RPC without a HyperSync token.
//
// Public Monad testnet endpoints cap eth_getLogs at 100 blocks per call and rate-limit at about
// 25 requests/s each, and HyperIndex's RPC source walks the range one call at a time, so a
// 2M-block history takes hours. This proxy accepts wide eth_getLogs ranges, splits them into
// 100-block calls, runs them in parallel across several public endpoints (rate-limited per
// endpoint, retried on 429/errors) and returns the merged logs. Every other method is passed
// through unchanged. It only reads public chain data; nothing is signed or sent.
//
//   node tools/logs-proxy.mjs            # listens on 127.0.0.1:8547
//   PORT=8547 UPSTREAMS=https://a,https://b node tools/logs-proxy.mjs
//
// Not needed with HyperSync (ENVIO_API_TOKEN) or on Envio Cloud.
import http from "node:http";

const PORT = Number(process.env.PORT || 8547);
const CHUNK = Number(process.env.CHUNK || 100);
const RPS = Number(process.env.RPS_PER_UPSTREAM || 20);
const UPSTREAMS = (process.env.UPSTREAMS || "https://rpc.ankr.com/monad_testnet,https://testnet-rpc.monad.xyz")
  .split(",")
  .map((url) => ({ url, next: 0 }));

// Addresses the indexer asks about (config.yaml). Chunks are fetched once for all of them and
// cached, then filtered locally, because HyperIndex queries each contract partition separately.
const ADDRESSES = (process.env.ADDRESSES ||
  [
    "0x884764736dBe1FD36291bDd3Afd50A75465F6e8A",
    "0x8004Cb1BF31DAf7788923b405b754f57acEB4272",
    "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    "0x0fE4D5fF3f4392bEC36c8003079E31102a403E84",
    "0x95652b86c10Eb0E012b22E08dBC98481d4a19Bc2",
    "0x34F1ef2f39Bfdd6c10Fcaa02f5B257A5dB2e93E9",
    "0xf4EE0Af65804D5754E59316b3DBB53D5c3AeeeF9",
  ].join(","))
  .split(",")
  .map((a) => a.toLowerCase());
const ADDRESS_SET = new Set(ADDRESSES);
const cache = new Map(); // aligned chunk start -> Promise<logs[]>
let cacheHits = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hex = (n) => "0x" + n.toString(16);

// Token-bucket-ish pacing: each upstream hands out one slot every 1000/RPS ms.
async function pick() {
  for (;;) {
    const now = Date.now();
    const u = UPSTREAMS.reduce((a, b) => (a.next <= b.next ? a : b));
    if (u.next <= now) {
      u.next = now + 1000 / RPS;
      return u;
    }
    await sleep(u.next - now);
  }
}

async function call(body, upstream) {
  const u = upstream ?? (await pick());
  const res = await fetch(u.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status} from ${u.url}: ${text.slice(0, 120)}`);
  }
  return json;
}

let served = 0;
async function getLogsChunk(filter, from, to, ctx) {
  for (let attempt = 0; ; attempt++) {
    if (ctx.aborted) throw new Error("client went away");
    try {
      const r = await call({ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params: [{ ...filter, fromBlock: hex(from), toBlock: hex(to) }] });
      if (r.result) {
        served++;
        return r.result;
      }
      if (attempt > 8) throw new Error(JSON.stringify(r.error));
    } catch (e) {
      if (attempt > 8) throw e;
    }
    await sleep(250 * (attempt + 1));
  }
}

async function getLogs(params, ctx) {
  const filter = { ...params[0] };
  if (filter.blockHash) return (await call({ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params })).result;
  let latest;
  const resolve = async (tag) => {
    if (tag === undefined || tag === "latest" || tag === "safe" || tag === "finalized" || tag === "pending") {
      latest ??= Number(BigInt((await call({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] })).result));
      return latest;
    }
    if (tag === "earliest") return 0;
    return Number(BigInt(tag));
  };
  const from = await resolve(filter.fromBlock);
  const to = await resolve(filter.toBlock);
  delete filter.fromBlock;
  delete filter.toBlock;
  const want = [filter.address ?? []].flat().map((a) => a.toLowerCase());
  if (want.length && want.every((a) => ADDRESS_SET.has(a))) {
    const starts = [];
    for (let a = Math.floor(from / CHUNK) * CHUNK; a <= to; a += CHUNK) starts.push(a);
    const parts = await Promise.all(starts.map((a) => cachedChunk(a, ctx)));
    const wantSet = new Set(want);
    return parts.flat().filter((l) => {
      const bn = Number(BigInt(l.blockNumber));
      return bn >= from && bn <= to && wantSet.has(l.address.toLowerCase()) && topicsMatch(filter.topics, l.topics);
    });
  }
  const ranges = [];
  for (let a = from; a <= to; a += CHUNK) ranges.push([a, Math.min(a + CHUNK - 1, to)]);
  const parts = await Promise.all(ranges.map(([a, b]) => getLogsChunk(filter, a, b, ctx)));
  return parts.flat();
}

function cachedChunk(start, ctx) {
  let p = cache.get(start);
  if (p) {
    cacheHits++;
    return p;
  }
  p = getLogsChunk({ address: ADDRESSES }, start, start + CHUNK - 1, { get aborted() { return false; } });
  p.catch(() => cache.delete(start));
  cache.set(start, p);
  return p;
}

function topicsMatch(filterTopics, logTopics) {
  if (!filterTopics) return true;
  return filterTopics.every((t, i) => {
    if (t === null || t === undefined) return true;
    const opts = [t].flat().map((x) => x.toLowerCase());
    return logTopics[i] !== undefined && opts.includes(logTopics[i].toLowerCase());
  });
}

async function handle(req, ctx) {
  if (req.method === "eth_getLogs") {
    try {
      return { jsonrpc: "2.0", id: req.id, result: await getLogs(req.params, ctx) };
    } catch (e) {
      return { jsonrpc: "2.0", id: req.id, error: { code: -32000, message: String(e.message || e) } };
    }
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await call(req);
      if (!r.error || attempt > 5 || !/limit|rate|429/i.test(JSON.stringify(r.error))) return { ...r, id: req.id };
    } catch (e) {
      if (attempt > 5) return { jsonrpc: "2.0", id: req.id, error: { code: -32000, message: String(e.message || e) } };
    }
    await sleep(250 * (attempt + 1));
  }
}

http
  .createServer((req, res) => {
    let data = "";
    // Stop fetching chunks for a request whose client has timed out and hung up.
    const ctx = { aborted: false };
    res.on("close", () => (ctx.aborted = !res.writableFinished));
    req.on("data", (c) => (data += c));
    req.on("end", async () => {
      let body;
      try {
        body = JSON.parse(data);
      } catch {
        res.writeHead(400).end("bad json");
        return;
      }
      const out = Array.isArray(body) ? await Promise.all(body.map((b) => handle(b, ctx))) : await handle(body, ctx);
      if (ctx.aborted) return;
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(out));
    });
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`logs-proxy on http://127.0.0.1:${PORT} -> ${UPSTREAMS.map((u) => u.url).join(", ")} (chunk ${CHUNK}, ${RPS} rps each)`);
  });

setInterval(() => served && console.log(`chunks fetched: ${served}, cache hits: ${cacheHits}`), 30000).unref();
