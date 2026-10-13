// Predge verdicts on Monad MAINNET (chain 143) for live and recently settled Polymarket UMA disputes.
//
//   node monad/mainnet/live-verdicts.mjs                  discover + verify + snapshot + plan (DRY RUN, nothing sent)
//   CONFIRM_MAINNET=yes node monad/mainnet/live-verdicts.mjs --send
//                                                         send the reviewed plan in live-plan.json
//   node monad/mainnet/live-verdicts.mjs --respond        plan responses for open-dispute requests that have since settled
//   CONFIRM_MAINNET=yes node monad/mainnet/live-verdicts.mjs --respond --send
//   node monad/mainnet/live-verdicts.mjs --markets 2446852,1144023 --plan monad/mainnet/famous-plan.json
//                                                         plan an explicit list of markets, any age (DRY RUN)
//   CONFIRM_MAINNET=yes node monad/mainnet/live-verdicts.mjs --send --plan monad/mainnet/famous-plan.json
//
//   --plan <file>  plan file written by the dry run and read by --send / --respond
//                  (default monad/mainnet/live-plan.json; with --markets, monad/mainnet/markets-plan.json)
//
// --markets <id,id,...> (explicit list, no recency window): Gamma by market id gives the UMA question id
//   and labels; Polygon logs give every DisputePrice by that adapter for the question from (market
//   creation - 2 d) to its QuestionResolved (or head), and the QuestionResolved itself. Settled markets
//   get request + response, open disputes the request only; a market whose request is already on chain
//   is skipped and reported. The same record verification and chain cross-checks apply, plus: every
//   dispute tx in the record must be on chain.
//
// Selection (dry run):
//   1  Polygon logs: every UMA DisputePrice on the Managed OOv2 (0x2c03...) in the last --scan-days
//      (default 35), any requester (the UMA CTF adapters). questionID = keccak256(ancillaryData).
//   2  Polygon logs: QuestionResolved on the same adapters for those questions (time + settledPrice).
//   3  Gamma (question_ids) for market id, title, outcome labels and umaResolutionStatuses.
//   4  (a) SETTLED: resolved on chain in the last --days (default 21); (b) OPEN: no QuestionResolved
//      on chain, the signed record says open_dispute and Gamma says disputed.
//   5  The signed Predge record (api.predge.io/v1/settlement-risk/<id>) is verified (key listed in
//      /.well-known/predge-keys.json, ed25519 over canonical, sha256 == content_hash, payload
//      re-canonicalises, market id) and cross-checked against the chain: question id, every dispute
//      tx seen on chain is in the record, dispute_count == disputes.length, first disputed proposal
//      and final outcome equal the chain prices mapped through the Gamma labels, resolved state.
//      Any disagreement: the market is skipped and listed.
//   6  The record is saved to records/<market_id>.json together with the claim, so requestURI and
//      responseURI on raw.githubusercontent.com resolve to the exact bytes once the branch is merged.
//
// Per market, on PredgeAgentValidator 0xf4EE...eeF9, all from the ONE validator key:
//   validationRequest(validator, 0, requestURI, requestHash)
//      claim = "final on-chain outcome equals the first disputed proposal" (as the testnet batch),
//      requestHash = keccak256(canonical claim JSON).
//   validationResponse(requestHash, 100|0, responseURI, responseHash, "predge:settlement-risk-v1")
//      SETTLED markets only, in the same run. responseHash = keccak256(signed canonical bytes).
//   OPEN disputes get the request only now (the claim is committed while the dispute is live);
//   --respond writes the response after they settle, bound to records/<market_id>-settled.json.
//
// Monad charges the gas LIMIT: limit = estimate + 10%. Responses are estimated with a state override
// that marks the request as committed. Worst-case cost = sum(limit) x maxFeePerGas, including the
// deferred responses of open disputes; the run refuses above --max-mon (1.5 MON).
// Key: PRIVATE_KEY in ~/.predge-monad/monad-testnet.env, loaded only on --send, never printed.
// No value transfer is ever made. Refuses any chain id other than 143.
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { canon } from "../batch/fetch-records.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SEND = argv.includes("--send");
const RESPOND = argv.includes("--respond");
const DAYS = Number(arg("--days", "21"));
const SCAN_DAYS = Number(arg("--scan-days", "35"));
const MAX_MARKETS = Number(arg("--max", "50"));
const MAX_MON = ethers.parseEther(arg("--max-mon", "1.5"));
const BUDGET = ethers.parseEther(arg("--budget", "1.45"));
const MAX_OPEN = Number(arg("--max-open", "12"));
const MARKETS = arg("--markets") ? [...new Set(arg("--markets").split(",").map((x) => x.trim()).filter(Boolean))] : null;
if (MARKETS && MARKETS.some((x) => !/^\d+$/.test(x))) { console.error("--markets takes numeric Polymarket market ids, comma separated"); process.exit(2); }
const STRICT_OPEN = argv.includes("--strict-open"); // only records with open_dispute true (not reset-and-awaiting-proposal)
if (SEND && process.env.CONFIRM_MAINNET !== "yes") { console.error("Refusing: --send needs CONFIRM_MAINNET=yes"); process.exit(2); }

const CHAIN_ID = 143n;
const RPC = process.env.RPC_URL || "https://rpc.monad.xyz";
const API = process.env.PREDGE_API || "https://api.predge.io";
const GAMMA = "https://gamma-api.polymarket.com";
const EXPLORER = "https://monadvision.com";
const KEYS_URL = `${API}/.well-known/predge-keys.json`;
const RAW = "https://raw.githubusercontent.com/predgeAI/erc8004-outcome-validator/main/monad/mainnet/records";
const TAG = "predge:settlement-risk-v1";
const OO = "0x2c0367a9db231ddebd88a94b4f6461a6e47c58b1"; // UMA Managed Optimistic Oracle V2 on Polygon
const REC_DIR = path.join(HERE, "records");
const RUN_DIR = path.join(HERE, "runs");
const PLAN_FILE = arg("--plan") ? path.resolve(arg("--plan")) : path.join(HERE, MARKETS ? "markets-plan.json" : "live-plan.json");
mkdirSync(REC_DIR, { recursive: true });

