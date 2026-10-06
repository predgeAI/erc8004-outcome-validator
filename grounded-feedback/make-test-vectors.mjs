// Generates the x402-grounded-feedback-v0 and oracle-outcome-validation-v0 test vectors in ./test-vectors from fixed inputs.
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

// Metered delivery: the `measured` block is the capacity-attest example. The record adds the two
// fields capacity-attest checks it against: `assetType`, and `issuedAt` in the strict timestamp form.
const meteredRecord = {
  scheme: "x402-grounded-feedback-v0",
  grounding: "x402-settlement",
  payer: "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65",
  payee: "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc",
  ratee: { agentRegistry: "eip155:8453:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432", agentId: "9" },
  amount: "4000000",
  asset: "eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  resource: "https://gpu.example.com/v1/jobs/8f21a3",
  nonce: sha256("x402-grounded-feedback-v0 test vector 04 nonce"),
  settlementTx: "0x" + "44".repeat(32),
  issuedAt: "2026-09-01T08:00:05.000Z",
  assetType: "gpu-hours",
  measured: {
    unit: "gpu-second",
    basis: "supplied",
    promisedAmount: "28800",
    deliveredAmount: "25230",
    period: { start: "2026-09-01T04:00:00Z", end: "2026-09-01T08:00:00Z" },
    method: {
      attribution: "buyer",
      instrument: "nvidia-smi accounting, 10s polling, job 8f21a3",
      readingsHash: "0d08539780ad082368c65079bf21cc1daaf62617549d20d5a304cc551248021d",
    },
  },
};

const MEASURED_NOTES = {
  assetType:
    "Present exactly when `measured` is. measured.unit must be in its row of capacity-attest's unit table: gpu-hours: gpu-second; storage: byte, byte-second; bandwidth: byte; api-credits: call, token, credit.",
  issuedAt:
    "With `measured`, YYYY-MM-DDTHH:MM:SS.sssZ with exactly three fractional digits, and the first 19 characters of measured.period.end must not be later than the first 19 characters of issuedAt.",
};

const e4 = envelope(meteredRecord);
const h4 = keccak(e4.canonical);
vector("04-metered-gpu.json", {
  _README:
    "x402-grounded-feedback-v0 with metered delivery: an x402 payment for GPU time, with the capacity-attest `measured` block, `assetType` and `issuedAt`. Check offline: node grounded-feedback/verify-test-vectors.mjs",
  spec: "grounded-feedback/README.md",
  signingKeyNote: KEY_NOTE,
  envelope: e4,
  canonicalByteLength: Buffer.byteLength(e4.canonical, "utf8"),
  responseHash: h4,
  validationResponse: onChain(4, h4, meteredRecord.grounding),
  expect: { canonicalMatches: true, signatureValid: true, responseHashMatches: true, schemaValid: true, accept: true },
  notes: { ...PITFALLS, ...MEASURED_NOTES },
});

// Negative: correctly signed and hashed, but `byte` is not a gpu-hours unit. Only the schema check
// can catch it, since the signature covers the wrong value as faithfully as a right one.
const wrongUnitRecord = {
  ...meteredRecord,
  nonce: sha256("x402-grounded-feedback-v0 test vector 05 nonce"),
  settlementTx: "0x" + "55".repeat(32),
  measured: { ...meteredRecord.measured, unit: "byte" },
};
const e5 = envelope(wrongUnitRecord);
const h5 = keccak(e5.canonical);
vector("05-unit-not-in-asset-type.json", {
  _README:
    "Negative vector: vector 04 with measured.unit set to byte, which capacity-attest does not allow under assetType gpu-hours. The record is correctly signed and hashed, so only the schema check fails, and the record must be rejected. Check offline: node grounded-feedback/verify-test-vectors.mjs",
  spec: "grounded-feedback/README.md",
  signingKeyNote: KEY_NOTE,
  envelope: e5,
  canonicalByteLength: Buffer.byteLength(e5.canonical, "utf8"),
  responseHash: h5,
  validationResponse: onChain(5, h5, wrongUnitRecord.grounding),
  expect: { canonicalMatches: true, signatureValid: true, responseHashMatches: true, schemaValid: false, accept: false },
  notes: {
    ...MEASURED_NOTES,
    why: "A signature proves who wrote the record, not that its fields are allowed. byte is a storage or bandwidth unit, so a consumer that skips the unit table would accept GPU time measured in bytes.",
  },
});

