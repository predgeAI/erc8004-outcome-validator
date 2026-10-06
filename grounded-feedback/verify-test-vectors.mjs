#!/usr/bin/env node
// Standalone verifier for the x402-grounded-feedback-v0 and oracle-outcome-validation-v0 test vectors.
//
//   node grounded-feedback/verify-test-vectors.mjs [--onchain] [vector.json ...]
//
// --onchain re-reads every oracle reference of the oracle-outcome vectors over Polygon RPC
// (RPC_URL, default https://polygon.gateway.tenderly.co): block hash, the state-changing
// transaction's logs, OO.getState and ConditionalTokens payouts at the read block. A failed re-read
// gets a reason code: settled_not_resolved when the request is SETTLED or RESOLVED but payoutDenominator is
// still 0 (no record is valid there), onchain_mismatch otherwise. Without it the
// verifier makes no network call, and for vectors whose verdict depends on chain state it checks
// `acceptOffline` instead of `accept`.
//
// Written from README.md, not from the generator: it does not import make-test-vectors.mjs or
// src/attest.mjs, and the canonicalization below is its own. It reads the vector files and the
// vendored registry ABI, uses node:crypto for ed25519 and sha256 and ethers for keccak256 and ABI
// decoding, and makes no network call unless --onchain is given.
//
// Every vector carries an `expect` block; a vector passes when each check comes out as expected,
// including the negative vector, whose checks are expected to fail. Exit 0 = all vectors pass.
import crypto from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const here = dirname(fileURLToPath(import.meta.url));
const iface = new ethers.Interface(JSON.parse(readFileSync(join(here, "../abi/ValidationRegistry.json"), "utf8")));
const dir = join(here, "test-vectors");
const args = process.argv.slice(2);
const ONCHAIN = args.includes("--onchain");
const dirFiles = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => join(dir, f));
const named = args.filter((a) => a !== "--onchain");
const files = named.length ? named : dirFiles;

// Canonical JSON: object keys sorted by UTF-16 code units at every level (what sort() does with
// no comparator), arrays in order, no whitespace, JSON string escaping, undefined keys dropped.
function canonicalize(v) {
  if (Array.isArray(v)) return "[" + v.map(canonicalize).join(",") + "]";
  if (v !== null && typeof v === "object") {
    return "{" + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + canonicalize(v[k])).join(",") + "}";
  }
  if (typeof v === "number" && !Number.isSafeInteger(v)) throw new Error("only safe integers are canonicalized here");
  return JSON.stringify(v);
}

const ADDR = /^0x[0-9a-f]{40}$/;
const H32 = /^0x[0-9a-f]{64}$/;
const DEC = /^(0|[1-9][0-9]{0,77})$/;
const CAIP19 = /^eip155:([1-9][0-9]*)\/erc20:(0x[0-9a-f]{40})$/;
const REGISTRY = /^eip155:[1-9][0-9]*:0x[0-9a-f]{40}$/;
const GROUNDING = ["x402-settlement", "escrow-release", "settlement-contract"];
// capacity-attest's unit table: which `measured.unit` each `assetType` allows.
const UNITS = { "gpu-hours": ["gpu-second"], storage: ["byte", "byte-second"], bandwidth: ["byte"], "api-credits": ["call", "token", "credit"] };
const KEYS = {
  common: ["scheme", "grounding", "payer", "payee", "ratee", "amount", "asset", "resource", "nonce", "settlementTx"],
  optional: ["requirementsHash", "issuedAt", "assetType", "measured"],
  "escrow-release": ["escrow"],
};