const dep = JSON.parse(readFileSync(path.join(HERE, "deployment.json"), "utf8"));
const CONTRACT = ethers.getAddress(dep.contracts.PredgeAgentValidator.address);
const VALIDATOR = ethers.getAddress(dep.validator);
if (CONTRACT !== "0xf4EE0Af65804D5754E59316b3DBB53D5c3AeeeF9" || VALIDATOR !== "0x9F0Af03C5695b72903c03852f7Dd4Fe5A0d49Fc9") throw new Error("deployment.json does not match the expected mainnet contract / validator");
const ABI = [
  "function validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash)",
  "function validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)",
  "function getValidationStatus(bytes32) view returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string tag, uint256 lastUpdate)",
  "function isValidated(bytes32) view returns (bool)",
  "function requestURIOf(bytes32) view returns (string)",
  "function validator() view returns (address)",
];
const iface = new ethers.Interface(ABI);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (w) => `${Number(ethers.formatEther(w)).toFixed(4)} MON`;
const iso = (t) => new Date(Number(t) * 1000).toISOString().replace(".000Z", "Z");

// ---------------------------------------------------------------- Monad
const monad = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: ethers.Network.from(CHAIN_ID), batchMaxCount: 1 });
if (BigInt(await monad.send("eth_chainId", [])) !== CHAIN_ID) { console.error("RPC is not Monad mainnet (143); refusing"); process.exit(1); }
const contract = new ethers.Contract(CONTRACT, ABI, monad);
if ((await contract.validator()) !== VALIDATOR) throw new Error("contract validator() is not the Predge validator address");

// ---------------------------------------------------------------- records
let KEYS = null;
async function verifyAttestation(att, marketId) {
  KEYS ??= await (await fetch(KEYS_URL)).json();
  const listed = KEYS.keys.some((x) => x.public_key === att.public_key && x.active && x.role === "attestation");
  const pinned = att.public_key.startsWith("13fa3d18a369e6c7");
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(att.public_key, "hex")]);
  const sig = crypto.verify(null, Buffer.from(att.canonical, "utf8"), crypto.createPublicKey({ key: spki, format: "der", type: "spki" }), Buffer.from(att.signature, "hex"));
  const sha = crypto.createHash("sha256").update(att.canonical).digest("hex") === att.content_hash;
  const payload = canon(att.payload) === att.canonical;
  const p = JSON.parse(att.canonical);
  const market = String(p.market?.market_id ?? p.market_id) === String(marketId);
  const failed = Object.entries({ listed, pinned, sig, sha, payload, market }).filter(([, ok]) => !ok).map(([k]) => k);
  return failed.length ? `signed record failed: ${failed.join(", ")}` : null;
}

async function fetchRecord(id) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(`${API}/v1/settlement-risk/${id}`).catch(() => null);
    await sleep(1100); // the route allows 60 requests per minute
    if (res && res.ok) return (await res.json()).attestation;
    if (res && res.status !== 429 && res.status < 500) return { error: `HTTP ${res.status}` };
    await sleep(15000 * (attempt + 1));
  }
  return { error: "rate limited / unavailable" };
}

export function buildClaim(p) {
  return { kind: "predge-settlement-claim-v1", platform: "polymarket", market_id: String(p.market_id), uma_question_id: p.uma_question_id, claim: "final on-chain outcome equals the first disputed proposal", proposal: p.disputes[0].disputed_proposal };
}
const requestHashOf = (claim) => ethers.keccak256(ethers.toUtf8Bytes(canon(claim)));
const responseHashOf = (att) => ethers.keccak256(ethers.toUtf8Bytes(att.canonical));
const reqURI = (id) => `${RAW}/${id}.json`;
const resURI = (id, settledFile) => `${RAW}/${settledFile ? `${id}-settled` : id}.json`;

async function published(uri, att) {
  const txt = await fetch(uri).then((r) => (r.ok ? r.text() : null)).catch(() => null);
  try { return txt !== null && JSON.parse(txt).attestation.canonical === att.canonical; } catch { return false; }
}

// ---------------------------------------------------------------- gas
const fee = await monad.getFeeData();
const block = await monad.getBlock("latest");
const TIP = argv.includes("--tip-gwei") ? ethers.parseUnits(arg("--tip-gwei"), "gwei") : fee.maxPriorityFeePerGas;
const MAX_FEE = (block.baseFeePerGas * 110n) / 100n + TIP;
const reqData = (v) => iface.encodeFunctionData("validationRequest", [VALIDATOR, 0, v.requestURI, v.requestHash]);
const resData = (v) => iface.encodeFunctionData("validationResponse", [v.requestHash, v.score, v.responseURI, v.responseHash, TAG]);
const plus10 = (g) => (g * 110n) / 100n;
async function estReq(v) { return plus10(await monad.estimateGas({ from: VALIDATOR, to: CONTRACT, data: reqData(v) })); }
// a response reverts (NotRequested) until the request exists, so estimate it with requestedAt set by a state override
async function estRes(v, requestOnChain = false) {
  const call = { from: VALIDATOR, to: CONTRACT, data: resData(v) };
  if (requestOnChain) return plus10(await monad.estimateGas(call));
  const base = BigInt(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "uint256"], [v.requestHash, 3])));
  const override = { [CONTRACT]: { stateDiff: { [ethers.toBeHex(base + 3n, 32)]: ethers.toBeHex(1n, 32) } } };
  return plus10(BigInt(await monad.send("eth_estimateGas", [{ ...call, from: VALIDATOR.toLowerCase() }, "latest", override])));
}

