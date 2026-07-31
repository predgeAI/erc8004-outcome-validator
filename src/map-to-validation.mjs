// Map a Predge signed outcome-attestation to an ERC-8004 Validation Registry
// call pair, encoded against the REAL vendored ABI (abis/ValidationRegistry.json
// from erc-8004/erc-8004-contracts).
//
// The honest two-step flow (per ValidationRegistryUpgradeable.sol):
//   1. validationRequest(validatorAddress, agentId, requestURI, requestHash)
//      — called by the AGENT (owner of agentId in the Identity Registry). It
//        names Predge as the validator and commits `requestHash` = the claim.
//   2. validationResponse(requestHash, response, responseURI, responseHash, tag)
//      — called by PREDGE (msg.sender == validatorAddress). `response` is the
//        0..100 outcome-match score; `responseHash` binds the exact signed attest.
//
// Predge's validation METHOD = real-world-resolution-vs-claim: did the resolved
// real-world outcome (market resolution / sports result / settled fact) match
// the claim the agent sold or acted on. This is the slot ERC-8004's re-execution
// / zkML / TEE validators do NOT cover (they check code/work correctness).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ethers } from "ethers";
import { canonicalJson } from "./attest.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const abiJson = JSON.parse(readFileSync(join(__dir, "../abi/ValidationRegistry.json"), "utf8"));
export const VALIDATION_ABI = abiJson.abi ?? abiJson;
export const iface = new ethers.Interface(VALIDATION_ABI);

export const PREDGE_TAG = "predge:resolved-outcome-vs-claim";

/** keccak256 over the UTF-8 canonical JSON of an object. */
export function hashCanonical(obj) {
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalJson(obj)));
}

/**
 * @param {object} a
 * @param {object} a.attest        Predge attestation envelope (from signAttestation)
 * @param {bigint|number} a.agentId  ERC-8004 Identity Registry agentId of the CLAIMANT agent
 * @param {string} a.validatorAddress  Predge's on-chain validator address (0x…)
 * @param {object} a.claim          the request object the agent committed to (subject + claimed outcome)
 * @param {string} a.responseURI    URL to the signed attestation (e.g. https://data.predge.io/attest/<id>)
 * @param {number} a.matchScore     0..100 (100 = resolved outcome matched the claim; 0 = mismatch)
 */
export function mapAttestToValidation({ attest, agentId, validatorAddress, claim, requestURI, responseURI, matchScore }) {
  if (!Number.isInteger(matchScore) || matchScore < 0 || matchScore > 100) {
    throw new Error(`matchScore must be an integer 0..100, got ${matchScore}`);
  }
  const validator = ethers.getAddress(validatorAddress);
  const agent = BigInt(agentId);
  const requestHash = hashCanonical(claim); // commitment to the claim being validated
  const responseHash = ethers.keccak256(ethers.toUtf8Bytes(attest.canonical)); // binds the exact signed attest

  const requestCalldata = iface.encodeFunctionData("validationRequest", [
    validator,
    agent,
    requestURI,
    requestHash,
  ]);
  const responseCalldata = iface.encodeFunctionData("validationResponse", [
    requestHash,
    matchScore,
    responseURI,
    responseHash,
    PREDGE_TAG,
  ]);

  return { validator, agent, requestHash, responseHash, matchScore, requestURI, responseURI, tag: PREDGE_TAG, requestCalldata, responseCalldata };
}