// ---------------------------------------------------------------------------------------------
// oracle-outcome-validation-v0: outcome validation with the oracle lifecycle state bound by
// responseHash. One real Polymarket market (1992979) on Polygon, from the committed evidence file
// written by tools/collect-uma-ctf.mjs. "Yes" was proposed, disputed, and the market settled "No".
// ---------------------------------------------------------------------------------------------
const ev = JSON.parse(readFileSync(join(here, "evidence/polymarket-1992979.json"), "utf8"));
const byEvent = (contract, event, n = 0) => ev.timeline.filter((e) => e.contract === contract && e.event === event)[n];
const firstProposal = byEvent("optimisticOracle", "ProposePrice", 0);
const resolution = byEvent("adapter", "QuestionResolved");
const finalRequest = byEvent("optimisticOracle", "Settle");

const ratee = { agentRegistry: "eip155:8453:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432", agentId: "42" };
const subject = { venue: "polymarket", marketId: ev.market.marketId, conditionId: ev.market.conditionId };
// The ERC-8004 request: the agent claimed "Yes". requestHash commits to this document.
const oracleRequest = { scheme: "oracle-outcome-validation-v0", ratee, subject, claimedOutcome: "Yes" };
const oracleRequestHash = keccak(canonicalJson(oracleRequest));
const oracleRequestURI = "https://example.com/requests/polymarket-1992979-yes.json";

function oracleRef(state, requestTimestamp, price, read, stateTx) {
  return {
    kind: "uma-ctf-adapter",
    chainId: ev.chainId,
    oracle: ev.contracts.optimisticOracle,
    requester: ev.contracts.adapter,
    conditionalTokens: ev.contracts.conditionalTokens,
    questionId: ev.market.questionId,
    identifier: ev.identifier,
    requestTimestamp,
    price,
    readBlock: read.blockNumber,
    readBlockHash: read.blockHash,
    stateTx,
  };
}
const label = (price) => ({ "0": "No", "1000000000000000000": "Yes", "500000000000000000": "Unknown" })[price];

const proposedRecord = {
  scheme: "oracle-outcome-validation-v0",
  requestHash: oracleRequestHash,
  ratee,
  subject,
  claimedOutcome: "Yes",
  observedOutcome: label(firstProposal.price),
  score: "100",
  outcomeState: "proposed",
  oracle: oracleRef("proposed", firstProposal.requestTimestamp, firstProposal.price, ev.reads.proposed, firstProposal.transactionHash),
  issuedAt: "2026-07-02T05:14:30.000Z",
};
const eP = envelope(proposedRecord);
const hP = keccak(eP.canonical);

const finalRecord = {
  scheme: "oracle-outcome-validation-v0",
  requestHash: oracleRequestHash,
  ratee,
  subject,
  claimedOutcome: "Yes",
  observedOutcome: label(resolution.settledPrice),
  score: "0",
  outcomeState: "final",
  oracle: oracleRef("final", finalRequest.requestTimestamp, resolution.settledPrice, ev.reads.final, resolution.transactionHash),
  issuedAt: "2026-07-02T09:00:30.000Z",
  supersedes: hP,
};
const eF = envelope(finalRecord);
const hF = keccak(eF.canonical);

function oracleCall(n, responseHash, tag, response, requestHash = oracleRequestHash) {
  const responseURI = `https://example.com/attestations/${n}.json`;
  const calldata = iface.encodeFunctionData("validationResponse", [requestHash, response, responseURI, responseHash, tag]);
  return { function: "validationResponse(bytes32,uint8,string,bytes32,string)", requestHash, response, responseURI, responseHash, tag, calldata };
}