// ---------------------------------------------------------------- send helpers
function loadSigner() {
  const env = Object.fromEntries(readFileSync(process.env.PREDGE_ENV_FILE || path.join(os.homedir(), ".predge-monad/monad-testnet.env"), "utf8").split("\n").map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((x) => [x[1], x[2]]));
  const wallet = new ethers.Wallet(env.PRIVATE_KEY, monad);
  if (wallet.address !== VALIDATOR) throw new Error(`key derives ${wallet.address}, expected ${VALIDATOR}`);
  return new ethers.NonceManager(wallet);
}
async function sendAll(signer, items, kind) {
  // submit in order with NonceManager (Monad has no global mempool; nonces are per sender), then wait for all
  const sent = [];
  for (const it of items) {
    const data = kind === "request" ? reqData(it) : resData(it);
    const gasLimit = kind === "request" ? it.reqLimit : it.resLimit;
    const t = await signer.sendTransaction({ to: CONTRACT, data, gasLimit, maxFeePerGas: MAX_FEE, maxPriorityFeePerGas: TIP, value: 0n, chainId: CHAIN_ID, type: 2 });
    sent.push({ it, t });
  }
  for (const { it, t } of sent) {
    const r = await t.wait();
    it[`${kind}Tx`] = { tx: t.hash, url: `${EXPLORER}/tx/${t.hash}`, status: r.status, block: r.blockNumber, gasUsed: r.gasUsed.toString(), gasLimit: (kind === "request" ? it.reqLimit : it.resLimit).toString() };
    console.log(`${kind.padEnd(8)} ${it.market_id.padEnd(9)} ${r.status === 1 ? "ok  " : "FAIL"} ${EXPLORER}/tx/${t.hash}`);
  }
}
async function readBack(items) {
  let bound = 0;
  for (const it of items.filter((x) => x.responseTx?.status === 1)) {
    const s = await contract.getValidationStatus(it.requestHash);
    it.readBack = { response: Number(s.response), responseHash: s.responseHash, tag: s.tag, bound: s.responseHash === it.responseHash && Number(s.response) === it.score };
    if (it.readBack.bound) bound++;
  }
  return bound;
}
const ser = (x) => JSON.parse(JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v)));

// ---------------------------------------------------------------- Polygon (public RPCs, raw JSON-RPC with fallback)
// [url, max getLogs span]; a rate-limited endpoint is dropped for the rest of the run
const POLYGON_RPCS = process.env.POLYGON_RPC_URL ? [[process.env.POLYGON_RPC_URL, 50000]] : [["https://polygon.gateway.tenderly.co", 50000], ["https://rpc-mainnet.matic.quiknode.pro", 10000]];
let rpcIdx = 0;
async function pg(method, params) {
  for (let a = 0; ; a++) {
    const [url] = POLYGON_RPCS[rpcIdx];
    let j = null;
    try { const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(30000) }); j = await r.json().catch(() => ({ error: { message: `HTTP ${r.status}` } })); await sleep(400); }
    catch (e) { j = { error: { message: String(e.message) } }; }
    if (!j.error) return j.result;
    const msg = String(j.error.message);
    const limited = /rate limit|429|Too Many|timeout|aborted|fetch failed/i.test(msg);
    if (!limited && /range|limit|too many results|response size/i.test(msg) && method === "eth_getLogs") throw Object.assign(new Error(msg), { range: true });
    if (a >= 30) throw new Error(`${method}: ${msg}`);
    if (limited) { rpcIdx = (rpcIdx + 1) % POLYGON_RPCS.length; if (rpcIdx === 0) { console.error(`  polygon rpc busy (${msg.slice(0, 60)}), waiting 30 s`); await sleep(30000); } continue; }
    await sleep(2000 * (a + 1));
  }
}
const getBlock = async (n) => { const b = await pg("eth_getBlockByNumber", [n === "latest" ? n : ethers.toQuantity(n), false]); return { number: Number(b.number), timestamp: Number(b.timestamp) }; };
async function logs(filter, from, to) {
  // sequential: public endpoints throttle bursts
  const out = [];
  for (let a = from; a <= to; ) {
    const b = Math.min(a + POLYGON_RPCS[rpcIdx][1] - 1, to);
    try { out.push(...(await pg("eth_getLogs", [{ ...filter, fromBlock: ethers.toQuantity(a), toBlock: ethers.toQuantity(b) }]))); a = b + 1; if (process.env.VERBOSE) console.error(`  logs ${b - from + 1}/${to - from + 1} blocks via ${POLYGON_RPCS[rpcIdx][0]}`); }
    catch (e) { if (!e.range) throw e; POLYGON_RPCS[rpcIdx][1] = Math.max(1000, Math.floor(POLYGON_RPCS[rpcIdx][1] / 2)); }
  }
  return out;
}

