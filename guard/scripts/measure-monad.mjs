// Measures what Predge's Monad mainnet verdict runs cost and how fast they landed, from receipts and block timestamps.
// node scripts/measure-monad.mjs ../monad/mainnet/runs  -> src/lib/monad-measured.json
import { readFileSync, writeFileSync } from "node:fs";
import * as v from "viem";
const dir = process.argv[2];
const c = v.createPublicClient({ transport: v.http("https://rpc.monad.xyz", { batch: true, retryCount: 5 }) });
const files = ["live-2026-10-12T22-32-40-193Z.json", "live-2026-10-13T08-15-57-062Z.json"];
const txs = []; const pairs = [];
for (const f of files) {
  const d = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
  for (const x of d.verdicts) {
    if (x.request) txs.push({ m: x.market_id, k: "req", h: x.request.tx });
    if (x.response) { txs.push({ m: x.market_id, k: "resp", h: x.response.tx }); pairs.push(x.market_id); }
  }
}
const blocks = new Map();
for (const t of txs) {
  const [r, tx] = await Promise.all([c.getTransactionReceipt({ hash: t.h }), c.getTransaction({ hash: t.h })]);
  t.block = r.blockNumber; t.gasUsed = r.gasUsed; t.price = r.effectiveGasPrice; t.gasLimit = tx.gas; t.status = r.status; t.from = r.from;
  if (!blocks.has(r.blockNumber)) blocks.set(r.blockNumber, (await c.getBlock({ blockNumber: r.blockNumber })).timestamp);
  t.ts = blocks.get(r.blockNumber);
}
const fee = (t) => t.gasUsed * t.price;
const tot = txs.reduce((a, t) => a + fee(t), 0n);
console.log("markets", new Set(txs.map((t) => t.m)).size, "tx", txs.length, "all success", txs.every((t) => t.status === "success"));
console.log("gasUsed==gasLimit", txs.every((t) => t.gasUsed === t.gasLimit));
console.log("prices gwei", [...new Set(txs.map((t) => v.formatGwei(t.price)))]);
console.log("total MON", v.formatEther(tot));
const req = txs.filter((t) => t.k === "req"), resp = txs.filter((t) => t.k === "resp");
const avg = (a) => a.reduce((x, y) => x + y, 0n) / BigInt(a.length);
console.log("avg MON per request", v.formatEther(avg(req.map(fee))), "per response", v.formatEther(avg(resp.map(fee))));
const per = pairs.map((m) => { const a = txs.find((t) => t.m === m && t.k === "req"), b = txs.find((t) => t.m === m && t.k === "resp"); return { m, db: Number(b.block - a.block), dt: Number(b.ts - a.ts), fee: fee(a) + fee(b) }; });
console.log("pairs", per.length);
console.log("per verdict (req+resp) MON avg", v.formatEther(avg(per.map((p) => p.fee))), "min", v.formatEther(per.reduce((a, p) => p.fee < a ? p.fee : a, per[0].fee)), "max", v.formatEther(per.reduce((a, p) => p.fee > a ? p.fee : a, 0n)));
const dbs = per.map((p) => p.db).sort((a, b) => a - b), dts = per.map((p) => p.dt).sort((a, b) => a - b);
console.log("blocks req->resp", dbs.join(","), "median", dbs[dbs.length >> 1]);
console.log("seconds req->resp", dts.join(","), "median", dts[dts.length >> 1]);
const bn = [...blocks.keys()].sort((a, b) => (a < b ? -1 : 1));
console.log("first block", bn[0], blocks.get(bn[0]), "last", bn.at(-1), blocks.get(bn.at(-1)));
// block interval over the run window
const lo = bn[0], hi = bn.at(-1);
const b0 = await c.getBlock({ blockNumber: lo }), b1 = await c.getBlock({ blockNumber: lo + 100000n });
console.log("block interval over 100000 blocks from", lo, ":", Number(b1.timestamp - b0.timestamp) / 100000, "s");
for (const r of [1, 2]) { const s = txs.filter((t) => (r === 1 ? t.block < 112950000n : t.block >= 112950000n)); console.log("run", r, "tx", s.length, "wall s", Number(s.at(-1).ts - s[0].ts), "blocks", Number(s.at(-1).block - s[0].block), "MON", v.formatEther(s.reduce((a, t) => a + fee(t), 0n))); }

const r2 = per.filter((p) => p.db < 10);
const px = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd&include_last_updated_at=true").then((r) => r.json()).catch(() => null);
const out = {
  measuredAt: new Date().toISOString(), rpc: "https://rpc.monad.xyz", runs: files.map((f) => `monad/mainnet/runs/${f}`),
  markets: new Set(txs.map((t) => t.m)).size, txs: txs.length, verdicts: per.length, allSucceeded: txs.every((t) => t.status === "success"),
  gasPriceGwei: Number(v.formatGwei(txs[0].price)),
  totalMON: Number(v.formatEther(tot)),
  monPerVerdict: Number(v.formatEther(avg(per.map((p) => p.fee)))),
  monPerResponse: Number(v.formatEther(avg(resp.map(fee)))),
  run1: { txs: 56, seconds: Number(txs.filter((t) => t.block < 112950000n).at(-1).ts - txs.filter((t) => t.block < 112950000n)[0].ts), blocks: Number(txs.filter((t) => t.block < 112950000n).at(-1).block - txs[0].block) + 1 },
  run2: { pairs: r2.length, blocks: [Math.min(...r2.map((p) => p.db)), Math.max(...r2.map((p) => p.db))], seconds: [Math.min(...r2.map((p) => p.dt)), Math.max(...r2.map((p) => p.dt))] },
  blockIntervalS: Number(b1.timestamp - b0.timestamp) / 100000,
  monUsd: px?.monad?.usd ?? null, monUsdAt: px?.monad?.last_updated_at ? new Date(px.monad.last_updated_at * 1000).toISOString() : null, monUsdSource: "https://www.coingecko.com/en/coins/monad",
};
writeFileSync(new URL("../src/lib/monad-measured.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(out);
