// Batch of Predge verdicts on real historical disputed Polymarket markets, on Monad TESTNET.
//
//   node monad/batch/run-batch.mjs --n 150                         dry run: plan, gas, cost; nothing sent
//   CONFIRM_TESTNET=yes node monad/batch/run-batch.mjs --n 150 --send
//
// Input: the signed Settlement Risk records in monad/batch/records/ (fetch-records.mjs). Each record
// is verified offline (ed25519 over `canonical`, payload re-canonicalised) before it is used.
//
// Per market, two transactions on PredgeAgentValidator (0x8847…6e8A):
//   1 validationRequest  sent by an AGENT key. The claim is what an agent that acted on the proposal
//                        before settlement bet on: "the final on-chain outcome equals the first
//                        disputed proposal". requestHash = keccak256(canonical claim JSON).
//   2 validationResponse sent by the Predge validator key. response = 100 if the on-chain resolution
//                        equals that proposal, 0 if it settled differently. responseHash =
//                        keccak256(UTF-8 bytes of the signed record's `canonical`), so the verdict is
//                        bound to the exact signed evidence in records/<market_id>.json.
//
// Requests go out in parallel from several agent keys (Monad has no global mempool; nonces are per
// sender). Responses are pipelined from the one validator key with explicit nonces. Monad charges
// the gas LIMIT, so every limit is the measured estimate plus 10%.
//
// Keys: validator = PRIVATE_KEY in ~/.predge-monad/monad-testnet.env; agents = AGENT_<i>_PRIVATE_KEY
// in ~/.predge-monad/monad-metropolis.env (override with PREDGE_ENV_FILE / PREDGE_AGENT_ENV_FILE).
// Keys are never printed. Refuses any chain id other than 10143.
import os from "node:os";
import path from "node:path";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { canon, verifyAttestation } from "./fetch-records.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RPC = process.env.RPC_URL || "https://testnet-rpc.monad.xyz";
const EXPLORER = "https://testnet.monadvision.com";
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SEND = argv.includes("--send");
const N = Number(arg("--n", "150"));
const AGENTS = Number(arg("--agents", "6"));
const TIP = ethers.parseUnits(arg("--tip-gwei", "1"), "gwei");
const TAG = "predge:settlement-risk-v1";
if (SEND && process.env.CONFIRM_TESTNET !== "yes") { console.error("Refusing: --send needs CONFIRM_TESTNET=yes"); process.exit(2); }

const readEnv = (f) => Object.fromEntries(readFileSync(f, "utf8").split("\n").map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2]]));
const env = { ...readEnv(process.env.PREDGE_ENV_FILE || path.join(os.homedir(), ".predge-monad/monad-testnet.env")), ...readEnv(process.env.PREDGE_AGENT_ENV_FILE || path.join(os.homedir(), ".predge-monad/monad-metropolis.env")) };
const dep = JSON.parse(readFileSync(path.join(HERE, "..", "deployment.json"), "utf8"));
const VALIDATOR_CONTRACT = ethers.getAddress(dep.contracts.PredgeAgentValidator.address);
const ABI = [
  "function validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash)",
  "function validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)",
  "function getValidationStatus(bytes32) view returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string tag, uint256 lastUpdate)",
  "function isValidated(bytes32) view returns (bool)",
];
const iface = new ethers.Interface(ABI);

const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: ethers.Network.from(10143n), batchMaxCount: 1 });
if (BigInt(await provider.send("eth_chainId", [])) !== 10143n) throw new Error("RPC is not Monad testnet (10143)");
const validator = new ethers.Wallet(env.PRIVATE_KEY, provider);
if (validator.address !== ethers.getAddress(dep.validator)) throw new Error("validator key does not match deployment.json");
const agents = Array.from({ length: AGENTS }, (_, i) => new ethers.Wallet(env[`AGENT_${i + 1}_PRIVATE_KEY`], provider));
const contract = new ethers.Contract(VALIDATOR_CONTRACT, ABI, provider);

