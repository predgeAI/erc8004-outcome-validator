// Bundle the repo's Monad testnet artifacts into src/generated/data.json at build time:
// the 145 batch verdicts with the exact signed records their responseHash is bound to, the
// slash demo receipts and the x402 paid-call runs. Nothing here is trusted by the page: it
// re-reads every verdict from Monad testnet and re-verifies every signature in the browser.
import path from "node:path";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MONAD = path.join(HERE, "..", "..", "monad");
const json = (p) => JSON.parse(readFileSync(p, "utf8"));
const dep = json(path.join(MONAD, "deployment.json"));
const resultsFile = readFileSync(path.join(MONAD, "batch", "INDEX"), "utf8").trim().split("\n").pop();
const results = json(path.join(MONAD, "batch", resultsFile));
const markets = Object.fromEntries(json(path.join(MONAD, "batch", "markets.json")).markets.map((m) => [m.market_id, m]));

const verdicts = results.verdicts.filter((v) => v.responseStatus === 1).map((v) => {
  const a = json(path.join(MONAD, "batch", "records", `${v.market_id}.json`)).attestation;
  return {
    market_id: v.market_id, title: markets[v.market_id]?.title || "", proposal: v.proposal, outcome: v.outcome, score: v.score,
    requestHash: v.requestHash, responseHash: v.responseHash, requestTx: v.requestTx, responseTx: v.responseTx, responseBlock: v.responseBlock,
    record: { public_key: a.public_key, signature: a.signature, canonical: a.canonical },
  };
});

const slashFile = readdirSync(path.join(MONAD, "slash")).filter((f) => /^slash-.*\.json$/.test(f)).sort().pop();
const slash = json(path.join(MONAD, "slash", slashFile));
const x402 = readdirSync(path.join(MONAD, "x402", "runs")).filter((f) => f.endsWith(".json")).sort().map((f) => {
  const r = json(path.join(MONAD, "x402", "runs", f));
  return { file: f, market: r.market, tx: r.payment?.tx, block: r.payment?.block, amountUSDC: r.payment?.amountUSDC, latencyMs: r.latencyMs,
    payer: r.payment?.from, payTo: r.payment?.to, gasPaidBy: r.payment?.gasPaidBy, recordSignatureOk: r.recordSignatureOk,
    verdict: r.verdict ? { response: r.verdict.response, responseTx: r.verdict.responseTx, bound: r.verdict.boundToSignedRecord } : null,
    decision: r.decision };
});

const data = {
  chainId: 10143, rpc: "https://testnet-rpc.monad.xyz", explorer: "https://testnet.monadvision.com",
  contracts: Object.fromEntries(Object.entries(dep.contracts).map(([k, v]) => [k, v.address])),
  validator: dep.validator,
  batch: { ranAt: results.ranAt, verdicts: results.verdictsWritten, transactions: results.transactions, blocks: results.blocks, chainSeconds: results.chainSeconds, costMON: results.costMON },
  verdicts,
  slash: { ranAt: slash.ranAt, bond: slash.bond, market: slash.market, requestHash: slash.requestHash, expected: slash.expected, delivered: slash.delivered,
    tamperedOutcome: slash.tamperedOutcome, disputeWindowSeconds: slash.disputeWindowSeconds, parties: slash.parties, result: slash.result,
    record: slash.record, receipts: slash.receipts.map((r) => ({ step: r.step.trim(), from: r.from, tx: r.tx, block: r.block })) },
  x402,
};
mkdirSync(path.join(HERE, "..", "src", "generated"), { recursive: true });
writeFileSync(path.join(HERE, "..", "src", "generated", "data.json"), JSON.stringify(data) + "\n");
writeFileSync(path.join(HERE, "..", "src", "generated", "batch.json"), JSON.stringify(data.batch) + "\n");
console.log(`guard data: ${verdicts.length} verdicts, slash ${slash.bond}, ${x402.length} x402 runs`);