// Field rules from README.md "Record fields". Returns a list of problems.
function schemaProblems(r) {
  const p = [];
  const allowed = new Set([...KEYS.common, ...KEYS.optional, ...(KEYS[r.grounding] || [])]);
  for (const k of Object.keys(r)) if (!allowed.has(k)) p.push(`unknown key ${k}`);
  for (const k of [...KEYS.common, ...(KEYS[r.grounding] || [])]) if (r[k] === undefined) p.push(`missing ${k}`);
  if (r.scheme !== "x402-grounded-feedback-v0") p.push("scheme");
  if (!GROUNDING.includes(r.grounding)) p.push("grounding");
  for (const k of ["payer", "payee", "escrow"]) if (r[k] !== undefined && !ADDR.test(r[k])) p.push(`${k} not a lower-case address`);
  for (const k of ["nonce", "settlementTx", "requirementsHash"]) if (r[k] !== undefined && !H32.test(r[k])) p.push(`${k} not 0x + 64 lower-case hex`);
  if (!DEC.test(r.amount ?? "")) p.push("amount not a canonical decimal string");
  if (!CAIP19.test(r.asset ?? "")) p.push("asset not CAIP-19 eip155 erc20");
  if (typeof r.resource !== "string" || !r.resource) p.push("resource");
  const rt = r.ratee;
  if (!rt || typeof rt !== "object" || Object.keys(rt).sort().join() !== "agentId,agentRegistry") p.push("ratee must be {agentRegistry, agentId}");
  else {
    if (!REGISTRY.test(rt.agentRegistry)) p.push("ratee.agentRegistry");
    if (!DEC.test(rt.agentId)) p.push("ratee.agentId");
  }
  if (r.issuedAt !== undefined && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.issuedAt)) p.push("issuedAt not YYYY-MM-DDTHH:MM:SS.sssZ");
  if ((r.assetType === undefined) !== (r.measured === undefined)) p.push("assetType and measured come together");
  if (r.measured !== undefined) {
    if (r.issuedAt === undefined) p.push("measured needs issuedAt");
    if (r.assetType !== undefined && !(r.assetType in UNITS)) p.push("assetType");
    else if (r.assetType !== undefined && !UNITS[r.assetType].includes(r.measured.unit)) p.push(`measured.unit ${r.measured.unit} not allowed for assetType ${r.assetType}`);
    const end = r.measured.period?.end;
    if (typeof end !== "string" || typeof r.issuedAt !== "string" || end.slice(0, 19) > r.issuedAt.slice(0, 19)) p.push("measured.period.end later than issuedAt");
  }
  (function strings(v, path) {
    if (v !== null && typeof v === "object") for (const [k, x] of Object.entries(v)) strings(x, `${path}.${k}`);
    else if (typeof v !== "string") p.push(`${path} is not a string`);
  })(r, "record");
  return p;
}

function ed25519Verify(message, publicKeyHex, signatureHex) {
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKeyHex, "hex")]);
  const key = crypto.createPublicKey({ key: spki, format: "der", type: "spki" });
  return crypto.verify(null, message, key, Buffer.from(signatureHex, "hex"));
}

// Sanity check of the ed25519 implementation against RFC 8032 section 7.1 TEST 1 (empty message).
const rfcOk = ed25519Verify(
  Buffer.alloc(0),
  "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
  "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
);
console.log(`${rfcOk ? "ok  " : "FAIL"} RFC 8032 TEST 1 signature verifies`);
let failed = !rfcOk;

// ---- oracle-outcome-validation-v0 (oracle-outcome.md) -----------------------------------------
const ORACLE_KEYS = ["scheme", "requestHash", "ratee", "subject", "claimedOutcome", "observedOutcome", "score", "outcomeState", "oracle", "issuedAt"];
const ORACLE_REF_KEYS = ["kind", "chainId", "oracle", "requester", "conditionalTokens", "questionId", "identifier", "requestTimestamp", "price", "readBlock", "readBlockHash", "stateTx"];
const STATES = ["proposed", "disputed", "final"];
// UMA YES_OR_NO_QUERY with Polymarket's res_data "p1: 0, p2: 1, p3: 0.5. Where p1 corresponds to No, p2 to Yes".
const PRICE_LABEL = { "0": "No", "1000000000000000000": "Yes", "500000000000000000": "Unknown" };
const RES_DATA = "res_data: p1: 0, p2: 1, p3: 0.5. Where p1 corresponds to No, p2 to Yes, p3 to unknown/50-50.";
const INT = /^(0|-?[1-9][0-9]{0,77})$/;