// ---- build the verdicts from the signed records ----
export function buildVerdict(rec) {
  const a = rec.attestation;
  const p = JSON.parse(a.canonical);
  const proposal = p.disputes[0].disputed_proposal;
  const outcome = p.onchain_resolution.outcome;
  const claim = { kind: "predge-settlement-claim-v1", platform: "polymarket", market_id: p.market_id, uma_question_id: p.uma_question_id, claim: "final on-chain outcome equals the first disputed proposal", proposal };
  return {
    market_id: p.market_id, proposal, outcome, dispute_count: Number(p.dispute_count),
    claim, requestHash: ethers.keccak256(ethers.toUtf8Bytes(canon(claim))),
    responseHash: ethers.keccak256(ethers.toUtf8Bytes(a.canonical)),
    score: outcome === proposal ? 100 : 0,
    requestURI: `pm:${p.market_id}`, responseURI: `predge:sr:${p.market_id}`,
  };
}

const files = readdirSync(path.join(HERE, "records")).filter((f) => /^\d+\.json$/.test(f));
const { markets } = JSON.parse(readFileSync(path.join(HERE, "markets.json"), "utf8"));
const order = new Map(markets.map((m, i) => [m.market_id, i]));
const verdicts = [];
for (const f of files.sort((x, y) => order.get(x.slice(0, -5)) - order.get(y.slice(0, -5)))) {
  const rec = JSON.parse(readFileSync(path.join(HERE, "records", f), "utf8"));
  if (!verifyAttestation({ ...rec.attestation, payload: JSON.parse(rec.attestation.canonical) })) throw new Error(`${f}: signature check failed`);
  verdicts.push(buildVerdict(rec));
}

// skip anything already answered on chain (resumable)
const todo = [];
for (const v of verdicts) {
  if (todo.length >= N) break;
  const s = await contract.getValidationStatus(v.requestHash);
  if (s.lastUpdate === 0n) todo.push(v);
}
console.log(`records ${verdicts.length}, to send ${todo.length} (n=${N}), agents ${AGENTS}`);
if (!todo.length) process.exit(0);