// ================================================================ --respond
if (RESPOND) {
  if (!existsSync(PLAN_FILE)) throw new Error(`no plan file ${PLAN_FILE}`);
  const plan = JSON.parse(readFileSync(PLAN_FILE, "utf8"));
  const adapterI = new ethers.Interface(["event QuestionResolved(bytes32 indexed questionID, int256 indexed settledPrice, uint256[] payouts)"]);
  const todo = [], waiting = [], skipped = [];
  for (const m of plan.markets.filter((x) => x.state === "open")) {
    const snap = JSON.parse(readFileSync(path.join(REC_DIR, `${m.market_id}.json`), "utf8"));
    const s = await contract.getValidationStatus(m.requestHash);
    if (s.lastUpdate === 0n) { waiting.push([m.market_id, "request not on chain yet"]); continue; }
    if (await contract.isValidated(m.requestHash)) { waiting.push([m.market_id, "already answered"]); continue; }
    const att = await fetchRecord(m.market_id);
    if (att.error) { skipped.push([m.market_id, att.error]); continue; }
    const bad = await verifyAttestation(att, m.market_id);
    if (bad) { skipped.push([m.market_id, bad]); continue; }
    const p = JSON.parse(att.canonical);
    if (!p.resolved_on_chain || !p.onchain_resolution?.outcome) { waiting.push([m.market_id, `not settled yet (${p.uma_state})`]); continue; }
    // the settled record must describe the same dispute the claim was committed on
    if (p.uma_question_id !== snap.claim.uma_question_id || p.disputes?.[0]?.tx !== JSON.parse(snap.attestation.canonical).disputes[0].tx || p.disputes[0].disputed_proposal !== snap.claim.proposal) { skipped.push([m.market_id, "settled record does not match the committed claim"]); continue; }
    // and the outcome must equal the chain
    const res = await logs({ address: m.adapter, topics: [adapterI.getEvent("QuestionResolved").topicHash, p.uma_question_id] }, m.scanFromBlock, (await getBlock("latest")).number);
    const label = res.length ? priceLabel(adapterI.parseLog(res.at(-1)).args.settledPrice, m.outcomes) : null;
    if (label !== p.onchain_resolution.outcome) { skipped.push([m.market_id, `record outcome ${p.onchain_resolution.outcome} vs chain ${label}`]); continue; }
    const file = path.join(REC_DIR, `${m.market_id}-settled.json`);
    if (!existsSync(file)) writeFileSync(file, JSON.stringify({ source_url: `${API}/v1/settlement-risk/${m.market_id}`, fetched_at: new Date().toISOString(), request: { requestHash: m.requestHash, requestURI: m.requestURI }, attestation: att }, null, 2) + "\n");
    const saved = JSON.parse(readFileSync(file, "utf8")).attestation;
    const v = { ...m, outcome: saved.payload.onchain_resolution.outcome, score: saved.payload.onchain_resolution.outcome === snap.claim.proposal ? 100 : 0, responseURI: resURI(m.market_id, true), responseHash: responseHashOf(saved), att: saved };
    v.resLimit = await estRes(v, true);
    todo.push(v);
  }
  const cost = todo.reduce((s, v) => s + v.resLimit * MAX_FEE, 0n);
  console.log(`=== --respond ${SEND ? "SEND" : "DRY RUN, nothing sent"} | chain 143 | ${CONTRACT}`);
  for (const v of todo) console.log(`  ${v.market_id.padEnd(9)} proposal ${v.proposal} -> outcome ${v.outcome} => ${v.score} | gas limit ${v.resLimit}`);
  for (const [id, why] of waiting) console.log(`  waiting ${id}: ${why}`);
  for (const [id, why] of skipped) console.log(`  SKIP ${id}: ${why}`);
  console.log(`responses ${todo.length}, worst-case ${fmt(cost)} (max fee ${ethers.formatUnits(MAX_FEE, "gwei")} gwei)`);
  if (cost > MAX_MON) { console.error("refusing: cost above --max-mon"); process.exit(1); }
  if (!SEND || !todo.length) { if (todo.length) console.log("DRY RUN. Commit + push records/*-settled.json, then CONFIRM_MAINNET=yes ... --respond --send"); process.exit(0); }
  for (const v of todo) if (!(await published(v.responseURI, v.att))) throw new Error(`${v.responseURI} is not published with the same bytes; push first`);
  const signer = loadSigner();
  await sendAll(signer, todo, "response");
  const bound = await readBack(todo);
  writeRun("respond", todo, bound, cost);
  process.exit(bound === todo.length ? 0 : 1);
}

function priceLabel(price, outcomes) {
  const p = BigInt(price);
  if (p === 10n ** 18n) return outcomes[0];
  if (p === 0n) return outcomes[1];
  if (p === 5n * 10n ** 17n) return "50-50";
  return `price ${p}`;
}

function writeRun(kind, items, bound, plannedCost) {
  mkdirSync(RUN_DIR, { recursive: true });
  const ranAt = new Date().toISOString();
  const out = path.join(RUN_DIR, `live-${ranAt.replace(/[:.]/g, "-")}.json`);
  const charged = items.flatMap((i) => [i.requestTx, i.responseTx].filter(Boolean)).reduce((s, t) => s + BigInt(t.gasLimit), 0n);
  writeFileSync(out, JSON.stringify(ser({
    kind, ranAt, chainId: 143, explorer: EXPLORER, contract: CONTRACT, contractUrl: `${EXPLORER}/address/${CONTRACT}`, validator: VALIDATOR, tag: TAG,
    plannedWorstCaseMON: ethers.formatEther(plannedCost), gasLimitCharged: charged.toString(), readBackBound: bound,
    verdicts: items.map((i) => ({ market_id: i.market_id, title: i.title, state: i.state, proposal: i.proposal, outcome: i.outcome ?? null, score: i.state === "settled" || kind === "respond" ? i.score : null,
      requestHash: i.requestHash, requestURI: i.requestURI, responseHash: i.responseHash ?? null, responseURI: i.responseURI ?? null, request: i.requestTx ?? null, response: i.responseTx ?? null, readBack: i.readBack ?? null })),
  }), null, 1) + "\n");
  console.log(`receipts -> ${path.relative(process.cwd(), out)} | read back bound ${bound}`);
}