function oracleSchemaProblems(r, ancillaryData) {
  const p = [];
  for (const k of Object.keys(r)) if (![...ORACLE_KEYS, "supersedes"].includes(k)) p.push(`unknown key ${k}`);
  for (const k of ORACLE_KEYS) if (r[k] === undefined) p.push(`missing ${k}`);
  if (r.scheme !== "oracle-outcome-validation-v0") p.push("scheme");
  if (!H32.test(r.requestHash ?? "")) p.push("requestHash");
  if (r.supersedes !== undefined && !H32.test(r.supersedes)) p.push("supersedes not 0x + 64 lower-case hex");
  const rt = r.ratee;
  if (!rt || typeof rt !== "object" || Object.keys(rt).sort().join() !== "agentId,agentRegistry" || !REGISTRY.test(rt.agentRegistry) || !DEC.test(rt.agentId)) p.push("ratee");
  const s = r.subject;
  if (!s || typeof s !== "object" || Object.keys(s).sort().join() !== "conditionId,marketId,venue" || s.venue !== "polymarket" || !DEC.test(s.marketId) || !H32.test(s.conditionId)) p.push("subject");
  if (!STATES.includes(r.outcomeState)) p.push("outcomeState not proposed | disputed | final");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.issuedAt ?? "")) p.push("issuedAt not YYYY-MM-DDTHH:MM:SS.sssZ");
  const o = r.oracle;
  if (!o || typeof o !== "object") p.push("oracle");
  else {
    for (const k of Object.keys(o)) if (!ORACLE_REF_KEYS.includes(k)) p.push(`unknown key oracle.${k}`);
    for (const k of ORACLE_REF_KEYS) if (o[k] === undefined) p.push(`missing oracle.${k}`);
    if (o.kind !== "uma-ctf-adapter") p.push("oracle.kind");
    if (o.identifier !== "YES_OR_NO_QUERY") p.push("oracle.identifier");
    for (const k of ["oracle", "requester", "conditionalTokens"]) if (!ADDR.test(o[k] ?? "")) p.push(`oracle.${k} not a lower-case address`);
    for (const k of ["questionId", "readBlockHash", "stateTx"]) if (!H32.test(o[k] ?? "")) p.push(`oracle.${k} not 0x + 64 lower-case hex`);
    for (const k of ["chainId", "requestTimestamp", "readBlock"]) if (!DEC.test(o[k] ?? "")) p.push(`oracle.${k} not a canonical decimal`);
    if (!INT.test(o.price ?? "")) p.push("oracle.price not a canonical integer");
    if (PRICE_LABEL[o.price] !== r.observedOutcome) p.push(`observedOutcome ${r.observedOutcome} is not the label of price ${o.price}`);
    if (s && o.requester && o.questionId && ADDR.test(o.requester) && H32.test(o.questionId) &&
        ethers.solidityPackedKeccak256(["address", "bytes32", "uint256"], [o.requester, o.questionId, 2]) !== s.conditionId) p.push("subject.conditionId != keccak256(requester ++ questionId ++ uint256(2))");
    if (ancillaryData !== undefined) {
      if (ethers.keccak256(ancillaryData) !== o.questionId) p.push("keccak256(ancillaryData) != oracle.questionId");
      else if (!ethers.toUtf8String(ancillaryData).includes(RES_DATA)) p.push("ancillaryData does not carry the YES_OR_NO res_data mapping");
    }
  }
  if (typeof r.claimedOutcome !== "string" || !r.claimedOutcome) p.push("claimedOutcome");
  if (r.score !== (r.claimedOutcome === r.observedOutcome ? "100" : "0")) p.push("score must be 100 when observedOutcome equals claimedOutcome, else 0");
  (function strings(v, path) {
    if (v !== null && typeof v === "object") for (const [k, x] of Object.entries(v)) strings(x, `${path}.${k}`);
    else if (typeof v !== "string") p.push(`${path} is not a string`);
  })(r, "record");
  return p;
}

// Every record in the vector directory (plus any named file) whose own bytes check out, by responseHash.
function selfConsistent(v) {
  const bytes = Buffer.from(canonicalize(v.envelope.payload), "utf8");
  return bytes.toString("utf8") === v.envelope.canonical && ed25519Verify(bytes, v.envelope.public_key, v.envelope.signature) && ethers.keccak256(bytes) === v.responseHash;
}
const known = new Map();
for (const f of [...new Set([...dirFiles, ...files])]) {
  const v = JSON.parse(readFileSync(f, "utf8"));
  if (selfConsistent(v)) known.set(v.responseHash, v.envelope.payload);
}

