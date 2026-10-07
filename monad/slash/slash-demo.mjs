// Slash demo on Monad TESTNET: a dishonest bonded verdict from a separate validator key is challenged
// by a third party and the bond is slashed to the challenger.
//
//   node monad/slash/slash-demo.mjs                                read-only preflight
//   CONFIRM_TESTNET=yes node monad/slash/slash-demo.mjs --send     broadcast
//
// Story. The acceptance test is "deliver Predge's signed Settlement Risk record for Polymarket market
// 2169995 byte for byte": expected = sha256(signed canonical bytes). The provider delivers a tampered
// copy (the on-chain outcome changed from No to Yes). The validator records verdict 100 anyway. Both
// sides of the comparison are now on chain, written by two different keys, so anyone can call
// challenge(): the contract compares the provider's committed deliverable with the validator's
// committed test, sees the contradiction and pays the bond to the challenger. This works within the
// dispute window counted from the verdict; after the window an unchallenged validator could reclaim.
//
// Parties (all separate keys, from ~/.predge-monad/monad-metropolis.env, never printed):
//   owner/client   PRIVATE_KEY in ~/.predge-monad/monad-testnet.env: deploys this demo's bond, escrows the job
//   validator      SLASH_VALIDATOR  (the dishonest one; this bond instance names it as validator)
//   provider       SLASH_PROVIDER
//   challenger     SLASH_CHALLENGER
// The bond instance is a fresh deployment of the same PredgeValidatorBond source (monad/contracts/),
// bound to the live AgentJob, so the main bond and its validator are untouched.
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { compile } from "../contracts/deploy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RPC = process.env.RPC_URL || "https://testnet-rpc.monad.xyz";
const EXPLORER = "https://testnet.monadvision.com";
const MARKET = process.env.MARKET || "2169995";
const SEND = process.argv.includes("--send");
if (SEND && process.env.CONFIRM_TESTNET !== "yes") { console.error("Refusing: --send needs CONFIRM_TESTNET=yes"); process.exit(2); }
const VALUES = { bond: ethers.parseEther("0.01"), escrow: ethers.parseEther("0.002"), gas: ethers.parseEther("0.03") };

const readEnv = (f) => Object.fromEntries(readFileSync(f, "utf8").split("\n").map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2]]));
const env = { ...readEnv(process.env.PREDGE_ENV_FILE || path.join(os.homedir(), ".predge-monad/monad-testnet.env")), ...readEnv(process.env.PREDGE_AGENT_ENV_FILE || path.join(os.homedir(), ".predge-monad/monad-metropolis.env")) };
const dep = JSON.parse(readFileSync(path.join(HERE, "..", "deployment.json"), "utf8"));
const AGENT_JOB = ethers.getAddress(dep.contracts.AgentJob.address);

const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: ethers.Network.from(10143n), cacheTimeout: -1 });
if (BigInt(await provider.send("eth_chainId", [])) !== 10143n) throw new Error("RPC is not Monad testnet (10143)");
const owner = new ethers.NonceManager(new ethers.Wallet(env.PRIVATE_KEY, provider));
const W = (k) => new ethers.NonceManager(new ethers.Wallet(env[`${k}_PRIVATE_KEY`], provider));
const validator = W("SLASH_VALIDATOR"), prov = W("SLASH_PROVIDER"), challenger = W("SLASH_CHALLENGER");
const addr = async (s) => s.getAddress();
const parties = { owner: await addr(owner), validator: await addr(validator), provider: await addr(prov), challenger: await addr(challenger) };
if (new Set(Object.values(parties)).size !== 4) throw new Error("parties must be four different keys");

const JOB_ABI = [
  "function createJob(address provider, address evaluator, bytes32 specHash) payable returns (uint256)",
  "function submit(uint256 jobId, bytes32 deliverable, bytes optParams)",
  "function jobs(uint256) view returns (address client, address provider, address evaluator, uint96 escrow, bytes32 specHash, bytes32 deliverable, bytes32 reason, uint8 state)",
  "event JobCreated(uint256 indexed jobId, address indexed client, address indexed evaluator, address provider, uint96 escrow, bytes32 specHash)",
];

