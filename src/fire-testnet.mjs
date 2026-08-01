// OWNER-RUN ONLY. Broadcasts a real ERC-8004 flow on a TESTNET:
//   IdentityRegistry.register()  → mint an agentId you own
//   ValidationRegistry.validationRequest(...)  → commit the claim
//   ValidationRegistry.validationResponse(...) → write the outcome-match response
// One funded key does all three (agent-owner == validator for a self-contained demo).
// Refuses mainnet. Refuses without CONFIRM_TESTNET=yes.
//
// The registries are CREATE2 singletons at the SAME address on every testnet
// (from erc-8004/erc-8004-contracts README), so you only need an RPC + a funded key.
//
// Required env:
//   RPC_URL              testnet RPC (Base Sepolia: https://sepolia.base.org)
//   PRIVATE_KEY          a funded key (needs a little testnet ETH for gas)
//   CONFIRM_TESTNET=yes  explicit go
// Optional:
//   VALIDATION_REGISTRY  (default = testnet singleton below)
//   IDENTITY_REGISTRY    (default = testnet singleton below)
//   AGENT_ID             reuse an agentId you already own (else one is registered)
//   RESPONSE_URI         (default https://data.predge.io/attest/demo)
import { ethers } from "ethers";
import { ATTEST_VERSION, ATTEST_ISSUER, signAttestation, ephemeralKeypair } from "./attest.mjs";
import { mapAttestToValidation, VALIDATION_ABI } from "./map-to-validation.mjs";

// ERC-8004 testnet singletons (same address on Base Sepolia / Sepolia / Arb Sepolia / …)
const VALIDATION_REGISTRY_DEFAULT = "0x8004Cb1BF31DAf7788923b405b754f57acEB4272";
const IDENTITY_REGISTRY_DEFAULT = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const IDENTITY_ABI = [
  "function register() returns (uint256 agentId)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
];
const EXPLORER = { 84532: "https://sepolia.basescan.org/tx/", 11155111: "https://sepolia.etherscan.io/tx/", 421614: "https://sepolia.arbiscan.io/tx/", 11155420: "https://sepolia-optimism.etherscan.io/tx/" };
const MAINNET_CHAIN_IDS = new Set([1, 8453, 42161, 10, 137, 43114, 56, 143, 534352, 100, 42220, 167000, 59144, 5000, 1868, 1088, 295, 360]);
const need = (n) => { const v = process.env[n]; if (!v) { console.error(`FATAL: set env ${n} (see header)`); process.exit(1); } return v; };

const RPC_URL = need("RPC_URL");
const PRIVATE_KEY = need("PRIVATE_KEY");
if (process.env.CONFIRM_TESTNET !== "yes") { console.error("FATAL: set CONFIRM_TESTNET=yes to broadcast"); process.exit(1); }
const VALIDATION_REGISTRY = ethers.getAddress(process.env.VALIDATION_REGISTRY || VALIDATION_REGISTRY_DEFAULT);
const IDENTITY_REGISTRY = ethers.getAddress(process.env.IDENTITY_REGISTRY || IDENTITY_REGISTRY_DEFAULT);

const provider = new ethers.JsonRpcProvider(RPC_URL);
const chainId = Number((await provider.getNetwork()).chainId);
if (MAINNET_CHAIN_IDS.has(chainId)) { console.error(`REFUSING: chainId ${chainId} is MAINNET. Testnet only.`); process.exit(1); }
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
console.log(`chain ${chainId} (testnet) · validator/agent-owner ${wallet.address}`);
const bal = await provider.getBalance(wallet.address);
console.log(`gas balance: ${ethers.formatEther(bal)} ETH`);
if (bal === 0n) console.warn("  ⚠ zero balance — fund with testnet ETH (Base Sepolia faucet: https://www.alchemy.com/faucets/base-sepolia) or the tx will revert on gas.");

// 1) agentId — reuse or register one
let agentId;
if (process.env.AGENT_ID) {
  agentId = BigInt(process.env.AGENT_ID);
  console.log(`using existing agentId ${agentId}`);
} else {
  const identity = new ethers.Contract(IDENTITY_REGISTRY, IDENTITY_ABI, wallet);
  console.log("→ IdentityRegistry.register()…");
  const t0 = await identity.register();
  console.log(`  tx ${t0.hash}`);
  const rc = await t0.wait();
  const ev = rc.logs.map((l) => { try { return identity.interface.parseLog(l); } catch { return null; } }).find((p) => p?.name === "Registered");
  agentId = ev ? ev.args.agentId : null;
  if (agentId == null) { console.error("could not parse agentId from Registered event"); process.exit(1); }
  console.log(`  registered agentId ${agentId}`);
}

// 2) build a signed resolved-outcome-vs-claim attest + map to the registry calls
const { publicKey, privateKey } = ephemeralKeypair();
const conditionId = "0x" + "ab".repeat(32);
const claim = { agent_id: Number(agentId), platform: "polymarket", condition_id: conditionId, claimed_outcome: "YES" };
const payload = { version: ATTEST_VERSION, issuer: ATTEST_ISSUER, kind: "resolved-outcome-vs-claim", platform: "polymarket", subject: { condition_id: conditionId }, claim: { outcome: "YES" }, resolved: { outcome: "YES", resolved_at: new Date(0).toISOString() }, match: true, issued_at: new Date(0).toISOString() };
const attest = signAttestation(payload, privateKey, publicKey);
const responseURI = process.env.RESPONSE_URI || "https://data.predge.io/attest/demo";
const requestURI = `https://data.predge.io/claim/${agentId}/${conditionId}`;
const m = mapAttestToValidation({ attest, agentId, validatorAddress: wallet.address, claim, requestURI, responseURI, matchScore: 100 });

const registry = new ethers.Contract(VALIDATION_REGISTRY, VALIDATION_ABI, wallet);
// 3) validationRequest (agent commits the claim; skip if it already exists)
let exists = false;
try { await registry.getValidationStatus(m.requestHash); exists = true; } catch { exists = false; }
if (!exists) {
  console.log("→ validationRequest…");
  const t1 = await registry.validationRequest(wallet.address, agentId, requestURI, m.requestHash);
  console.log(`  tx ${t1.hash}`); await t1.wait();
} else { console.log("request already exists — skipping to response"); }

// 4) validationResponse (Predge writes the outcome-match score)
console.log("→ validationResponse…");
const t2 = await registry.validationResponse(m.requestHash, m.matchScore, responseURI, m.responseHash, m.tag);
console.log(`  tx ${t2.hash}`); await t2.wait();

// 5) read back + verify the on-chain record is bound to the signed attest
const s = await registry.getValidationStatus(m.requestHash);
console.log("on-chain:", { validator: s[0], agentId: s[1].toString(), response: Number(s[2]), responseHash: s[3], tag: s[4] });
console.log(`responseHash bound to signed attest: ${m.responseHash === s[3] ? "MATCH ✅" : "MISMATCH ❌"}`);
const link = EXPLORER[chainId];
console.log(`\nDONE. validationResponse tx: ${link ? link + t2.hash : t2.hash}`);
console.log("↑ cite this explorer link in the ERC-8004 / Ethereum Magicians post.");