// supersedes rules (oracle-outcome.md "Superseding"). Returns a list of problems.
function supersedeProblems(r, ownHash) {
  const p = [];
  const sameRequest = (x) => x.scheme === r.scheme && x.requestHash === r.requestHash && canonicalize(x.ratee) === canonicalize(r.ratee) &&
    canonicalize(x.subject) === canonicalize(r.subject) && x.claimedOutcome === r.claimedOutcome;
  if (r.supersedes !== undefined) {
    const prior = known.get(r.supersedes);
    if (r.supersedes === ownHash) p.push("supersedes names the record itself");
    else if (!prior) p.push("supersedes names no known record");
    else {
      if (!sameRequest(prior)) p.push("superseded record is for a different request, agent, market or claim");
      if (prior.outcomeState === "final") p.push("a final record is never superseded");
      if (prior.oracle && BigInt(prior.oracle.readBlock) >= BigInt(r.oracle.readBlock)) p.push("superseded record was not read at an earlier block");
      if (!(prior.issuedAt < r.issuedAt)) p.push("superseded record was not issued earlier");
    }
  } else if (r.outcomeState === "final") {
    for (const [h, x] of known) if (h !== ownHash && sameRequest(x) && x.issuedAt < r.issuedAt) { p.push(`final record leaves earlier record ${h} unsuperseded`); break; }
  }
  return p;
}