// ---- the evidence: Predge's signed record, and a tampered copy ----
const rec = await (await fetch(`https://api.predge.io/v1/settlement-risk/${MARKET}`)).json();
const a = rec.attestation;
const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(a.public_key, "hex")]);
const sigOk = crypto.verify(null, Buffer.from(a.canonical), crypto.createPublicKey({ key: spki, format: "der", type: "spki" }), Buffer.from(a.signature, "hex"));
if (!sigOk) throw new Error("record signature failed");
const truth = JSON.parse(a.canonical).onchain_resolution.outcome;
const lie = truth === "No" ? "Yes" : "No";
const tampered = a.canonical.replace(`"onchain_resolution":{"outcome":"${truth}"}`, `"onchain_resolution":{"outcome":"${lie}"}`);
if (tampered === a.canonical) throw new Error("could not build the tampered copy");
const runTag = new Date().toISOString();
const requestHash = ethers.keccak256(ethers.toUtf8Bytes(`${a.canonical}\n#slash-demo=${runTag}`));
const sha = (s) => "0x" + crypto.createHash("sha256").update(s).digest("hex");
const expected = sha(a.canonical), delivered = sha(tampered);
console.log(`market ${MARKET}: signed record ed25519 ${sigOk}, on-chain outcome ${truth}; tampered copy says ${lie}`);
console.log(`expected (validator commits) ${expected}\ndelivered (provider submits) ${delivered}`);
console.log(`parties ${JSON.stringify(parties)}`);
console.log(`owner balance ${ethers.formatEther(await provider.getBalance(parties.owner))} MON`);
if (!SEND) { console.log("PREFLIGHT OK. To broadcast: CONFIRM_TESTNET=yes node monad/slash/slash-demo.mjs --send"); process.exit(0); }

const receipts = [];
async function step(name, signer, fn) {
  const t = await fn();
  const r = await t.wait();
  console.log(`${name.padEnd(44)} ${r.status === 1 ? "ok  " : "FAIL"} ${EXPLORER}/tx/${t.hash}`);
  receipts.push({ step: name, from: await signer.getAddress(), tx: t.hash, url: `${EXPLORER}/tx/${t.hash}`, block: r.blockNumber, status: r.status, gasUsed: r.gasUsed.toString() });
  if (r.status !== 1) throw new Error(`${name} reverted`);
  return r;
}

// 0. a fresh bond instance that names the dishonest validator
const { abi, bytecode } = compile("PredgeValidatorBond");
const factory = new ethers.ContractFactory(abi, bytecode, owner);
const dtx = await factory.getDeployTransaction(parties.validator, AGENT_JOB, 86400n);
const dgas = await provider.estimateGas({ ...dtx, from: parties.owner });
const bondC = await factory.deploy(parties.validator, AGENT_JOB, 86400n, { gasLimit: (dgas * 110n) / 100n });
const dr = await bondC.deploymentTransaction().wait();
const BOND = await bondC.getAddress();
console.log(`0 deploy PredgeValidatorBond (demo instance) ${BOND} ${EXPLORER}/tx/${dr.hash}`);
receipts.push({ step: "0 deploy PredgeValidatorBond (demo instance, validator = SLASH_VALIDATOR)", from: parties.owner, tx: dr.hash, url: `${EXPLORER}/tx/${dr.hash}`, block: dr.blockNumber, status: dr.status, gasUsed: dr.gasUsed.toString() });

const bond = new ethers.Contract(BOND, abi, provider);
const job = new ethers.Contract(AGENT_JOB, JOB_ABI, provider);
const lim = async (c, fn, args, from, value) => ((await c[fn].estimateGas(...args, { from, value })) * 120n) / 100n;

