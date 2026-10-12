// Monad MAINNET (chain 143): one Predge verdict written into the canonical ERC-8004 registries.
//
//   node monad/mainnet/verdict.mjs --snapshot   fetch + verify a signed record, save it next to this script
//   node monad/mainnet/verdict.mjs              read-only dry run against mainnet, nothing is sent
//   CONFIRM_MAINNET=yes node monad/mainnet/verdict.mjs --send
//
// Steps on --send (validator key from ~/.predge-monad/monad-testnet.env, never printed):
//   1  IdentityRegistry.register        -> agentId owned by the Predge validator address
//   2  ValidationRegistry.validationRequest(validator, agentId, requestURI, requestHash)
//   3  ValidationRegistry.validationResponse(requestHash, 100, responseURI, responseHash, tag)
//      responseHash = keccak256(signed canonical bytes of the saved record), read back and checked.
// Registries (ERC-8004 v2.0.0, same addresses on Ethereum, Base, Arbitrum One, Celo, Arc):
//   IdentityRegistry   0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
//   ValidationRegistry 0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { mapAttestToValidation, VALIDATION_ABI } from "../../src/map-to-validation.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHAIN_ID = 143n;
const RPC = process.env.RPC_URL || "https://rpc.monad.xyz";
const EXPLORER = "https://monadvision.com";
const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const VALIDATION_REGISTRY = "0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58";
const VALIDATOR = "0x9F0Af03C5695b72903c03852f7Dd4Fe5A0d49Fc9";
const MARKET = process.env.MARKET_ID || "1112268";
const KEYS_URL = "https://api.predge.io/.well-known/predge-keys.json";
const RECORD_FILE = path.join(HERE, `record-${MARKET}.json`);
const RECORD_URI = `https://raw.githubusercontent.com/predgeAI/erc8004-outcome-validator/main/monad/mainnet/record-${MARKET}.json`;
const SEND = process.argv.includes("--send");
if (SEND && process.env.CONFIRM_MAINNET !== "yes") { console.error("Refusing: --send needs CONFIRM_MAINNET=yes"); process.exit(2); }

const canon = (v) => (v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`);
const fmt = (w) => `${ethers.formatEther(w)} MON`;

async function verify(att) {
  const keys = await (await fetch(KEYS_URL)).json();
  const k = keys.keys.find((x) => x.public_key === att.public_key && x.active && x.role === "attestation");
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(att.public_key, "hex")]);
  const sigOk = crypto.verify(null, Buffer.from(att.canonical, "utf8"), crypto.createPublicKey({ key: spki, format: "der", type: "spki" }), Buffer.from(att.signature, "hex"));
  const shaOk = crypto.createHash("sha256").update(att.canonical).digest("hex") === att.content_hash;
  const payloadOk = canon(att.payload) === att.canonical;
  const marketOk = String(att.payload?.market?.market_id ?? att.payload?.market_id) === MARKET;
  console.log(`record market ${MARKET}: key listed ${!!k} | ed25519 ${sigOk} | sha256 == content_hash ${shaOk} | payload == canonical ${payloadOk} | market ${marketOk}`);
  if (!k || !sigOk || !shaOk || !payloadOk || !marketOk) throw new Error("signed record failed verification; refusing");
}

if (process.argv.includes("--snapshot")) {
  const rec = await (await fetch(`https://api.predge.io/v1/settlement-risk/${MARKET}`)).json();
  await verify(rec.attestation);
  writeFileSync(RECORD_FILE, JSON.stringify(rec.attestation, null, 2) + "\n");
  console.log(`saved ${path.relative(process.cwd(), RECORD_FILE)}`);
  process.exit(0);
}

if (!existsSync(RECORD_FILE)) { console.error("no saved record: run with --snapshot first"); process.exit(1); }
const att = JSON.parse(readFileSync(RECORD_FILE, "utf8"));
await verify(att);
const published = await fetch(RECORD_URI).then((r) => (r.ok ? r.text() : null)).catch(() => null);
const publishedOk = published !== null && JSON.parse(published).canonical === att.canonical;
console.log(`record published at ${RECORD_URI}: ${publishedOk}`);
if (!publishedOk) throw new Error("push the saved record first, so requestURI resolves to the same bytes");

