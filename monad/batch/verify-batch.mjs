// Re-check every verdict of the batch run against Monad testnet. Read-only, no key.
//
//   node monad/batch/verify-batch.mjs [results-file]
//
// For each market: the stored record's ed25519 signature verifies; the requestHash recomputes from the
// claim; on chain, PredgeAgentValidator.getValidationStatus(requestHash) returns the same score and a
// responseHash equal to keccak256 of the signed record bytes; and the score matches the record
// (100 if the on-chain outcome equals the first disputed proposal, else 0).
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { verifyAttestation } from "./fetch-records.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || path.join(HERE, readFileSync(path.join(HERE, "INDEX"), "utf8").trim().split("\n").pop());
const res = JSON.parse(readFileSync(file, "utf8"));
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "https://testnet-rpc.monad.xyz", undefined, { staticNetwork: ethers.Network.from(10143n), batchMaxCount: 1 });
const c = new ethers.Contract(res.contract, ["function getValidationStatus(bytes32) view returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string tag, uint256 lastUpdate)"], provider);
const canon = (v) => (v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`);

let ok = 0, bad = 0;
for (const v of res.verdicts) {
  const rec = JSON.parse(readFileSync(path.join(HERE, "records", `${v.market_id}.json`), "utf8")).attestation;
  const p = JSON.parse(rec.canonical);
  const claim = { kind: "predge-settlement-claim-v1", platform: "polymarket", market_id: p.market_id, uma_question_id: p.uma_question_id, claim: "final on-chain outcome equals the first disputed proposal", proposal: p.disputes[0].disputed_proposal };
  const s = await c.getValidationStatus(v.requestHash);
  const checks = {
    signature: verifyAttestation({ ...rec, payload: p }),
    requestHash: ethers.keccak256(ethers.toUtf8Bytes(canon(claim))) === v.requestHash,
    responseHash: s.responseHash === ethers.keccak256(ethers.toUtf8Bytes(rec.canonical)),
    score: Number(s.response) === (p.onchain_resolution.outcome === claim.proposal ? 100 : 0),
    validator: s.validatorAddress === res.validator,
  };
  if (Object.values(checks).every(Boolean)) ok++; else { bad++; console.log(`FAIL ${v.market_id} ${JSON.stringify(checks)}`); }
}
console.log(`${ok}/${res.verdicts.length} verdicts verified on Monad testnet (${res.contract})${bad ? `, ${bad} failed` : ""}`);
process.exit(bad ? 1 : 0);