for (const [k, v] of [["validator", VALUES.bond + VALUES.gas], ["provider", VALUES.gas], ["challenger", VALUES.gas]])
  await step(`  fund ${k} gas`, owner, () => owner.sendTransaction({ to: parties[k], value: v, gasLimit: 21000n }));

const created = await step("1 createJob (client escrows, evaluator = validator)", owner, async () =>
  job.connect(owner).createJob(parties.provider, parties.validator, requestHash, { value: VALUES.escrow, gasLimit: await lim(job, "createJob", [parties.provider, parties.validator, requestHash], parties.owner, VALUES.escrow) }));
const jobId = created.logs.map((l) => { try { return job.interface.parseLog(l); } catch { return null; } }).find((l) => l?.name === "JobCreated").args.jobId;
await step("2 stakeAndCommit (validator bonds behind the test)", validator, async () =>
  bond.connect(validator).stakeAndCommit(requestHash, expected, jobId, { value: VALUES.bond, gasLimit: await lim(bond, "stakeAndCommit", [requestHash, expected, jobId], parties.validator, VALUES.bond) }));
await step("3 submit (provider delivers the tampered record)", prov, async () =>
  job.connect(prov).submit(jobId, delivered, "0x", { gasLimit: await lim(job, "submit", [jobId, delivered, "0x"], parties.provider) }));
await step("4 recordScore 100 (dishonest verdict)", validator, async () =>
  bond.connect(validator).recordScore(requestHash, 100, { gasLimit: await lim(bond, "recordScore", [requestHash, 100], parties.validator) }));
const would = await bond.wouldSlash(requestHash);
console.log(`wouldSlash ${would}`);
const before = await provider.getBalance(parties.challenger);
const ch = await step("5 challenge (third party, no arguments to forge)", challenger, async () =>
  bond.connect(challenger).challenge(requestHash, { gasLimit: await lim(bond, "challenge", [requestHash], parties.challenger) }));
const slashed = ch.logs.map((l) => { try { return bond.interface.parseLog(l); } catch { return null; } }).find((l) => l?.name === "Slashed");
const after = await provider.getBalance(parties.challenger);
const st = await bond.stakes(requestHash);
let reclaim;
try { await bond.connect(validator).reclaim.staticCall(requestHash); reclaim = "DID NOT REVERT"; } catch (e) { reclaim = e.revert?.name || e.shortMessage || "reverted"; }
const slashCount = await bond.slashCount();
console.log(`Slashed: bond ${ethers.formatEther(slashed.args.bond)} MON to ${slashed.args.challenger}, recorded score ${slashed.args.recordedScore}, delivered ${slashed.args.deliveredHash}`);
console.log(`stake closed ${st.closed}, bond left ${ethers.formatEther(st.bond)}, slashCount ${slashCount}, validator reclaim() simulated -> ${reclaim}`);
console.log(`challenger balance change ${ethers.formatEther(after - before)} MON (bond minus challenge gas)`);

const out = path.join(HERE, `slash-${runTag.replace(/[:.]/g, "-")}.json`);
writeFileSync(out, JSON.stringify({
  chain: "monad-testnet", chainId: 10143, ranAt: runTag, market: MARKET, bond: BOND, agentJob: AGENT_JOB, disputeWindowSeconds: 86400, parties,
  record: { url: `https://api.predge.io/v1/settlement-risk/${MARKET}`, public_key: a.public_key, signature: a.signature, canonical: a.canonical },
  tamperedOutcome: lie, requestHash, expected, delivered, jobId: jobId.toString(),
  result: { wouldSlashBeforeChallenge: would, slashedBond: ethers.formatEther(slashed.args.bond), challenger: slashed.args.challenger, recordedScore: Number(slashed.args.recordedScore), deliveredHash: slashed.args.deliveredHash, stakeClosed: st.closed, slashCount: Number(slashCount), reclaimSimulated: reclaim },
  receipts,
}, null, 2) + "\n");
console.log(`receipts -> ${path.relative(process.cwd(), out)}`);
