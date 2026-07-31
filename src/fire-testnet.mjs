// OWNER-RUN ONLY. Broadcasts the Predge validationRequest + validationResponse
// to a real ERC-8004 Validation Registry on a TESTNET. Requires a funded key and
// a registered agentId. Refuses mainnet; refuses without explicit confirmation.
// The agent (owner of AGENT_ID in the Identity Registry) == the validator here,
// so a single key does both steps for a self-contained demo.
//
// Required env:
//   RPC_URL              testnet RPC (e.g. Base Sepolia, Sepolia, Arc testnet)
//   PRIVATE_KEY          funded key; MUST own AGENT_ID and be the validator addr
//   VALIDATION_REGISTRY  deployed ValidationRegistry address on that chain
//   AGENT_ID             an agentId you own in the Identity Registry
//   CONFIRM_TESTNET=yes  explicit go
// Optional:
//   RESPONSE_URI (default https://data.predge.io/attest/demo)
import { ethers } from "ethers";
import { ATTEST_VERSION, ATTEST_ISSUER, signAttestation, ephemeralKeypair } from "./attest.mjs";
import { mapAttestToValidation, VALIDATION_ABI } from "./map-to-validation.mjs";

const MAINNET_CHAIN_IDS = new Set([1, 8453, 42161, 10, 137, 43114, 56, 143, 534352, 100, 42220, 167000, 59144, 5000, 1868, 1088, 295, 360]);
const need = (n) => { const v = process.env[n]; if (!v) { console.error(`FATAL: set env ${n} (see header)`); process.exit(1); } return v; };

const RPC_URL = need("RPC_URL");
const PRIVATE_KEY = need("PRIVATE_KEY");
const REGISTRY = ethers.getAddress(need("VALIDATION_REGISTRY"));
const AGENT_ID = BigInt(need("AGENT_ID"));
if (process.env.CONFIRM_TESTNET !== "yes") { console.error("FATAL: set CONFIRM_TESTNET=yes to broadcast"); process.exit(1); }

const provider = new ethers.JsonRpcProvider(RPC_URL);
const net = await provider.getNetwork();
const chainId = Number(net.chainId);
if (MAINNET_CHAIN_IDS.has(chainId)) { console.error(`REFUSING: chainId ${chainId} is MAINNET. Testnet only.`); process.exit(1); }
console.log(`chain ${chainId} (testnet) via ${RPC_URL}`);

const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const registry = new ethers.Contract(REGISTRY, VALIDATION_ABI, wallet);
console.log(`validator/agent-owner: ${wallet.address}`);

// Build a real signed attest for this run (or wire your own claim/attest here).
const { publicKey, privateKey } = ephemeralKeypair();
const conditionId = "0x" + "ab".repeat(32);
const claim = { agent_id: Number(AGENT_ID), platform: "polymarket", condition_id: conditionId, claimed_outcome: "YES" };
const payload = { version: ATTEST_VERSION, issuer: ATTEST_ISSUER, kind: "resolved-outcome-vs-claim", platform: "polymarket", subject: { condition_id: conditionId }, claim: { outcome: "YES" }, resolved: { outcome: "YES", resolved_at: new Date(0).toISOString() }, match: true, issued_at: new Date(0).toISOString() };
const attest = signAttestation(payload, privateKey, publicKey);
const responseURI = process.env.RESPONSE_URI || "https://data.predge.io/attest/demo";
const requestURI = `https://data.predge.io/claim/${AGENT_ID}/${conditionId}`;
const m = mapAttestToValidation({ attest, agentId: AGENT_ID, validatorAddress: wallet.address, claim, requestURI, responseURI, matchScore: 100 });

// Step 1: agent registers the validation request (idempotent-ish; skip if exists)
let exists = false;
try { await registry.getValidationStatus(m.requestHash); exists = true; } catch { exists = false; }
if (!exists) {
  console.log("→ validationRequest…");
  const t1 = await registry.validationRequest(wallet.address, AGENT_ID, requestURI, m.requestHash);
  console.log(`  tx ${t1.hash}`); await t1.wait();
} else {
  console.log("request already exists for this requestHash — skipping to response");
}

// Step 2: Predge (validator) writes the outcome-match response
console.log("→ validationResponse…");
const t2 = await registry.validationResponse(m.requestHash, m.matchScore, responseURI, m.responseHash, m.tag);
console.log(`  tx ${t2.hash}`); await t2.wait();

// Read back
const s = await registry.getValidationStatus(m.requestHash);
console.log("on-chain status:", { validator: s[0], agentId: s[1].toString(), response: Number(s[2]), responseHash: s[3], tag: s[4] });
console.log(`\nDONE. responseHash bound to signed attest: ${m.responseHash === s[3] ? "MATCH ✅" : "MISMATCH ❌"}`);
console.log(`Verify on the chain's explorer: tx ${t2.hash}`);
