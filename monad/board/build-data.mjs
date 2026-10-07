// Build docs/board-data.json for the verdict board (docs/index.html) from the batch results, the
// signed records, the slash demo receipts and the x402 runs. Offline; the page itself re-reads every
// verdict from Monad testnet and re-verifies every signature in the browser, so nothing here is
// trusted by the page except the list of what to look up.
//
//   node monad/board/build-data.mjs
import path from "node:path";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MONAD = path.join(HERE, "..");
const json = (p) => JSON.parse(readFileSync(p, "utf8"));
const dep = json(path.join(MONAD, "deployment.json"));
const resultsFile = readFileSync(path.join(MONAD, "batch", "INDEX"), "utf8").trim().split("\n").pop();
const results = json(path.join(MONAD, "batch", resultsFile));
const titles = Object.fromEntries(json(path.join(MONAD, "batch", "markets.json")).markets.map((m) => [m.market_id, m.title]));

const verdicts = results.verdicts.filter((v) => v.responseStatus === 1).map((v) => {
  const a = json(path.join(MONAD, "batch", "records", `${v.market_id}.json`)).attestation;
  return { market_id: v.market_id, title: titles[v.market_id] || "", proposal: v.proposal, outcome: v.outcome, score: v.score,
    requestHash: v.requestHash, responseHash: v.responseHash, requestTx: v.requestTx, responseTx: v.responseTx, responseBlock: v.responseBlock,
    record: { public_key: a.public_key, signature: a.signature, canonical: a.canonical } };
});
const slashFile = readdirSync(path.join(MONAD, "slash")).filter((f) => /^slash-.*\.json$/.test(f)).sort().pop();
const slash = json(path.join(MONAD, "slash", slashFile));
const x402 = readdirSync(path.join(MONAD, "x402", "runs")).filter((f) => f.endsWith(".json")).sort().map((f) => {
  const r = json(path.join(MONAD, "x402", "runs", f));
  return { market: r.market, tx: r.payment?.tx, block: r.payment?.block, amountUSDC: r.payment?.amountUSDC, latencyMs: r.latencyMs, verdict: r.verdict?.response ?? null };
});

const data = {
  chainId: 10143, rpc: "https://testnet-rpc.monad.xyz", explorer: "https://testnet.monadvision.com",
  contracts: Object.fromEntries(Object.entries(dep.contracts).map(([k, v]) => [k, v.address])),
  validator: dep.validator,
  batch: { ranAt: results.ranAt, file: `monad/batch/${resultsFile}`, verdicts: results.verdictsWritten, transactions: results.transactions, blocks: results.blocks, chainSeconds: results.chainSeconds, costMON: results.costMON, gas: results.gas },
  verdicts,
  slash: { bond: slash.bond, requestHash: slash.requestHash, market: slash.market, parties: slash.parties, receipts: slash.receipts.map((r) => ({ step: r.step.trim(), tx: r.tx, block: r.block })) },
  x402,
};
writeFileSync(path.join(MONAD, "..", "docs", "board-data.json"), JSON.stringify(data) + "\n");
console.log(`docs/board-data.json: ${verdicts.length} verdicts, slash ${slash.bond}, ${x402.length} x402 runs`);