const ORACLE_EVIDENCE = {
  file: "grounded-feedback/evidence/polymarket-1992979.json",
  market: `${ev.market.title} (Polymarket market ${ev.market.marketId})`,
  ancillaryData: ev.ancillaryData,
  timeline: ev.timeline.map((e) => `${e.blockNumber} ${e.contract}.${e.event} ${e.transactionHash}${e.price !== undefined ? " price " + e.price : ""}${e.payoutNumerators ? " payouts " + e.payoutNumerators.join(",") : ""}`),
};
const ORACLE_NOTES = {
  outcomeState:
    "Inside the signed record, so responseHash binds it. proposed and disputed records are provisional: the on-chain tag must say the same state (oracle-outcome:<state>), and a consumer must not present them as final.",
  oracle:
    "The oracle reference a reader re-checks on Polygon: at readBlock, OO.getState(requester, identifier, requestTimestamp, ancillaryData) and ConditionalTokens.payoutDenominator(conditionId); stateTx is the transaction that put the request into outcomeState. keccak256(ancillaryData) = questionId and conditionId = keccak256(requester ++ questionId ++ uint256(2)).",
  supersedes:
    "A later record for the same requestHash names the responseHash it replaces. The earlier record stays visible: its ValidationResponse event stays in the registry logs and its envelope stays at its responseURI.",
  onchain: "node grounded-feedback/verify-test-vectors.mjs --onchain re-reads every reference over Polygon RPC (RPC_URL, default https://polygon.gateway.tenderly.co).",
};

vector("06-oracle-proposed.json", {
  _README:
    "oracle-outcome-validation-v0 at outcomeState proposed. Real Polymarket market 1992979: an agent claimed Yes; at Polygon block 89509500 the UMA request held a proposed Yes (proposed at block 89508637, disputed at 89510574). Score 100 against the proposal, tag oracle-outcome:proposed. Check offline: node grounded-feedback/verify-test-vectors.mjs; on chain: add --onchain",
  spec: "grounded-feedback/oracle-outcome.md",
  signingKeyNote: KEY_NOTE,
  request: { requestURI: oracleRequestURI, document: oracleRequest },
  evidence: ORACLE_EVIDENCE,
  envelope: eP,
  canonicalByteLength: Buffer.byteLength(eP.canonical, "utf8"),
  responseHash: hP,
  validationResponse: oracleCall(6, hP, "oracle-outcome:proposed", 100),
  expect: { canonicalMatches: true, signatureValid: true, responseHashMatches: true, schemaValid: true, stateTagConsistent: true, supersedeChainValid: true, acceptOffline: true, onchainStateMatches: true, accept: true },
  notes: { ...PITFALLS, ...ORACLE_NOTES },
});

vector("07-oracle-final-supersedes.json", {
  _README:
    "oracle-outcome-validation-v0 at outcomeState final for the same request as vector 06, after on-chain resolution (QuestionResolved and ConditionResolution, payouts 0,1 = No, at block 89518530). Score 0, tag oracle-outcome:final, supersedes = responseHash of vector 06, which stays visible. Check offline: node grounded-feedback/verify-test-vectors.mjs; on chain: add --onchain",
  spec: "grounded-feedback/oracle-outcome.md",
  signingKeyNote: KEY_NOTE,
  request: { requestURI: oracleRequestURI, document: oracleRequest },
  evidence: ORACLE_EVIDENCE,
  envelope: eF,
  canonicalByteLength: Buffer.byteLength(eF.canonical, "utf8"),
  responseHash: hF,
  validationResponse: oracleCall(7, hF, "oracle-outcome:final", 0),
  expect: { canonicalMatches: true, signatureValid: true, responseHashMatches: true, schemaValid: true, stateTagConsistent: true, supersedeChainValid: true, acceptOffline: true, onchainStateMatches: true, accept: true },
  notes: { ...PITFALLS, ...ORACLE_NOTES },
});