// ================================================================ --send (the reviewed plan)
if (SEND) {
  if (!existsSync(PLAN_FILE)) throw new Error(`no plan file ${PLAN_FILE}: run the dry run first`);
  const plan = JSON.parse(readFileSync(PLAN_FILE, "utf8"));
  if (plan.chainId !== 143 || ethers.getAddress(plan.contract) !== CONTRACT || ethers.getAddress(plan.validator) !== VALIDATOR) throw new Error(`${PLAN_FILE} is not a plan for this mainnet contract / validator`);
  console.log(`plan ${path.relative(process.cwd(), PLAN_FILE)} (planned ${plan.plannedAt}, ${plan.markets.length} market(s))`);
  const items = [];
  for (const m of plan.markets) {
    const snap = JSON.parse(readFileSync(path.join(REC_DIR, `${m.market_id}.json`), "utf8"));
    const bad = await verifyAttestation(snap.attestation, m.market_id);
    if (bad) throw new Error(`${m.market_id}: ${bad}`);
    if (requestHashOf(snap.claim) !== m.requestHash || canon(buildClaim(JSON.parse(snap.attestation.canonical))) !== canon(snap.claim)) throw new Error(`${m.market_id}: claim does not match the snapshot`);
    if (m.state === "settled" && responseHashOf(snap.attestation) !== m.responseHash) throw new Error(`${m.market_id}: responseHash does not match the snapshot`);
    if ((await contract.getValidationStatus(m.requestHash)).lastUpdate !== 0n) { console.log(`${m.market_id}: request already on chain, skipped`); continue; }
    if (!(await published(m.requestURI, snap.attestation))) throw new Error(`${m.requestURI} is not published with the same bytes; push the records first`);
    const it = { ...m, att: snap.attestation, reqLimit: await estReq(m) };
    if (m.state === "settled") it.resLimit = await estRes(it);
    items.push(it);
  }
  const cost = items.reduce((s, i) => s + (i.reqLimit + (i.resLimit ?? 0n)) * MAX_FEE, 0n);
  const bal = await monad.getBalance(VALIDATOR);
  console.log(`=== SEND chain 143 | ${items.length} requests, ${items.filter((i) => i.resLimit).length} responses | worst-case ${fmt(cost)} | balance ${fmt(bal)}`);
  if (cost > MAX_MON) throw new Error("refusing: cost above --max-mon");
  if (cost > bal) throw new Error("refusing: balance below worst-case cost");
  const signer = loadSigner();
  await sendAll(signer, items, "request");
  const okSettled = items.filter((i) => i.state === "settled" && i.requestTx.status === 1);
  await sendAll(signer, okSettled, "response");
  const bound = await readBack(items);
  writeRun("live", items, bound, cost);
  process.exit(bound === okSettled.length && items.every((i) => i.requestTx.status === 1) ? 0 : 1);
}

// ================================================================ dry run: discover, verify, snapshot, plan
const ooI = new ethers.Interface(["event DisputePrice(address indexed requester, address indexed proposer, address indexed disputer, bytes32 identifier, uint256 timestamp, bytes ancillaryData, int256 proposedPrice)"]);
const adI = new ethers.Interface(["event QuestionResolved(bytes32 indexed questionID, int256 indexed settledPrice, uint256[] payouts)"]);
const head = await getBlock("latest");
const ref = await getBlock(head.number - 200000);
const secPerBlock = (head.timestamp - ref.timestamp) / 200000;
const byQ = new Map();
const skipped = [];
const skip = (q, why) => skipped.push({ market_id: q.gamma?.id ?? null, uma_question_id: q.qid, title: q.gamma?.title ?? null, reason: why });
const settledC = [], openC = [];
const gammaOf = (g) => ({ id: String(g.id), title: g.question, outcomes: JSON.parse(g.outcomes || "[]"), closed: g.closed, status: g.umaResolutionStatus, statuses: JSON.parse(g.umaResolutionStatuses || "[]") });
let fromBlock, settledSince;

