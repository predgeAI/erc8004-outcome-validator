// Generates the x402-grounded-feedback-v0 test vectors in ./test-vectors from fixed inputs.
// Deterministic: same inputs, same bytes (ed25519 signatures are deterministic).
//
//   node grounded-feedback/make-test-vectors.mjs
//
// Signing key: RFC 8032 section 7.1 TEST 1. It is publicly known and has never held anything.
// The independent check of the output is verify-test-vectors.mjs, which does not import this file
// or src/attest.mjs.
import crypto from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { canonicalJson } from "../src/attest.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "test-vectors");
const iface = new ethers.Interface(JSON.parse(readFileSync(join(here, "../abi/ValidationRegistry.json"), "utf8")));

const SEED = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const PUBLIC_KEY = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
const privateKey = crypto.createPrivateKey({
  key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(SEED, "hex")]),
  format: "der",
  type: "pkcs8",
});
const spki = crypto.createPublicKey(privateKey).export({ type: "spki", format: "der" });
if (spki.subarray(12).toString("hex") !== PUBLIC_KEY) throw new Error("RFC 8032 TEST 1 key does not derive its public key");

const KEY_NOTE =
  `Signed with the RFC 8032 section 7.1 TEST 1 ed25519 key: secret ${SEED}, public ${PUBLIC_KEY}. ` +
  "Publicly known, never used for anything real. TEST KEY ONLY.";
const sha256 = (s) => "0x" + crypto.createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");
const keccak = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));

function envelope(payload) {
  const canonical = canonicalJson(payload);
  const signature = crypto.sign(null, Buffer.from(canonical, "utf8"), privateKey).toString("hex");
  return { payload, canonical, signature, public_key: PUBLIC_KEY, algorithm: "ed25519" };
}

function onChain(n, responseHash, tag) {
  const requestHash = keccak(`x402-grounded-feedback-v0 test request ${n}`);
  const responseURI = `https://example.com/attestations/${n}.json`;
  const calldata = iface.encodeFunctionData("validationResponse", [requestHash, 100, responseURI, responseHash, tag]);
  return { function: "validationResponse(bytes32,uint8,string,bytes32,string)", requestHash, response: 100, responseURI, responseHash, tag, calldata };
}

// x402 v2 PaymentRequirements exactly as the unpaid 402 returned them (the accepts[] entry that
// was paid). Hashed as received: no lower-casing, numbers stay numbers.
const requirements = {
  scheme: "exact",
  network: "eip155:8453",
  amount: "5000",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  payTo: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  maxTimeoutSeconds: 60,
  extra: { name: "USD Coin", version: "2" },
};

const x402Record = {
  scheme: "x402-grounded-feedback-v0",
  grounding: "x402-settlement",
  payer: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  payee: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
  ratee: { agentRegistry: "eip155:8453:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432", agentId: "42" },
  amount: "5000",
  asset: "eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  resource: "https://api.example.com/v1/signal/0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
  requirementsHash: sha256(canonicalJson(requirements)),
  nonce: sha256("x402-grounded-feedback-v0 test vector 01 nonce"),
  settlementTx: "0x" + "22".repeat(32),
};

const escrowRecord = {
  scheme: "x402-grounded-feedback-v0",
  grounding: "escrow-release",
  payer: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
  payee: "0x90f79bf6eb2c4f870365e785982e1f101e93b906",
  ratee: { agentRegistry: "eip155:42161:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432", agentId: "7" },
  amount: "250000",
  asset: "eip155:42161/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831",
  escrow: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
  resource: "https://example.com/jobs/1/spec.json",
  nonce: ethers.zeroPadValue("0x01", 32),
  settlementTx: "0x" + "33".repeat(32),
};

const PITFALLS = {
  canonical:
    "Keys sorted by UTF-16 code units at every level, no whitespace, UTF-8. Every leaf value in the record is a string, so no number formatting is involved. Absent optional keys are omitted, never null.",
  responseHash: "keccak256 (Ethereum's, not NIST SHA3-256) over the UTF-8 bytes of the canonical string.",
  signature: "ed25519 over the UTF-8 bytes of the canonical string itself, not over responseHash and not over a hex string.",
  ratee: "ratee is the agent credited; payee only proves where the money went. Here payee is a treasury, so the two differ.",
};