// Negative: vector 06's record, unchanged and correctly signed, written on chain as if it were final.
vector("08-proposed-presented-as-final.json", {
  _README:
    "Negative vector: the signed proposed record of vector 06, written with tag oracle-outcome:final. The signature and responseHash are fine; the presentation contradicts the bound outcomeState, so the record must be rejected.",
  spec: "grounded-feedback/oracle-outcome.md",
  signingKeyNote: KEY_NOTE,
  request: { requestURI: oracleRequestURI, document: oracleRequest },
  evidence: ORACLE_EVIDENCE,
  envelope: eP,
  canonicalByteLength: Buffer.byteLength(eP.canonical, "utf8"),
  responseHash: hP,
  validationResponse: oracleCall(8, hP, "oracle-outcome:final", 100),
  expect: { canonicalMatches: true, signatureValid: true, responseHashMatches: true, schemaValid: true, stateTagConsistent: false, supersedeChainValid: true, acceptOffline: false, onchainStateMatches: true, accept: false },
  notes: { why: "A contract or indexer that filters on the tag would read a provisional proposal as the final outcome. outcomeState is bound by responseHash, so the tag must agree with it." },
});

// Negative: a correctly signed final record whose supersedes names a record of a different request.
const wrongSupersede = { ...finalRecord, supersedes: h1 };
const eW = envelope(wrongSupersede);
const hW = keccak(eW.canonical);
vector("09-supersedes-wrong-hash.json", {
  _README:
    "Negative vector: vector 07 re-signed with supersedes pointing at the responseHash of vector 01, an x402 record for a different request. Signature and hash are valid; the supersede chain is not, so the record must be rejected.",
  spec: "grounded-feedback/oracle-outcome.md",
  signingKeyNote: KEY_NOTE,
  request: { requestURI: oracleRequestURI, document: oracleRequest },
  evidence: ORACLE_EVIDENCE,
  envelope: eW,
  canonicalByteLength: Buffer.byteLength(eW.canonical, "utf8"),
  responseHash: hW,
  validationResponse: oracleCall(9, hW, "oracle-outcome:final", 0),
  expect: { canonicalMatches: true, signatureValid: true, responseHashMatches: true, schemaValid: true, stateTagConsistent: true, supersedeChainValid: false, acceptOffline: false, onchainStateMatches: true, accept: false },
  notes: { why: "supersedes must name an earlier, non-final record of the same requestHash, ratee, subject and claim, read at an earlier block. Otherwise the proposed record that vector 07 replaces would silently drop out of the history." },
});

// Negative: vector 06 edited after signing: outcomeState proposed -> final (and the tag to match).
const tamperedState = { ...eP, payload: { ...proposedRecord, outcomeState: "final" } };
vector("10-tampered-outcome-state.json", {
  _README:
    "Negative vector: vector 06 with payload.outcomeState changed from proposed to final after signing, and the tag changed to match. Canonical bytes, signature and responseHash all fail, so the record must be rejected.",
  spec: "grounded-feedback/oracle-outcome.md",
  signingKeyNote: KEY_NOTE,
  request: { requestURI: oracleRequestURI, document: oracleRequest },
  evidence: ORACLE_EVIDENCE,
  envelope: tamperedState,
  canonicalByteLength: Buffer.byteLength(tamperedState.canonical, "utf8"),
  responseHash: hP,
  validationResponse: oracleCall(10, hP, "oracle-outcome:final", 100),
  expect: { canonicalMatches: false, signatureValid: false, responseHashMatches: false, accept: false },
  notes: { why: "outcomeState is part of the signed canonical bytes, so a consumer that canonicalizes the payload it received sees the edit. The on-chain responseHash still names the proposed record." },
});

// Negative: a correctly signed record that calls the market final at the proposed-state block.
// Only the on-chain check can catch it: the validator labelled the state instead of reading it.
// It answers its own request (agent 43 claiming Yes), so it has no earlier record to supersede.
const ratee43 = { ...ratee, agentId: "43" };
const request43 = { ...oracleRequest, ratee: ratee43 };
const requestHash43 = keccak(canonicalJson(request43));
const finalTooEarly = {
  ...proposedRecord,
  requestHash: requestHash43,
  ratee: ratee43,
  outcomeState: "final",
  issuedAt: "2026-07-02T05:14:31.000Z",
};
const eE = envelope(finalTooEarly);
const hE = keccak(eE.canonical);
vector("11-final-claimed-at-proposed-block.json", {
  _README:
    "Negative vector: a correctly signed record that says outcomeState final with observedOutcome Yes, at block 89509500 where the request was only proposed. It passes every offline check; --onchain rejects it because payoutDenominator(conditionId) is 0 and getState is PROPOSED at that block.",
  spec: "grounded-feedback/oracle-outcome.md",
  signingKeyNote: KEY_NOTE,
  request: { requestURI: "https://example.com/requests/polymarket-1992979-yes-agent-43.json", document: request43 },
  evidence: ORACLE_EVIDENCE,
  envelope: eE,
  canonicalByteLength: Buffer.byteLength(eE.canonical, "utf8"),
  responseHash: hE,
  validationResponse: oracleCall(11, hE, "oracle-outcome:final", 100, requestHash43),
  expect: { canonicalMatches: true, signatureValid: true, responseHashMatches: true, schemaValid: true, stateTagConsistent: true, supersedeChainValid: true, acceptOffline: true, onchainStateMatches: false, accept: false },
  notes: { why: "This is why the oracle reference is bound next to outcomeState: a label alone can be wrong, a block plus a contract read can be checked. Offline verifiers accept it and say that the on-chain check is still owed." },
});