if (!MARKETS) {
fromBlock = head.number - Math.ceil((SCAN_DAYS * 86400) / secPerBlock);
settledSince = head.timestamp - DAYS * 86400;
const settledFromBlock = head.number - Math.ceil(((DAYS + 1) * 86400) / secPerBlock);
console.log(`Polygon head ${head.number} (${iso(head.timestamp)}), scanning disputes from block ${fromBlock} (~${SCAN_DAYS} d), settled window ${DAYS} d (since ${iso(settledSince)})`);

const disputeLogs = await logs({ address: OO, topics: [ooI.getEvent("DisputePrice").topicHash] }, fromBlock, head.number);
for (const l of disputeLogs) {
  const p = ooI.parseLog(l);
  const qid = ethers.keccak256(p.args.ancillaryData);
  const q = byQ.get(qid) ?? { qid, adapter: p.args.requester.toLowerCase(), disputes: [] };
  q.disputes.push({ tx: l.transactionHash.toLowerCase(), block: Number(l.blockNumber), logIndex: Number(l.logIndex), price: p.args.proposedPrice });
  byQ.set(qid, q);
}
for (const q of byQ.values()) q.disputes.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
const adapters = [...new Set([...byQ.values()].map((q) => q.adapter))];
const qids = [...byQ.keys()];
for (let i = 0; i < qids.length; i += 500) {
  for (const l of await logs({ address: adapters, topics: [adI.getEvent("QuestionResolved").topicHash, qids.slice(i, i + 500)] }, settledFromBlock, head.number)) {
    const p = adI.parseLog(l);
    const q = byQ.get(p.args.questionID);
    if (q && l.address.toLowerCase() === q.adapter) q.resolved = { block: Number(l.blockNumber), price: p.args.settledPrice, tx: l.transactionHash };
  }
}
const tsCache = new Map();
for (const q of byQ.values()) if (q.resolved) { const b = q.resolved.block; if (!tsCache.has(b)) tsCache.set(b, (await getBlock(b)).timestamp); q.resolved.time = tsCache.get(b); }
console.log(`disputes on chain (last rpc ${POLYGON_RPCS[rpcIdx][0]}): ${disputeLogs.length} DisputePrice logs, ${byQ.size} questions, adapters ${adapters.join(", ")}; resolved since scan start ${[...byQ.values()].filter((q) => q.resolved).length}`);

// Gamma: market id, labels, status
async function gamma(ids, closed) {
  const qs = ids.map((x) => `question_ids=${x}`).join("&");
  for (let a = 0; a < 4; a++) { const r = await fetch(`${GAMMA}/markets?${qs}&closed=${closed}&limit=100`).catch(() => null); if (r?.ok) return r.json(); await sleep(2000); }
  return [];
}
for (let i = 0; i < qids.length; i += 20) {
  const chunk = qids.slice(i, i + 20);
  for (const g of [...(await gamma(chunk, false)), ...(await gamma(chunk, true))]) {
    const q = byQ.get(String(g.questionID).toLowerCase()) ?? byQ.get(g.questionID);
    if (q) q.gamma = gammaOf(g);
  }
}

for (const q of byQ.values()) {
  if (q.resolved) { if (q.resolved.time >= settledSince) settledC.push(q); continue; }
  if (!q.gamma) { skip(q, "open on chain but not found in Gamma"); continue; }
  if (q.gamma.status === "disputed") openC.push(q);
}
for (const q of settledC) if (!q.gamma) skip(q, "settled on chain but not found in Gamma");
settledC.sort((a, b) => b.resolved.time - a.resolved.time);
openC.sort((a, b) => b.disputes.at(-1).block - a.disputes.at(-1).block); // most recent disputes first
console.log(`candidates: settled in window ${settledC.length}, open per Gamma ${openC.length}`);
} else {
// ---------------------------------------------------------------- --markets: explicit list, any age
// first block with timestamp >= t (interpolation + bisection on Polygon headers)
async function blockAt(t) {
  let lo = { number: 1, timestamp: 0 }, hi = head;
  if (t >= head.timestamp) return head.number;
  let guess = Math.max(1, head.number - Math.ceil((head.timestamp - t) / secPerBlock));
  for (let i = 0; i < 40 && hi.number - lo.number > 1; i++) {
    const b = await getBlock(Math.min(hi.number - 1, Math.max(lo.number + 1, guess)));
    if (b.timestamp >= t) hi = b; else lo = b;
    const span = hi.number - lo.number;
    guess = i < 4 && lo.timestamp > 0 ? lo.number + Math.round((t - lo.timestamp) / Math.max(1e-9, (hi.timestamp - lo.timestamp) / span)) : lo.number + Math.floor(span / 2);
  }
  return hi.number;
}
const DisputeTopic = ooI.getEvent("DisputePrice").topicHash, ResolvedTopic = adI.getEvent("QuestionResolved").topicHash;
fromBlock = Infinity;
console.log(`Polygon head ${head.number} (${iso(head.timestamp)}), explicit markets: ${MARKETS.join(", ")} (no recency window)`);
for (const id of MARKETS) {
  let g = null;
  for (let a = 0; a < 4 && !g; a++) { const r = await fetch(`${GAMMA}/markets/${id}`).catch(() => null); if (r?.ok) g = await r.json(); else if (r?.status === 404) break; else await sleep(2000); }
  if (!g?.questionID) { skip({ gamma: { id }, qid: null }, "market not found in Gamma (or no UMA question id)"); continue; }
  const q = { qid: String(g.questionID).toLowerCase(), adapter: String(g.resolvedBy || "").toLowerCase(), disputes: [], gamma: gammaOf(g) };
  if (!/^0x[0-9a-f]{40}$/.test(q.adapter)) { skip(q, `Gamma resolvedBy is not an adapter address (${g.resolvedBy})`); continue; }
  // the signed record names the dispute txs; their receipts pin the dispute blocks
  const att = await fetchRecord(id);
  if (att?.error || !att) { skip(q, att?.error ?? "no attestation"); continue; }
  q.att = att;
  const rec = JSON.parse(att.canonical);
  const recTxs = (rec.disputes ?? []).map((d) => String(d.tx).toLowerCase());
  let firstBlock = Infinity, badTx = null;
  for (const tx of recTxs) {
    const r = await pg("eth_getTransactionReceipt", [tx]);
    const hit = (r?.logs ?? []).find((l) => l.address.toLowerCase() === OO && l.topics[0] === DisputeTopic && ethers.keccak256(ooI.parseLog(l).args.ancillaryData) === q.qid);
    if (!hit) { badTx = tx; break; }
    firstBlock = Math.min(firstBlock, Number(r.blockNumber));
  }
  if (badTx) { skip(q, `record and chain disagree: record dispute tx ${badTx} has no DisputePrice for this question on chain`); continue; }
  // QuestionResolved: scan forward from the first dispute, stop at the first hit
  const startRes = Number.isFinite(firstBlock) ? firstBlock : await blockAt(Date.parse(g.createdAt) / 1000 - 2 * 86400);
  for (let a = startRes; a <= head.number && !q.resolved; a += 500000) {
    const l = (await logs({ address: q.adapter, topics: [ResolvedTopic, q.qid] }, a, Math.min(a + 499999, head.number)))[0];
    if (l) { const p = adI.parseLog(l); q.resolved = { block: Number(l.blockNumber), price: p.args.settledPrice, tx: l.transactionHash, time: (await getBlock(Number(l.blockNumber))).timestamp }; }
  }
  // every DisputePrice for this question by its adapter, from market creation (- 2 d) to resolution (or head)
  const from = Math.min(await blockAt(Date.parse(g.createdAt) / 1000 - 2 * 86400), Number.isFinite(firstBlock) ? firstBlock : Infinity);
  q.scanFromBlock = from;
  fromBlock = Math.min(fromBlock, from);
  const to = q.resolved?.block ?? head.number;
  for (const l of await logs({ address: OO, topics: [DisputeTopic, ethers.zeroPadValue(q.adapter, 32)] }, from, to)) {
    const p = ooI.parseLog(l);
    if (ethers.keccak256(p.args.ancillaryData) !== q.qid) continue;
    q.disputes.push({ tx: l.transactionHash.toLowerCase(), block: Number(l.blockNumber), logIndex: Number(l.logIndex), price: p.args.proposedPrice });
  }
  q.disputes.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
  byQ.set(q.qid, q);
  console.log(`  ${id.padEnd(9)} q ${q.qid.slice(0, 12)}.. adapter ${q.adapter.slice(0, 10)}.. disputes on chain ${q.disputes.length} (blocks ${from}-${to}), ${q.resolved ? `resolved block ${q.resolved.block} ${iso(q.resolved.time)}` : "not resolved on chain"}`);
  if (!q.disputes.length) { skip(q, "no DisputePrice on chain for this question"); continue; }
  if (q.resolved) settledC.push(q);
  else if (q.gamma.status === "disputed") openC.push(q);
  else skip(q, `not resolved on chain and Gamma status is ${q.gamma.status}, not disputed`);
}
if (!Number.isFinite(fromBlock)) fromBlock = head.number;
console.log(`candidates: settled ${settledC.length}, open per Gamma ${openC.length}`);
}