// ---- --onchain: re-read the oracle reference over Polygon RPC --------------------------------
const OO_STATE = ["INVALID", "REQUESTED", "PROPOSED", "EXPIRED", "DISPUTED", "RESOLVED", "SETTLED"];
const WANT_STATE = { proposed: ["PROPOSED"], disputed: ["DISPUTED"], final: ["RESOLVED", "SETTLED"] };
const chainIface = new ethers.Interface([
  "event ProposePrice(address indexed requester, address indexed proposer, bytes32 identifier, uint256 timestamp, bytes ancillaryData, int256 proposedPrice, uint256 expirationTimestamp, address currency)",
  "event DisputePrice(address indexed requester, address indexed proposer, address indexed disputer, bytes32 identifier, uint256 timestamp, bytes ancillaryData, int256 proposedPrice)",
  "event QuestionResolved(bytes32 indexed questionID, int256 indexed settledPrice, uint256[] payouts)",
  "event ConditionResolution(bytes32 indexed conditionId, address indexed oracle, bytes32 indexed questionId, uint256 outcomeSlotCount, uint256[] payoutNumerators)",
  "function getState(address requester, bytes32 identifier, uint256 timestamp, bytes ancillaryData) view returns (uint8)",
  "function payoutDenominator(bytes32) view returns (uint256)",
  "function payoutNumerators(bytes32, uint256) view returns (uint256)",
]);
const PAYOUT_LABEL = { "1,0": "Yes", "0,1": "No", "1,1": "Unknown" };
// Reason codes for a failed on-chain re-read: settled_not_resolved for a record read after the
// request settled (or resolved) but before the adapter's resolve, onchain_mismatch for anything else.
const SETTLED_NOT_RESOLVED = "settled_not_resolved";
const rpcCache = new Map();
let provider;
async function rpc(method, params) {
  const key = method + JSON.stringify(params);
  if (!rpcCache.has(key)) rpcCache.set(key, provider.send(method, params));
  return rpcCache.get(key);
}
async function onchainProblems(r, ancillaryData) {
  provider ??= new ethers.JsonRpcProvider(process.env.RPC_URL || "https://polygon.gateway.tenderly.co", 137, { staticNetwork: true });
  const o = r.oracle, p = [];
  if (o.chainId !== "137") return { reason: "onchain_mismatch", problems: [`chain ${o.chainId} is not Polygon`] };
  if (ancillaryData === undefined || ethers.keccak256(ancillaryData) !== o.questionId) return { reason: "onchain_mismatch", problems: ["ancillaryData for the getState call is missing or does not hash to questionId"] };
  const blockTag = ethers.toQuantity(BigInt(o.readBlock));
  const block = await rpc("eth_getBlockByNumber", [blockTag, false]);
  if (block?.hash !== o.readBlockHash) p.push(`readBlockHash: chain has ${block?.hash}`);
  const call = async (to, fn, a) => chainIface.decodeFunctionResult(fn, await rpc("eth_call", [{ to, data: chainIface.encodeFunctionData(fn, a) }, blockTag]))[0];
  const state = OO_STATE[Number(await call(o.oracle, "getState", [o.requester, ethers.encodeBytes32String(o.identifier), o.requestTimestamp, ancillaryData]))];
  const den = await call(o.conditionalTokens, "payoutDenominator", [r.subject.conditionId]);
  // Settled, not yet resolved (oracle-outcome.md rule 2): the request is SETTLED (or RESOLVED) but the
  // adapter has not resolved the condition; the ERC-8404 profile's SETTLED_UNRESOLVED. No record is valid at such a block, whatever its outcomeState, so
  // this is its own reason rather than a state mismatch.
  if ((state === "SETTLED" || state === "RESOLVED") && den === 0n) {
    p.push(`${SETTLED_NOT_RESOLVED}: getState at ${o.readBlock} is ${state} and payoutDenominator is 0; a validator writes no record until the adapter resolves the condition`);
    return { reason: SETTLED_NOT_RESOLVED, problems: p };
  }
  if (!WANT_STATE[r.outcomeState].includes(state)) p.push(`getState at ${o.readBlock} is ${state}, not ${r.outcomeState}`);
  const nums = [String(await call(o.conditionalTokens, "payoutNumerators", [r.subject.conditionId, 0])), String(await call(o.conditionalTokens, "payoutNumerators", [r.subject.conditionId, 1]))];
  if (r.outcomeState === "final") {
    if (den === 0n) p.push(`payoutDenominator is 0 at ${o.readBlock}: not resolved`);
    else if (PAYOUT_LABEL[nums.join()] !== r.observedOutcome) p.push(`payouts ${nums} at ${o.readBlock} are not ${r.observedOutcome}`);
  } else if (den !== 0n) p.push(`condition already resolved at ${o.readBlock}, so the state is final, not ${r.outcomeState}`);
  const rc = await rpc("eth_getTransactionReceipt", [o.stateTx]);
  if (!rc || rc.status !== "0x1") p.push("stateTx missing or reverted");
  else {
    if (BigInt(rc.blockNumber) > BigInt(o.readBlock)) p.push("stateTx is later than readBlock");
    const parsed = rc.logs.map((l) => { try { return { l, e: chainIface.parseLog(l) }; } catch { return null; } }).filter(Boolean);
    const at = (addr) => parsed.filter((x) => x.l.address.toLowerCase() === addr);
    if (r.outcomeState === "final") {
      const cr = at(o.conditionalTokens).find((x) => x.e.name === "ConditionResolution" && x.e.args.conditionId === r.subject.conditionId && x.e.args.oracle.toLowerCase() === o.requester && x.e.args.questionId === o.questionId);
      const qr = at(o.requester).find((x) => x.e.name === "QuestionResolved" && x.e.args.questionID === o.questionId);
      if (!cr || PAYOUT_LABEL[cr.e.args.payoutNumerators.map(String).join()] !== r.observedOutcome) p.push("stateTx has no matching ConditionResolution");
      if (!qr || qr.e.args.settledPrice.toString() !== o.price) p.push("stateTx has no matching QuestionResolved");
    } else {
      const name = r.outcomeState === "proposed" ? "ProposePrice" : "DisputePrice";
      const ev = at(o.oracle).find((x) => x.e.name === name && x.e.args.requester.toLowerCase() === o.requester && x.e.args.timestamp.toString() === o.requestTimestamp &&
        ethers.keccak256(x.e.args.ancillaryData) === o.questionId);
      if (!ev) p.push(`stateTx has no ${name} for this request`);
      else if (ev.e.args.proposedPrice.toString() !== o.price) p.push(`${name} price ${ev.e.args.proposedPrice} is not ${o.price}`);
    }
  }
  return { reason: p.length ? "onchain_mismatch" : null, problems: p };
}

