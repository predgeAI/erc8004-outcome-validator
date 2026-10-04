// Monad TESTNET smoke run: one real accountability loop on the deployed Predge contracts, plus the
// same verdict written into the canonical ERC-8004 ValidationRegistry on Monad testnet.
//
//   node monad/smoke.mjs                                  read-only preflight, nothing is sent
//   CONFIRM_TESTNET=yes node monad/smoke.mjs --send       broadcast
//
// Keys come from a KEY=VALUE file (default ~/.predge-monad/monad-testnet.env, mode 600):
// PRIVATE_KEY (client + validator) and PROVIDER_PRIVATE_KEY (a separate provider key).
// Keys are never printed. Refuses any chain id other than 10143 (Monad testnet).
//
// Predge contracts (addresses from monad/deployment.json):
//   0  fetch the signed Settlement Risk evidence pack, verify ed25519 + sha256 offline
//   1  PredgeAgentValidator.validationRequest   requestHash = keccak256(signed canonical bytes)
//   2  AgentJob.createJob                       client escrows MON, evaluator = validator
//   3  PredgeValidatorBond.stakeAndCommit       validator bonds MON behind sha256(deliverable)
//   4  AgentJob.submit                          the PROVIDER key commits the deliverable
//   5  PredgeAgentValidator.validationResponse  verdict 100, responseHash = keccak256(verdict)
//   6  PredgeValidatorBond.recordScore          verdict recorded behind the bond, 1-day dispute window
//   7  AgentJob.complete                        escrow released, reason = responseHash
//   8  PredgeSettlement.payForRoute             pay-per-call receipt
//      read-only: wouldSlash == false, challenge() simulated -> reverts VerdictHonest()
// Canonical ERC-8004 registries (CREATE2 singletons, live on Monad testnet):
//   9  IdentityRegistry.register -> agentId
//  10  ValidationRegistry.validationRequest
//  11  ValidationRegistry.validationResponse, read back, responseHash bound to the signed attestation
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { mapAttestToValidation, VALIDATION_ABI } from "../src/map-to-validation.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHAIN_ID = 10143n;
const RPC = process.env.RPC_URL || "https://testnet-rpc.monad.xyz";
const EXPLORER = "https://testnet.monadvision.com";
const PACK_URL = process.env.PACK_URL || "https://data.predge.io/samples/pm-2169995-microstrategy-may31.pack.json";
const VALIDATION_REGISTRY = "0x8004Cb1BF31DAf7788923b405b754f57acEB4272";
const IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const VALUES = { bond: ethers.parseEther("0.01"), escrow: ethers.parseEther("0.005"), pay: ethers.parseEther("0.001"), providerGas: ethers.parseEther("0.05") };
const SEND = process.argv.includes("--send");
if (SEND && process.env.CONFIRM_TESTNET !== "yes") { console.error("Refusing: --send needs CONFIRM_TESTNET=yes"); process.exit(2); }

const keyFile = process.env.PREDGE_ENV_FILE || path.join(os.homedir(), ".predge-monad/monad-testnet.env");
const env = Object.fromEntries(readFileSync(keyFile, "utf8").split("\n").map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2]]));
const deployFile = path.join(HERE, "deployment.json");
if (!existsSync(deployFile)) { console.error(`missing ${deployFile}: deploy first`); process.exit(1); }
const dep = JSON.parse(readFileSync(deployFile, "utf8"));
const A = Object.fromEntries(Object.entries(dep.contracts).map(([k, v]) => [k, ethers.getAddress(v.address)]));

const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: ethers.Network.from(CHAIN_ID), cacheTimeout: -1 });
if (BigInt(await provider.send("eth_chainId", [])) !== CHAIN_ID) { console.error("RPC is not Monad testnet (10143); refusing"); process.exit(1); }
const wallet = new ethers.Wallet(env.PRIVATE_KEY, provider);
const providerWallet = new ethers.Wallet(env.PROVIDER_PRIVATE_KEY, provider);
if (wallet.address === providerWallet.address) throw new Error("provider key equals validator key; refusing");
if (wallet.address !== ethers.getAddress(dep.validator)) throw new Error(`key derives ${wallet.address}, deployment validator is ${dep.validator}`);