const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: ethers.Network.from(CHAIN_ID) });
if (BigInt(await provider.send("eth_chainId", [])) !== CHAIN_ID) { console.error("RPC is not Monad mainnet (143); refusing"); process.exit(1); }
for (const [n, a] of [["IdentityRegistry", IDENTITY_REGISTRY], ["ValidationRegistry", VALIDATION_REGISTRY]]) {
  if ((await provider.getCode(a)) === "0x") throw new Error(`${n} missing at ${a}`);
}
const IDENTITY_ABI = ["function register() returns (uint256 agentId)", "function getVersion() view returns (string)", "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)"];
const identityRO = new ethers.Contract(IDENTITY_REGISTRY, IDENTITY_ABI, provider);
const registryRO = new ethers.Contract(VALIDATION_REGISTRY, [...VALIDATION_ABI, "function getVersion() view returns (string)"], provider);
console.log(`\n=== Monad mainnet (${CHAIN_ID}) ${SEND ? "SEND" : "DRY RUN, nothing sent"} ===`);
console.log(`IdentityRegistry v${await identityRO.getVersion()} ${IDENTITY_REGISTRY}\nValidationRegistry v${await registryRO.getVersion()} ${VALIDATION_REGISTRY}`);
const bal = await provider.getBalance(VALIDATOR);
const fee = await provider.getFeeData();
console.log(`validator ${VALIDATOR}  ${fmt(bal)} | gas price ${ethers.formatUnits(fee.gasPrice, "gwei")} gwei`);
const nextId = await identityRO.register.staticCall({ from: VALIDATOR });
const gasReg = await identityRO.register.estimateGas({ from: VALIDATOR });
// the request and response need the agentId to exist, so they are priced from the testnet run (same v2 code)
const GAS_REQ = 200000n, GAS_RESP = 200000n;
const worst = (gasReg + GAS_REQ + GAS_RESP) * (fee.maxFeePerGas ?? fee.gasPrice);
console.log(`register() would mint agentId ${nextId} (gas ${gasReg}); request+response budgeted at ${GAS_REQ + GAS_RESP} gas`);
console.log(`worst-case cost ${fmt(worst)}`);
const m = mapAttestToValidation({ attest: att, agentId: nextId, validatorAddress: VALIDATOR, claim: { agent_id: Number(nextId), market_id: MARKET, record: RECORD_URI, content_hash: att.content_hash }, requestURI: RECORD_URI, responseURI: RECORD_URI, matchScore: 100 });
console.log(`requestHash  ${m.requestHash}\nresponseHash ${m.responseHash} (keccak256 of the signed canonical bytes)\ntag ${m.tag} | response 100`);
if (worst > bal) throw new Error("balance below worst-case cost");
if (!SEND) { console.log("\nDRY RUN OK. To broadcast: CONFIRM_MAINNET=yes node monad/mainnet/verdict.mjs --send"); process.exit(0); }

const env = Object.fromEntries(readFileSync(process.env.PREDGE_ENV_FILE || path.join(os.homedir(), ".predge-monad/monad-testnet.env"), "utf8").split("\n").map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((x) => [x[1], x[2]]));
const wallet = new ethers.Wallet(env.PRIVATE_KEY, provider);
if (wallet.address !== VALIDATOR) throw new Error(`key derives ${wallet.address}, expected ${VALIDATOR}`);
const signer = new ethers.NonceManager(wallet);
const receipts = [];
async function send(step, fn) {
  const t = await fn();
  const r = await t.wait();
  console.log(`${step.padEnd(34)} ${r.status === 1 ? "ok  " : "FAIL"} ${EXPLORER}/tx/${t.hash}`);
  receipts.push({ step, tx: t.hash, url: `${EXPLORER}/tx/${t.hash}`, status: r.status, block: r.blockNumber, gasUsed: r.gasUsed.toString() });
  if (r.status !== 1) throw new Error(`${step} failed`);
  return r;
}
const identity = identityRO.connect(signer);
const reg = await send("1 IdentityRegistry.register", () => identity.register());
const agentId = reg.logs.map((l) => { try { return identity.interface.parseLog(l); } catch { return null; } }).find((p) => p?.name === "Registered").args.agentId;
const mm = mapAttestToValidation({ attest: att, agentId, validatorAddress: VALIDATOR, claim: { agent_id: Number(agentId), market_id: MARKET, record: RECORD_URI, content_hash: att.content_hash }, requestURI: RECORD_URI, responseURI: RECORD_URI, matchScore: 100 });
const registry = registryRO.connect(signer);
await send("2 ValidationRegistry.validationRequest", () => registry.validationRequest(VALIDATOR, agentId, RECORD_URI, mm.requestHash));
await send("3 ValidationRegistry.validationResponse", () => registry.validationResponse(mm.requestHash, 100, RECORD_URI, mm.responseHash, mm.tag));
const s = await registryRO.getValidationStatus(mm.requestHash);
const bound = s[3] === mm.responseHash;
console.log(`on chain: validator ${s[0]}, agentId ${s[1]}, response ${s[2]}, tag ${s[4]}, responseHash bound to the signed record: ${bound}`);
const out = path.join(HERE, `verdict-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(out, JSON.stringify({ chain: "monad", chainId: 143, ranAt: new Date().toISOString(), explorer: EXPLORER, identityRegistry: IDENTITY_REGISTRY, validationRegistry: VALIDATION_REGISTRY, validator: VALIDATOR, market: MARKET, record: RECORD_URI, contentHash: att.content_hash, agentId: agentId.toString(), requestHash: mm.requestHash, responseHash: mm.responseHash, tag: mm.tag, bound, receipts }, null, 2) + "\n");
console.log(`receipts -> ${path.relative(process.cwd(), out)}`);
if (!bound) process.exit(1);