for (const file of files) {
  const v = JSON.parse(readFileSync(file, "utf8"));
  const { payload, canonical, signature, public_key, algorithm } = v.envelope;
  const oracle = payload.scheme === "oracle-outcome-validation-v0";
  const bytes = Buffer.from(canonicalize(payload), "utf8");
  const got = {};
  got.canonicalMatches = bytes.toString("utf8") === canonical && Buffer.byteLength(canonical, "utf8") === v.canonicalByteLength;
  got.signatureValid = algorithm === "ed25519" && ed25519Verify(bytes, public_key, signature);
  got.responseHashMatches = ethers.keccak256(bytes) === v.responseHash;
  if (v.requirements) {
    const q = v.requirements;
    got.requirementsHashMatches = "0x" + crypto.createHash("sha256").update(canonicalize(q), "utf8").digest("hex") === payload.requirementsHash;
    const [, chainId, token] = CAIP19.exec(payload.asset) || [];
    got.requirementsConsistent =
      q.amount === payload.amount && q.payTo.toLowerCase() === payload.payee && q.asset.toLowerCase() === token && q.network === `eip155:${chainId}`;
  }
  const ancillaryData = v.evidence?.ancillaryData;
  const problems = oracle ? oracleSchemaProblems(payload, ancillaryData) : schemaProblems(payload);
  got.schemaValid = problems.length === 0;
  const call = iface.decodeFunctionData("validationResponse", v.validationResponse.calldata);
  let callOk =
    call[0] === v.validationResponse.requestHash &&
    Number(call[1]) === v.validationResponse.response &&
    call[2] === v.validationResponse.responseURI &&
    call[3] === v.responseHash &&
    call[4] === v.validationResponse.tag;
  let chainProblems = [];
  if (oracle) {
    // The registry write answers the record's own request, carries its score, and its tag names its state.
    callOk = callOk && call[0] === payload.requestHash && String(call[1]) === payload.score &&
      (!v.request || ethers.keccak256(Buffer.from(canonicalize(v.request.document), "utf8")) === payload.requestHash);
    got.stateTagConsistent = call[4] === `oracle-outcome:${payload.outcomeState}`;
    if (got.schemaValid) {
      chainProblems = supersedeProblems(payload, ethers.keccak256(bytes));
      got.supersedeChainValid = chainProblems.length === 0;
    }
  } else callOk = callOk && call[4] === payload.grounding;
  got.acceptOffline =
    got.canonicalMatches && got.signatureValid && got.responseHashMatches && got.requirementsHashMatches !== false &&
    got.requirementsConsistent !== false && got.schemaValid && got.stateTagConsistent !== false && got.supersedeChainValid !== false && callOk;
  let onchain = [];
  const needsChain = "onchainStateMatches" in v.expect;
  if (needsChain && ONCHAIN && got.schemaValid) {
    const res = await onchainProblems(payload, ancillaryData);
    onchain = res.problems;
    got.onchainStateMatches = onchain.length === 0;
    got.onchainReason = res.reason;
  }
  got.accept = got.acceptOffline && got.onchainStateMatches !== false;

  const name = file.split("/").pop();
  for (const [check, want] of Object.entries(v.expect)) {
    if (needsChain && !ONCHAIN && (check === "onchainStateMatches" || check === "onchainReason" || check === "accept")) continue;
    if (check === "acceptOffline" && !needsChain) continue;
    if (got[check] === undefined && check === "acceptOffline") continue;
    const ok = got[check] === want;
    if (!ok) failed = true;
    console.log(`${ok ? "ok  " : "FAIL"} ${name} ${check} = ${got[check]} (expected ${want})`);
  }
  if (needsChain && !ONCHAIN) console.log(`     ${name} on-chain checks skipped (run with --onchain); offline verdict only`);
  if (problems.length && v.expect.schemaValid !== false) { failed = true; console.log(`FAIL ${name} schema: ${problems.join("; ")}`); }
  else if (problems.length) console.log(`     ${name} schema problems, as expected: ${problems.join("; ")}`);
  if (chainProblems.length) console.log(`     ${name} supersede problems${v.expect.supersedeChainValid === false ? ", as expected" : ""}: ${chainProblems.join("; ")}`);
  if (onchain.length) console.log(`     ${name} on-chain problems${v.expect.onchainStateMatches === false ? ", as expected" : ""}: ${onchain.join("; ")}`);
  if (!callOk) {
    if (v.expect.accept !== false) failed = true;
    console.log(`${v.expect.accept !== false ? "FAIL" : "    "} ${name} validationResponse calldata does not match the record (request, score or tag)`);
  }
}
console.log(failed ? "RED" : "GREEN");
process.exit(failed ? 1 : 0);