function vector(file, body) {
  writeFileSync(join(out, file), JSON.stringify(body, null, 2) + "\n");
  console.log(`${file}: responseHash ${body.responseHash}`);
}

mkdirSync(out, { recursive: true });

const e1 = envelope(x402Record);
const h1 = keccak(e1.canonical);
vector("01-x402-settlement.json", {
  _README:
    "x402-grounded-feedback-v0, grounding x402-settlement. A paid x402 call where the payTo is a treasury, so payee and ratee differ. Everything needed to check it offline is in this file: node grounded-feedback/verify-test-vectors.mjs",
  spec: "grounded-feedback/README.md",
  signingKeyNote: KEY_NOTE,
  requirements,
  envelope: e1,
  canonicalByteLength: Buffer.byteLength(e1.canonical, "utf8"),
  responseHash: h1,
  validationResponse: onChain(1, h1, x402Record.grounding),
  expect: { canonicalMatches: true, signatureValid: true, responseHashMatches: true, requirementsHashMatches: true, requirementsConsistent: true, accept: true },
  notes: {
    ...PITFALLS,
    requirementsHash:
      "0x + sha256 hex of the canonical JSON of `requirements`, the accepts[] entry exactly as the unpaid 402 returned it. Hash it as received (mixed-case addresses, maxTimeoutSeconds as a number); hash the runtime challenge, not /.well-known/x402. The record must also agree with it: amount, payee = payTo, asset and network.",
    settlement:
      "A consumer reads settlementTx on the asset's chain: status 1, and from the asset contract both AuthorizationUsed(payer, nonce) and Transfer(payer, payee, amount). tx.to is often a facilitator multicall, so match logs by the asset address, not by tx.to. settlementTx here is a placeholder.",
  },
});

const e2 = envelope(escrowRecord);
const h2 = keccak(e2.canonical);
vector("02-escrow-release.json", {
  _README:
    "x402-grounded-feedback-v0, grounding escrow-release. An escrowed job paid out on release; nonce is the escrow's job id as bytes32. Check offline: node grounded-feedback/verify-test-vectors.mjs",
  spec: "grounded-feedback/README.md",
  signingKeyNote: KEY_NOTE,
  envelope: e2,
  canonicalByteLength: Buffer.byteLength(e2.canonical, "utf8"),
  responseHash: h2,
  validationResponse: onChain(2, h2, escrowRecord.grounding),
  expect: { canonicalMatches: true, signatureValid: true, responseHashMatches: true, accept: true },
  notes: {
    ...PITFALLS,
    settlement:
      "A consumer reads settlementTx: status 1, the escrow contract's own release event for this job, and Transfer(escrow, payee, amount) from the asset contract. escrow, payee and settlementTx here are placeholders.",
  },
});

// Negative: the record was edited after signing (amount 5000 -> 50000). The envelope keeps the
// original canonical string and signature; the registry still holds the original responseHash.
const tampered = { ...e1, payload: { ...x402Record, amount: "50000" } };
vector("03-tampered-amount.json", {
  _README:
    "Negative vector: vector 01 with payload.amount changed from 5000 to 50000 after signing. Every check must fail and the record must be rejected. Check offline: node grounded-feedback/verify-test-vectors.mjs",
  spec: "grounded-feedback/README.md",
  signingKeyNote: KEY_NOTE,
  requirements,
  envelope: tampered,
  canonicalByteLength: Buffer.byteLength(tampered.canonical, "utf8"),
  responseHash: h1,
  validationResponse: onChain(1, h1, x402Record.grounding),
  expect: { canonicalMatches: false, signatureValid: false, responseHashMatches: false, requirementsHashMatches: true, requirementsConsistent: false, accept: false },
  notes: {
    why:
      "The consumer canonicalizes the payload it was given, so the edit changes the bytes: they no longer equal envelope.canonical, the signature no longer verifies over them, and their keccak256 no longer equals the responseHash on chain. A consumer that verified envelope.canonical instead of the payload would accept a record whose fields say something else.",
  },
});