// Negative: a correctly signed final record read in the window between the UMA request reaching
// SETTLED (Settle, block 89518525) and the adapter's resolve (block 89518530). getState is
// SETTLED but payoutDenominator is still 0, so the condition is not resolved: no record is valid
// here, in any outcomeState. --onchain rejects it with the distinct reason settled_not_resolved.
// It answers its own request (agent 44 claiming Yes), so it has no earlier record to supersede.
const settle = byEvent("optimisticOracle", "Settle");
const ratee44 = { ...ratee, agentId: "44" };
const request44 = { ...oracleRequest, ratee: ratee44 };
const requestHash44 = keccak(canonicalJson(request44));
const settledNotResolved = {
  scheme: "oracle-outcome-validation-v0",
  requestHash: requestHash44,
  ratee: ratee44,
  subject,
  claimedOutcome: "Yes",
  observedOutcome: label(settle.price),
  score: "0",
  outcomeState: "final",
  oracle: oracleRef("final", settle.requestTimestamp, settle.price, ev.reads.settledNotResolved, settle.transactionHash),
  issuedAt: "2026-07-02T08:59:56.000Z",
};
const eS = envelope(settledNotResolved);
const hS = keccak(eS.canonical);
vector("12-final-in-settled-not-resolved-window.json", {
  _README:
    "Negative vector: a correctly signed record that says outcomeState final with observedOutcome No, read at block 89518527. The UMA request settled at No in block 89518525, but the adapter only resolved the condition in block 89518530, so at 89518527 getState is SETTLED and payoutDenominator is 0. No record is valid in that window. It passes every offline check; --onchain rejects it with reason settled_not_resolved, not as a state mismatch.",
  spec: "grounded-feedback/oracle-outcome.md",
  signingKeyNote: KEY_NOTE,
  request: { requestURI: "https://example.com/requests/polymarket-1992979-yes-agent-44.json", document: request44 },
  evidence: ORACLE_EVIDENCE,
  envelope: eS,
  canonicalByteLength: Buffer.byteLength(eS.canonical, "utf8"),
  responseHash: hS,
  validationResponse: oracleCall(12, hS, "oracle-outcome:final", 0, requestHash44),
  expect: { canonicalMatches: true, signatureValid: true, responseHashMatches: true, schemaValid: true, stateTagConsistent: true, supersedeChainValid: true, acceptOffline: true, onchainStateMatches: false, onchainReason: "settled_not_resolved", accept: false },
  notes: {
    why: "final means the condition is resolved: payoutDenominator(conditionId) > 0 at readBlock. A SETTLED oracle request is not that yet; the adapter writes the payouts, and until it does a validator writes nothing and waits to write final after resolve. proposed and disputed fail too, since the request is no longer in either state.",
    window: "Market 1992979: Settle 0x4f54a4e26d71dc4341e6266b0be18aa3b68175ffd6ef96db9df954f8bc14fdff at block 89518525, resolve 0xbf29967cbfbb8d389f58d5a03088232382d412cff1335293d6a75f8a9590bc94 at block 89518530. Blocks 89518525 to 89518529: getState SETTLED, payoutDenominator 0. The read at 89518527 is reads.settledNotResolved in the evidence file.",
  },
});
