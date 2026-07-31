// Deterministic, offline proof that Predge is a working ERC-8004 validator:
//   Predge signed outcome-attest  ->  real validationResponse calldata,
//   with the on-chain responseHash cryptographically bound to the signed payload.
// No chain, no keys, no funds — pure crypto + the REAL registry ABI. The owner
// then broadcasts the exact same calldata to a testnet via `npm run fire`.
import { ethers } from "ethers";
import { ATTEST_VERSION, ATTEST_ISSUER, signAttestation, verifyAttestation, ephemeralKeypair, canonicalJson } from "./attest.mjs";
import { mapAttestToValidation, iface, PREDGE_TAG } from "./map-to-validation.mjs";

const { publicKey, privateKey } = ephemeralKeypair();
const VALIDATOR = "0x000000000000000000000000000000000000dEaD"; // demo validator addr (owner sets real one)
const AGENT_ID = 42n; // demo ERC-8004 Identity Registry agentId of the claimant agent

let failures = 0;
const ok = (c, m) => { console.log(`  ${c ? "OK " : "XX "} ${m}`); if (!c) failures++; };

function runCase(label, claimedOutcome, resolvedOutcome) {
  console.log(`\n── case: ${label} (claim=${claimedOutcome}, resolved=${resolvedOutcome}) ──`);
  const conditionId = "0x" + "ab".repeat(32);
  const match = claimedOutcome === resolvedOutcome;
  const matchScore = match ? 100 : 0;

  // The CLAIM the agent sold / acted on (what the validationRequest commits to).
  const claim = { agent_id: Number(AGENT_ID), platform: "polymarket", condition_id: conditionId, claimed_outcome: claimedOutcome };

  // Predge's signed RESOLVED-OUTCOME-VS-CLAIM attestation (the validator's evidence).
  const payload = {
    version: ATTEST_VERSION,
    issuer: ATTEST_ISSUER,
    kind: "resolved-outcome-vs-claim",
    platform: "polymarket",
    subject: { condition_id: conditionId },
    claim: { outcome: claimedOutcome },
    resolved: { outcome: resolvedOutcome, resolved_at: "2026-08-01T00:00:00.000Z" },
    match,
    issued_at: "2026-08-01T00:05:00.000Z",
  };
  const attest = signAttestation(payload, privateKey, publicKey);

  // (1) the signed attest verifies offline (independent of any HTTP/chain trust)
  ok(verifyAttestation(attest), "ed25519 attestation verifies offline");
  // tamper check: flip match, signature must fail
  ok(!verifyAttestation({ ...attest, canonical: attest.canonical.replace(/"match":(true|false)/, (_, b) => `"match":${b === "true" ? "false" : "true"}`) }), "tampered attest is rejected");

  const responseURI = `https://data.predge.io/attest/polymarket/${conditionId}`;
  const requestURI = `https://data.predge.io/claim/${AGENT_ID}/${conditionId}`;
  const m = mapAttestToValidation({ attest, agentId: AGENT_ID, validatorAddress: VALIDATOR, claim, requestURI, responseURI, matchScore });

  // (2) responseHash on-chain binds to the EXACT signed canonical bytes
  ok(m.responseHash === ethers.keccak256(ethers.toUtf8Bytes(attest.canonical)), "responseHash == keccak256(signed canonical)");
  // (3) score is honest and in-range
  ok(m.matchScore === matchScore && m.matchScore >= 0 && m.matchScore <= 100, `response=${m.matchScore} (0..100, honest match score)`);
  ok(m.tag === PREDGE_TAG, `tag = ${PREDGE_TAG}`);

  // (4) calldata round-trips against the REAL registry ABI
  const dReq = iface.decodeFunctionData("validationRequest", m.requestCalldata);
  ok(dReq[0] === m.validator && dReq[1] === m.agent && dReq[2] === requestURI && dReq[3] === m.requestHash, "validationRequest calldata decodes to inputs");
  const dResp = iface.decodeFunctionData("validationResponse", m.responseCalldata);
  ok(dResp[0] === m.requestHash && Number(dResp[1]) === matchScore && dResp[2] === responseURI && dResp[3] === m.responseHash && dResp[4] === PREDGE_TAG, "validationResponse calldata decodes to inputs");

  console.log(`     requestHash    ${m.requestHash}`);
  console.log(`     responseHash   ${m.responseHash}`);
  console.log(`     response       ${m.matchScore}`);
  console.log(`     responseCalldata ${m.responseCalldata.slice(0, 74)}…`);
  return m;
}

console.log("Predge → ERC-8004 Validation Registry — offline proof");
console.log("real ABI:", iface.fragments.filter((f) => f.type === "function").map((f) => f.name).filter((n) => /validation/i.test(n)).join(", "));

runCase("TRUE claim (outcome matched reality)", "YES", "YES");
runCase("FALSE claim (agent's claim did NOT match reality)", "YES", "NO");

console.log(`\n${failures === 0 ? "PROOF GREEN ✅ — every assertion passed" : `PROOF RED ❌ — ${failures} failing`}`);
console.log("The responseCalldata above is broadcast-ready; `npm run fire` sends it to a testnet (owner key).");
process.exit(failures === 0 ? 0 : 1);