// ---- gas and cost plan ----
const block = await provider.getBlock("latest");
const maxFee = (block.baseFeePerGas * 102n) / 100n + TIP; // a cap; Monad charges limit x (base fee + tip)
const price = block.baseFeePerGas + TIP;
const reqData = (v) => iface.encodeFunctionData("validationRequest", [validator.address, 0, v.requestURI, v.requestHash]);
const resData = (v) => iface.encodeFunctionData("validationResponse", [v.requestHash, v.score, v.responseURI, v.responseHash, TAG]);
const reqEst = await provider.estimateGas({ from: agents[0].address, to: VALIDATOR_CONTRACT, data: reqData(todo[0]) });
const reqLimit = (reqEst * 110n) / 100n;
const resLimitGuess = (reqEst * 110n) / 100n; // refined after the first request lands
const perVerdict = (reqLimit + resLimitGuess) * price;
console.log(`base fee ${ethers.formatUnits(block.baseFeePerGas, "gwei")} gwei, tip ${ethers.formatUnits(TIP, "gwei")} gwei`);
console.log(`request gas estimate ${reqEst}, limit ${reqLimit}; planned cost per verdict ~${ethers.formatEther(perVerdict)} MON, total ~${ethers.formatEther(perVerdict * BigInt(todo.length))} MON`);
const vBal = await provider.getBalance(validator.address);
console.log(`validator ${validator.address} ${ethers.formatEther(vBal)} MON`);
if (!SEND) { console.log("DRY RUN. Add --send with CONFIRM_TESTNET=yes to broadcast."); process.exit(0); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitReceipt(hash) {
  for (let i = 0; i < 600; i++) {
    const r = await provider.getTransactionReceipt(hash).catch(() => null);
    if (r) return r;
    await sleep(400);
  }
  throw new Error(`no receipt for ${hash}`);
}
async function sendRaw(wallet, nonce, data, gasLimit) {
  const tx = { to: VALIDATOR_CONTRACT, data, nonce, gasLimit, maxFeePerGas: maxFee, maxPriorityFeePerGas: TIP, chainId: 10143, type: 2 };
  const signed = await wallet.signTransaction(tx);
  for (let attempt = 0; ; attempt++) {
    try { return await provider.send("eth_sendRawTransaction", [signed]); }
    catch (e) { if (attempt >= 4) throw e; await sleep(500 * (attempt + 1)); }
  }
}

// ---- fund the agent keys ----
// Monad reserve balance: below 10 MON, a value transfer only succeeds as an "emptying" transaction,
// i.e. when the sender has no other transaction in the last k = 3 blocks. So the validator funds
// one agent at a time and waits 4 blocks between transfers (a burst of transfers reverts).
const shares = agents.map((_, i) => todo.filter((_, j) => j % AGENTS === i));
const funding = [];
async function waitBlocksAfter(b, k = 4) { while ((await provider.getBlockNumber()) < b + k) await sleep(300); }
for (const [i, a] of agents.entries()) {
  const need = reqLimit * maxFee * BigInt(shares[i].length) + ethers.parseEther("0.002");
  const have = await provider.getBalance(a.address);
  if (have >= need) continue;
  const nonce = await provider.getTransactionCount(validator.address, "pending");
  const t = await validator.sendTransaction({ to: a.address, value: need - have, gasLimit: 21000n, maxFeePerGas: maxFee, maxPriorityFeePerGas: TIP, nonce });
  const r = await waitReceipt(t.hash);
  funding.push({ agent: a.address, value: ethers.formatEther(need - have), tx: t.hash, block: r.blockNumber, status: r.status });
  if (r.status !== 1) throw new Error(`funding ${a.address} reverted (${t.hash})`);
  await waitBlocksAfter(r.blockNumber);
}
console.log(`funded ${funding.length} agent keys`);

// ---- phase 1: requests in parallel from the agent keys ----
const rows = new Map(todo.map((v) => [v.requestHash, { ...v }]));
const t0 = Date.now();
await Promise.all(agents.map(async (a, i) => {
  let nonce = await provider.getTransactionCount(a.address, "pending");
  for (const v of shares[i]) {
    const row = rows.get(v.requestHash);
    row.agent = a.address;
    row.reqSentAt = Date.now();
    row.reqTx = await sendRaw(a, nonce++, reqData(v), reqLimit);
  }
}));
const t1 = Date.now();
console.log(`phase 1: ${todo.length} requests submitted in ${((t1 - t0) / 1000).toFixed(1)} s, waiting for receipts`);
await Promise.all([...rows.values()].map(async (row) => { const r = await waitReceipt(row.reqTx); row.reqReceipt = r; row.reqMinedAt = Date.now(); }));
const t2 = Date.now();
const failedReq = [...rows.values()].filter((r) => r.reqReceipt.status !== 1);
console.log(`phase 1 done: all receipts after ${((t2 - t0) / 1000).toFixed(1)} s, failed ${failedReq.length}`);

// ---- phase 2: verdicts, pipelined from the validator key ----
const okRows = [...rows.values()].filter((r) => r.reqReceipt.status === 1);
const resEst = await provider.estimateGas({ from: validator.address, to: VALIDATOR_CONTRACT, data: resData(okRows[0]) });
const resLimit = (resEst * 110n) / 100n;
console.log(`response gas estimate ${resEst}, limit ${resLimit}`);
let vNonce = await provider.getTransactionCount(validator.address, "pending");
const t3 = Date.now();
for (const row of okRows) { row.resSentAt = Date.now(); row.resTx = await sendRaw(validator, vNonce++, resData(row), resLimit); }
const t4 = Date.now();
console.log(`phase 2: ${okRows.length} verdicts submitted in ${((t4 - t3) / 1000).toFixed(1)} s, waiting for receipts`);
await Promise.all(okRows.map(async (row) => { const r = await waitReceipt(row.resTx); row.resReceipt = r; row.resMinedAt = Date.now(); }));
const t5 = Date.now();

// ---- measure ----
const all = [...rows.values()];
const receipts = all.flatMap((r) => [r.reqReceipt, r.resReceipt].filter(Boolean));
const blocks = receipts.map((r) => r.blockNumber);
const firstBlock = Math.min(...blocks), lastBlock = Math.max(...blocks);
const [bFirst, bLast] = await Promise.all([provider.getBlock(firstBlock), provider.getBlock(lastBlock)]);
const cost = receipts.reduce((s, r) => s + r.gasUsed * (r.gasPrice ?? r.effectiveGasPrice), 0n);
const gasUsed = receipts.reduce((s, r) => s + r.gasUsed, 0n);
const okVerdicts = all.filter((r) => r.resReceipt?.status === 1);
// read back every verdict and check it is bound to the signed record
let bound = 0;
for (const r of okVerdicts) { const s = await contract.getValidationStatus(r.requestHash); if (s.responseHash === r.responseHash && Number(s.response) === r.score) bound++; }
const perBlock = {};
for (const b of blocks) perBlock[b] = (perBlock[b] || 0) + 1;
const summary = {
  ranAt: new Date(t0).toISOString(), chainId: 10143, contract: VALIDATOR_CONTRACT, validator: validator.address, agents: agents.map((a) => a.address),
  markets: all.length, verdictsWritten: okVerdicts.length, readBackBound: bound, failedRequests: failedReq.length,
  score100: okVerdicts.filter((r) => r.score === 100).length, score0: okVerdicts.filter((r) => r.score === 0).length,
  transactions: receipts.length, fundingTxs: funding.length,
  blocks: { first: firstBlock, last: lastBlock, span: lastBlock - firstBlock + 1, distinctBlocksWithOurTxs: Object.keys(perBlock).length, maxOfOurTxsInOneBlock: Math.max(...Object.values(perBlock)) },
  chainSeconds: Number(bLast.timestamp - bFirst.timestamp),
  wallSeconds: { phase1Submit: (t1 - t0) / 1000, phase1AllMined: (t2 - t0) / 1000, phase2Submit: (t4 - t3) / 1000, phase2AllMined: (t5 - t3) / 1000, total: (t5 - t0) / 1000 },
  gas: { requestEstimate: reqEst.toString(), requestLimit: reqLimit.toString(), responseEstimate: resEst.toString(), responseLimit: resLimit.toString(), totalCharged: gasUsed.toString() },
  feesGwei: { baseFee: ethers.formatUnits(block.baseFeePerGas, "gwei"), tip: ethers.formatUnits(TIP, "gwei") },
  costMON: { total: ethers.formatEther(cost), perVerdict: ethers.formatEther(cost / BigInt(Math.max(okVerdicts.length, 1))) },
  medianSecondsSendToReceipt: { request: median(all.map((r) => (r.reqMinedAt - r.reqSentAt) / 1000)), verdict: median(okVerdicts.map((r) => (r.resMinedAt - r.resSentAt) / 1000)) },
  funding,
  verdicts: all.map((r) => ({ market_id: r.market_id, proposal: r.proposal, outcome: r.outcome, score: r.score, requestHash: r.requestHash, responseHash: r.responseHash, agent: r.agent,
    requestTx: r.reqTx, requestBlock: r.reqReceipt?.blockNumber, requestStatus: r.reqReceipt?.status, responseTx: r.resTx ?? null, responseBlock: r.resReceipt?.blockNumber ?? null, responseStatus: r.resReceipt?.status ?? null })),
};
function median(xs) { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? Number(s[Math.floor(s.length / 2)].toFixed(2)) : null; }
// ---- return what is left on the agent keys to the validator ----
summary.sweep = [];
await waitBlocksAfter(await provider.getBlockNumber()); // each agent's last tx is > k blocks old: the sweep is an emptying transaction
for (const a of agents) {
  const bal = await provider.getBalance(a.address);
  const fee = 21000n * maxFee;
  if (bal <= fee * 2n) continue;
  const nonce = await provider.getTransactionCount(a.address, "pending");
  const t = await a.sendTransaction({ to: validator.address, value: bal - fee, gasLimit: 21000n, maxFeePerGas: maxFee, maxPriorityFeePerGas: TIP, nonce });
  summary.sweep.push({ agent: a.address, value: ethers.formatEther(bal - fee), tx: t.hash });
}
const out = path.join(HERE, `results-${summary.ranAt.replace(/[:.]/g, "-")}.json`);
writeFileSync(out, JSON.stringify(summary, null, 1) + "\n");
const { verdicts: _v, funding: _f, sweep: _s, ...head } = summary;
console.log(JSON.stringify(head, null, 1));
console.log(`results -> ${path.relative(process.cwd(), out)}  explorer ${EXPLORER}/address/${VALIDATOR_CONTRACT}`);