// verify + cross-check one market against the chain
function crossCheck(q, p, state) {
  if (p.uma_question_id?.toLowerCase() !== q.qid) return `record question ${p.uma_question_id} != chain ${q.qid}`;
  if (p.adapter && p.adapter.toLowerCase() !== q.adapter) return `record adapter ${p.adapter} != chain ${q.adapter}`;
  const recTx = new Set((p.disputes ?? []).map((d) => String(d.tx).toLowerCase()));
  if (!p.disputes?.length || Number(p.dispute_count) === 0) return `record dispute_count ${p.dispute_count} but chain has ${q.disputes.length} dispute(s)`;
  if (Number(p.dispute_count) !== p.disputes.length) return `record dispute_count ${p.dispute_count} != disputes listed ${p.disputes.length}`;
  const missing = q.disputes.filter((d) => !recTx.has(d.tx));
  if (missing.length) return `record misses ${missing.length} chain dispute tx(s), e.g. ${missing[0].tx}`;
  const first = p.disputes[0];
  if (!first.disputed_proposal) return "record has no disputed proposal";
  if (String(first.tx).toLowerCase() === q.disputes[0].tx) {
    const lbl = priceLabel(q.disputes[0].price, q.gamma.outcomes);
    if (lbl !== first.disputed_proposal) return `first disputed proposal: record ${first.disputed_proposal} vs chain ${lbl}`;
  }
  if (!q.gamma.statuses.includes("disputed")) return "Gamma umaResolutionStatuses has no 'disputed'";
  if (state === "settled") {
    if (!p.resolved_on_chain || !p.onchain_resolution?.outcome) return `chain resolved, record says ${p.uma_state}`;
    const lbl = priceLabel(q.resolved.price, q.gamma.outcomes);
    if (lbl !== p.onchain_resolution.outcome) return `outcome: record ${p.onchain_resolution.outcome} vs chain ${lbl}`;
  } else {
    if (p.resolved_on_chain) return "record says resolved, chain has no QuestionResolved";
    if (STRICT_OPEN && !p.open_dispute) return `record open_dispute false (${p.uma_state})`;
  }
  return null;
}

const vBal = await monad.getBalance(VALIDATOR);
const selected = [];
let planned = 0n;
const already = [];
async function consider(q, state) {
  if (selected.length >= MAX_MARKETS) return "full";
  const id = q.gamma.id;
  const file = path.join(REC_DIR, `${id}.json`);
  let snap = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  // a snapshot is frozen once its request is on chain; otherwise refresh it when the state moved
  if (snap) {
    const on = (await contract.getValidationStatus(requestHashOf(snap.claim))).lastUpdate !== 0n;
    const snapResolved = !!JSON.parse(snap.attestation.canonical).resolved_on_chain;
    if (on) { already.push({ market_id: id, state, requestHash: requestHashOf(snap.claim) }); return "on-chain"; }
    if (snapResolved !== (state === "settled")) snap = null;
  }
  let att = snap?.attestation ?? q.att;
  if (!att) {
    att = await fetchRecord(id);
    if (att?.error || !att) { skip(q, att?.error ?? "no attestation"); return "skip"; }
  }
  const bad = await verifyAttestation(att, id);
  if (bad) { skip(q, bad); return "skip"; }
  const p = JSON.parse(att.canonical);
  const why = crossCheck(q, p, state);
  if (why) { skip(q, `record and chain disagree: ${why}`); return "skip"; }
  const claim = buildClaim(p);
  const v = { market_id: id, title: q.gamma.title, state, adapter: q.adapter, uma_question_id: q.qid, outcomes: q.gamma.outcomes, scanFromBlock: q.scanFromBlock ?? fromBlock,
    first_dispute_utc: p.disputes[0].disputed_at, dispute_count: Number(p.dispute_count), proposal: claim.proposal,
    uma_state: p.uma_state, open_dispute: !!p.open_dispute,
    outcome: state === "settled" ? p.onchain_resolution.outcome : null, resolved_utc: q.resolved ? iso(q.resolved.time) : null,
    requestHash: requestHashOf(claim), requestURI: reqURI(id) };
  if (state === "settled") Object.assign(v, { score: v.outcome === v.proposal ? 100 : 0, responseURI: resURI(id, false), responseHash: responseHashOf(att) });
  else Object.assign(v, { score: 100, responseURI: resURI(id, true), responseHash: ethers.id(`placeholder:${id}`) }); // only for the reserve estimate
  if ((await contract.getValidationStatus(v.requestHash)).lastUpdate !== 0n) { already.push({ market_id: id, state, requestHash: v.requestHash }); return "on-chain"; }
  v.reqLimit = await estReq(v);
  v.resLimit = await estRes(v);
  const now = v.reqLimit * MAX_FEE + (state === "settled" ? v.resLimit * MAX_FEE : 0n);
  if (planned + now > BUDGET) return "budget";
  planned += now;
  if (state === "open") { v.deferredResLimit = v.resLimit; delete v.resLimit; delete v.score; delete v.responseHash; delete v.responseURI; }
  if (!snap) writeFileSync(file, JSON.stringify({ source_url: `${API}/v1/settlement-risk/${id}`, fetched_at: new Date().toISOString(), claim, attestation: att }, null, 2) + "\n");
  v.published = await published(v.requestURI, att);
  selected.push(v);
  return "ok";
}
let stop = false;
let nOpen = 0;
for (const q of openC) { if (nOpen >= MAX_OPEN) break; const r = await consider(q, "open"); if (r === "ok") nOpen++; if (r === "full" || r === "budget") { stop = true; break; } }
let outOfBudget = 0;
for (const q of settledC) {
  if (!q.gamma) continue;
  if (stop) { outOfBudget++; continue; }
  const r = await consider(q, "settled");
  if (r === "full" || r === "budget") { stop = true; outOfBudget++; }
}