const VALIDATOR_ABI = [
  "function validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash)",
  "function validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)",
];
const BOND_ABI = [
  "function stakeAndCommit(bytes32 requestHash, bytes32 expected, uint256 jobId) payable",
  "function recordScore(bytes32 requestHash, uint8 score)",
  "function challenge(bytes32 requestHash)",
  "function wouldSlash(bytes32 requestHash) view returns (bool)",
  "function stakes(bytes32) view returns (bytes32 expected, uint96 bond, uint64 stakedAt, uint8 score, bool scored, bool closed, uint256 jobId, uint64 scoredAt)",
  "error VerdictHonest()",
];
const JOB_ABI = [
  "function createJob(address provider, address evaluator, bytes32 specHash) payable returns (uint256)",
  "function submit(uint256 jobId, bytes32 deliverable, bytes optParams)",
  "function complete(uint256 jobId, bytes32 reason, bytes optParams)",
  "event JobCreated(uint256 indexed jobId, address indexed client, address indexed evaluator, address provider, uint96 escrow, bytes32 specHash)",
];
const SETTLEMENT_ABI = ["function payForRoute(bytes32 route, string meta) payable"];
const IDENTITY_ABI = ["function register() returns (uint256 agentId)", "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)"];

const canon = (v) => (v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`);
const tx = (h) => `${EXPLORER}/tx/${h}`;
const fmt = (w) => `${ethers.formatEther(w)} MON`;

console.log(`\n=== Predge smoke run on Monad testnet (${CHAIN_ID}) ${SEND ? "SEND" : "PREFLIGHT, nothing sent"} ===`);
console.log(`validator/client ${wallet.address}  ${fmt(await provider.getBalance(wallet.address))}`);
console.log(`provider         ${providerWallet.address}  ${fmt(await provider.getBalance(providerWallet.address))}`);
for (const [n, a] of Object.entries(A)) {
  const c = await provider.getCode(a);
  console.log(`${c === "0x" ? "MISSING" : "live   "} ${n.padEnd(22)} ${a}`);
  if (c === "0x") process.exit(1);
}

// SKIP_ERC8004=1 only for a local rehearsal chain that has no ERC-8004 singletons.
const SKIP_ERC8004 = process.env.SKIP_ERC8004 === "1";
if (!SKIP_ERC8004) for (const [n, a] of [["ERC-8004 IdentityRegistry", IDENTITY_REGISTRY], ["ERC-8004 ValidationRegistry", VALIDATION_REGISTRY]]) {
  const c = await provider.getCode(a);
  console.log(`${c === "0x" ? "MISSING" : "live   "} ${n.padEnd(22)} ${a}`);
  if (c === "0x") process.exit(1);
}

// 0. signed evidence pack, verified offline
const pack = await (await fetch(PACK_URL)).json();
const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(pack.public_key, "hex")]);
const sigOk = crypto.verify(null, Buffer.from(pack.canonical, "utf8"), crypto.createPublicKey({ key: spki, format: "der", type: "spki" }), Buffer.from(pack.signature, "hex"));
const sha = crypto.createHash("sha256").update(pack.canonical).digest("hex");
const payloadOk = canon(pack.payload) === pack.canonical;
console.log(`\npack ${PACK_URL}\ned25519 ${sigOk} | sha256 == content_hash ${sha === pack.content_hash} | payload == canonical ${payloadOk}`);
if (!sigOk || sha !== pack.content_hash || !payloadOk) throw new Error("evidence pack failed offline verification; refusing to record a verdict");
const requestHash = ethers.keccak256(ethers.toUtf8Bytes(pack.canonical));
const expected = "0x" + sha;
const verdict = { requestHash, verified: true, signer: pack.public_key, pack: PACK_URL, contentHash: pack.content_hash, issuedAt: pack.payload.issued_at };
const responseHash = ethers.keccak256(ethers.toUtf8Bytes(canon(verdict)));
console.log(`requestHash  ${requestHash}\nresponseHash ${responseHash}`);
if (!SEND) { console.log("\nPREFLIGHT OK. To broadcast: CONFIRM_TESTNET=yes node monad/smoke.mjs --send"); process.exit(0); }

// explicit nonce tracking: a load-balanced RPC can report a stale nonce right after a receipt
const signer = new ethers.NonceManager(wallet);
const providerSigner = new ethers.NonceManager(providerWallet);
const validator = new ethers.Contract(A.PredgeAgentValidator, VALIDATOR_ABI, signer);
const bond = new ethers.Contract(A.PredgeValidatorBond, BOND_ABI, signer);
const job = new ethers.Contract(A.AgentJob, JOB_ABI, signer);
const settlement = new ethers.Contract(A.PredgeSettlement, SETTLEMENT_ABI, signer);
const receipts = [];
async function send(step, fn) {
  const t = await fn();
  const r = await t.wait();
  console.log(`${step.padEnd(38)} ${r.status === 1 ? "ok  " : "FAIL"} ${tx(t.hash)}`);
  receipts.push({ step, tx: t.hash, url: tx(t.hash), status: r.status, block: r.blockNumber });
  if (r.status !== 1) throw new Error(`${step} reverted`);
  return r;
}

console.log("");
const reqURI = PACK_URL;
await send("1 validationRequest (Predge)", () => validator.validationRequest(wallet.address, 0, reqURI, requestHash));
if ((await provider.getBalance(providerWallet.address)) < VALUES.providerGas / 2n)
  await send("  fund provider gas", () => signer.sendTransaction({ to: providerWallet.address, value: VALUES.providerGas }));
const created = await send("2 createJob (escrow)", () => job.createJob(providerWallet.address, wallet.address, requestHash, { value: VALUES.escrow }));
const jobId = created.logs.map((l) => { try { return job.interface.parseLog(l); } catch { return null; } }).find((l) => l?.name === "JobCreated").args.jobId;
await send("3 stakeAndCommit (bond)", () => bond.stakeAndCommit(requestHash, expected, jobId, { value: VALUES.bond }));
await send("4 submit (provider key)", () => job.connect(providerSigner).submit(jobId, expected, "0x"));
await send("5 validationResponse (verdict 100)", () => validator.validationResponse(requestHash, 100, reqURI, responseHash, "predge:settlement-evidence-verified"));
await send("6 recordScore (verdict behind bond)", () => bond.recordScore(requestHash, 100));
await send("7 complete (escrow released)", () => job.complete(jobId, responseHash, "0x"));
await send("8 payForRoute (pay-per-call)", () => settlement.payForRoute(ethers.keccak256(ethers.toUtf8Bytes("/v1/settlement-risk")), requestHash, { value: VALUES.pay }));

const would = await bond.wouldSlash(requestHash);
let challengeRevert;
try { await bond.connect(providerWallet).challenge.staticCall(requestHash); challengeRevert = "DID NOT REVERT"; }
catch (e) { challengeRevert = e.revert?.name || e.shortMessage || "reverted"; }
const st = await bond.stakes(requestHash);
console.log(`\nbond: ${fmt(st.bond)} staked, score ${st.score}, wouldSlash ${would}, challenge() simulated -> ${challengeRevert}`);
console.log(`reclaimable after ${new Date((Number(st.scoredAt) + 86400) * 1000).toISOString()} (window counted from the verdict)`);

// Canonical ERC-8004 registries on Monad testnet
let agentId = null, m = { requestHash: null, responseHash: null }, bound = null;
if (!SKIP_ERC8004) {
const identity = new ethers.Contract(IDENTITY_REGISTRY, IDENTITY_ABI, signer);
const reg = await send("9 ERC-8004 IdentityRegistry.register", () => identity.register());
agentId = reg.logs.map((l) => { try { return identity.interface.parseLog(l); } catch { return null; } }).find((p) => p?.name === "Registered").args.agentId;
const attest = { canonical: pack.canonical, signature: pack.signature, public_key: pack.public_key };
m = mapAttestToValidation({ attest, agentId, validatorAddress: wallet.address, claim: { agent_id: Number(agentId), pack: PACK_URL, content_hash: pack.content_hash }, requestURI: reqURI, responseURI: reqURI, matchScore: 100 });
const registry = new ethers.Contract(VALIDATION_REGISTRY, VALIDATION_ABI, signer);
await send("10 ERC-8004 validationRequest", () => registry.validationRequest(wallet.address, agentId, reqURI, m.requestHash));
await send("11 ERC-8004 validationResponse", () => registry.validationResponse(m.requestHash, m.matchScore, reqURI, m.responseHash, m.tag));
const s = await registry.getValidationStatus(m.requestHash);
bound = s[3] === m.responseHash;
console.log(`ERC-8004 on-chain: agentId ${s[1]}, response ${s[2]}, tag ${s[4]}, responseHash bound to signed attestation: ${bound}`);
if (!bound) throw new Error("ERC-8004 responseHash does not match the signed attestation");
}

const out = path.join(HERE, `smoke-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(out, JSON.stringify({
  chain: "monad-testnet", chainId: 10143, ranAt: new Date().toISOString(), explorer: EXPLORER, pack: PACK_URL, packKeyNotice: pack.key_notice,
  requestHash, expectedSha256: expected, responseHash, jobId: jobId.toString(),
  parties: { client: wallet.address, validator: wallet.address, provider: providerWallet.address },
  values: Object.fromEntries(Object.entries(VALUES).map(([k, v]) => [k, ethers.formatEther(v)])),
  bond: { wouldSlash: would, challengeSimulated: challengeRevert, scoredAt: Number(st.scoredAt) },
  erc8004: SKIP_ERC8004 ? null : { agentId: agentId.toString(), requestHash: m.requestHash, responseHash: m.responseHash, bound },
  receipts,
}, null, 2) + "\n");
console.log(`\nreceipts -> ${path.relative(process.cwd(), out)}`);
