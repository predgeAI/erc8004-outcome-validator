#!/usr/bin/env node
// Standalone verifier for the x402-grounded-feedback-v0 test vectors.
//
//   node grounded-feedback/verify-test-vectors.mjs [vector.json ...]
//
// Written from README.md, not from the generator: it does not import make-test-vectors.mjs or
// src/attest.mjs, and the canonicalization below is its own. It reads the vector files and the
// vendored registry ABI, uses node:crypto for ed25519 and sha256 and ethers for keccak256 and ABI
// decoding, and makes no network call.
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
const files = process.argv.length > 2 ? process.argv.slice(2) : readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => join(dir, f));

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

for (const file of files) {
  const v = JSON.parse(readFileSync(file, "utf8"));
  const { payload, canonical, signature, public_key, algorithm } = v.envelope;
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
  const problems = schemaProblems(payload);
  got.schemaValid = problems.length === 0;
  const call = iface.decodeFunctionData("validationResponse", v.validationResponse.calldata);
  const callOk =
    call[0] === v.validationResponse.requestHash &&
    Number(call[1]) === v.validationResponse.response &&
    call[2] === v.validationResponse.responseURI &&
    call[3] === v.responseHash &&
    call[4] === payload.grounding;
  got.accept =
    got.canonicalMatches && got.signatureValid && got.responseHashMatches && got.requirementsHashMatches !== false &&
    got.requirementsConsistent !== false && got.schemaValid && callOk;

  const name = file.split("/").pop();
  for (const [check, want] of Object.entries(v.expect)) {
    const ok = got[check] === want;
    if (!ok) failed = true;
    console.log(`${ok ? "ok  " : "FAIL"} ${name} ${check} = ${got[check]} (expected ${want})`);
  }
  if (problems.length && v.expect.schemaValid !== false) { failed = true; console.log(`FAIL ${name} schema: ${problems.join("; ")}`); }
  else if (problems.length) console.log(`     ${name} schema problems, as expected: ${problems.join("; ")}`);
  if (!callOk) { failed = true; console.log(`FAIL ${name} validationResponse calldata does not decode to the stated fields`); }
}
console.log(failed ? "RED" : "GREEN");
process.exit(failed ? 1 : 0);