// ---------------------------------------------------------------- report
const sum = (xs) => xs.reduce((s, x) => s + x, 0n);
const reqGas = sum(selected.map((v) => v.reqLimit));
const resGas = sum(selected.filter((v) => v.resLimit).map((v) => v.resLimit));
const laterGas = sum(selected.filter((v) => v.deferredResLimit).map((v) => v.deferredResLimit));
const costNow = (reqGas + resGas) * MAX_FEE, costLater = laterGas * MAX_FEE, total = costNow + costLater;
console.log(`\n=== Monad mainnet (143) DRY RUN, nothing sent | PredgeAgentValidator ${CONTRACT} | validator ${VALIDATOR} ${fmt(vBal)}`);
console.log(`base fee ${ethers.formatUnits(block.baseFeePerGas, "gwei")} gwei, tip ${ethers.formatUnits(TIP, "gwei")} gwei, maxFeePerGas ${ethers.formatUnits(MAX_FEE, "gwei")} gwei (worst case = gas limit x maxFeePerGas)\n`);
const line = (v) => `${v.market_id.padEnd(9)} ${v.state.padEnd(7)} ${(v.title ?? "").slice(0, 58).padEnd(58)} | proposal ${String(v.proposal).padEnd(10)} | ${v.state === "settled" ? `outcome ${String(v.outcome).padEnd(10)} => ${String(v.score).padStart(3)}` : `pending (${String(v.uma_state).padEnd(9)}) => request only`} | req ${v.reqLimit} ${v.resLimit ? `res ${v.resLimit}` : `(later res ${v.deferredResLimit})`}`;
console.log("OPEN disputes (validationRequest now, response via --respond after settlement):");
for (const v of selected.filter((x) => x.state === "open")) console.log("  " + line(v));
console.log(`SETTLED${MARKETS ? "" : ` in the last ${DAYS} d`} (validationRequest + validationResponse now):`);
for (const v of selected.filter((x) => x.state === "settled")) console.log("  " + line(v) + `  resolved ${v.resolved_utc}`);
const settled = selected.filter((v) => v.state === "settled");
console.log(`\nmarkets ${selected.length}: open ${selected.length - settled.length}, settled ${settled.length} (score 100: ${settled.filter((v) => v.score === 100).length}, score 0: ${settled.filter((v) => v.score === 0).length})`);
console.log(`transactions now ${selected.length + settled.length} (gas limit ${reqGas + resGas}) -> worst case ${fmt(costNow)}`);
console.log(`deferred responses ${selected.length - settled.length} (gas limit ${laterGas}) -> worst case ${fmt(costLater)}`);
console.log(`THIS RUN worst case ${fmt(costNow)} (cap ${fmt(MAX_MON)}, balance ${fmt(vBal)}); with the later --respond run ${fmt(total)}`);
console.log(`records published at raw.githubusercontent.com (main): ${selected.filter((v) => v.published).length}/${selected.length}`);
if (outOfBudget) console.log(`not selected for budget: ${outOfBudget} more settled candidate(s)`);
if (already.length) console.log(`already requested on chain (skipped): ${already.map((a) => a.market_id).join(", ")}`);
console.log(`\nSKIPPED ${skipped.length}:`);
const noGamma = skipped.filter((s) => !s.market_id);
const ad = (qid) => byQ.get(qid)?.adapter.slice(0, 10);
const grp = {};
for (const s of noGamma) { const k = `${s.reason} (adapter ${ad(s.uma_question_id)})`; grp[k] = (grp[k] || 0) + 1; }
for (const [k, n] of Object.entries(grp)) console.log(`  ${String(n).padStart(3)} x ${k}: Gamma has no market for this UMA question id (neg-risk questions carry a different Gamma questionID), so no signed record can be fetched`);
for (const s of skipped.filter((x) => x.market_id)) console.log(`  ${String(s.market_id).padEnd(9)} ${(s.title ?? "").slice(0, 50).padEnd(50)} ${s.reason}`);

writeFileSync(PLAN_FILE, JSON.stringify(ser({ plannedAt: new Date().toISOString(), selection: MARKETS ? { markets: MARKETS } : { days: DAYS, scanDays: SCAN_DAYS }, chainId: 143, contract: CONTRACT, validator: VALIDATOR, tag: TAG, maxFeeGwei: ethers.formatUnits(MAX_FEE, "gwei"),
  worstCaseMON: { now: ethers.formatEther(costNow), deferred: ethers.formatEther(costLater), total: ethers.formatEther(total) },
  markets: selected.map(({ published: _p, ...v }) => v), skipped, alreadyOnChain: already }), null, 1) + "\n");
console.log(`plan -> ${path.relative(process.cwd(), PLAN_FILE)}`);
if (costNow > MAX_MON) { console.error(`REFUSING: worst-case ${fmt(costNow)} > ${fmt(MAX_MON)}`); process.exit(1); }
if (total > vBal) { console.error("REFUSING: balance below worst-case cost"); process.exit(1); }
console.log(`DRY RUN OK. To send after review: push records/, then CONFIRM_MAINNET=yes node monad/mainnet/live-verdicts.mjs --send --plan ${path.relative(process.cwd(), PLAN_FILE)}`);
