// Compile the Predge contracts in this folder and deploy them to Monad TESTNET with your own key.
//
//   node monad/contracts/deploy.mjs                                   dry run: compile, estimate, nothing sent
//   CONFIRM_TESTNET=yes node monad/contracts/deploy.mjs --send        deploy the full stack
//   CONFIRM_TESTNET=yes node monad/contracts/deploy.mjs --send --only bond --validator 0x.. --job 0x.. --window 86400
//
// Full stack order: PredgeAgentValidator(validator), AgentJob(), PredgeValidatorBond(validator, job,
// window), PredgeSettlement(). The validator defaults to the deployer address.
// Key: PRIVATE_KEY from the environment, or from PREDGE_ENV_FILE (KEY=VALUE lines). Never printed.
// Refuses any chain id other than 10143. Output: monad/contracts/out/deploy-<time>.json.
import os from "node:os";
import path from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const solc = createRequire(import.meta.url)("solc");
const RPC = process.env.RPC_URL || "https://testnet-rpc.monad.xyz";
const EXPLORER = "https://testnet.monadvision.com";
const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const SEND = argv.includes("--send");
if (SEND && process.env.CONFIRM_TESTNET !== "yes") { console.error("Refusing: --send needs CONFIRM_TESTNET=yes"); process.exit(2); }

function loadKey() {
  if (process.env.PRIVATE_KEY) return process.env.PRIVATE_KEY;
  const f = process.env.PREDGE_ENV_FILE || path.join(os.homedir(), ".predge-monad/monad-testnet.env");
  const env = Object.fromEntries(readFileSync(f, "utf8").split("\n").map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2]]));
  return env[process.env.KEY_NAME || "PRIVATE_KEY"];
}

export function compile(name) {
  const source = readFileSync(path.join(HERE, `${name}.sol`), "utf8");
  const settings = { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun", outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } };
  const out = JSON.parse(solc.compile(JSON.stringify({ language: "Solidity", sources: { [`${name}.sol`]: { content: source } }, settings })));
  const err = (out.errors || []).find((e) => e.severity === "error");
  if (err) throw new Error(err.formattedMessage);
  const c = out.contracts[`${name}.sol`][name];
  return { abi: c.abi, bytecode: "0x" + c.evm.bytecode.object };
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: ethers.Network.from(10143n) });
  if (BigInt(await provider.send("eth_chainId", [])) !== 10143n) throw new Error("RPC is not Monad testnet (10143)");
  const wallet = new ethers.Wallet(loadKey(), provider);
  const signer = new ethers.NonceManager(wallet);
  const validator = ethers.getAddress(arg("--validator") || wallet.address);
  const windowSec = BigInt(arg("--window") || "86400");
  const only = arg("--only");

  const plan = [];
  if (!only || only === "validator") plan.push({ name: "PredgeAgentValidator", args: () => [validator] });
  if (!only || only === "job") plan.push({ name: "AgentJob", args: () => [] });
  if (!only || only === "bond") plan.push({ name: "PredgeValidatorBond", args: (d) => [validator, ethers.getAddress(arg("--job") || d.AgentJob), windowSec] });
  if (!only || only === "settlement") plan.push({ name: "PredgeSettlement", args: () => [] });

  console.log(`deployer ${wallet.address}  ${ethers.formatEther(await provider.getBalance(wallet.address))} MON  ${SEND ? "SEND" : "DRY RUN"}`);
  const deployed = {};
  const result = { chainId: 10143, deployer: wallet.address, validator, disputeWindow: windowSec.toString(), contracts: {} };
  for (const p of plan) {
    const { abi, bytecode } = compile(p.name);
    const factory = new ethers.ContractFactory(abi, bytecode, signer);
    const args = p.args(deployed);
    const txReq = await factory.getDeployTransaction(...args);
    const gas = await provider.estimateGas({ ...txReq, from: wallet.address });
    console.log(`${p.name.padEnd(21)} args ${JSON.stringify(args.map(String))}  estimated gas ${gas}`);
    if (!SEND) { deployed[p.name] = ethers.getCreateAddress({ from: wallet.address, nonce: (await provider.getTransactionCount(wallet.address)) + Object.keys(deployed).length }); continue; }
    // Monad charges the gas limit, not the gas used, so the limit is the estimate plus 10%.
    const c = await factory.deploy(...args, { gasLimit: (gas * 110n) / 100n });
    const r = await c.deploymentTransaction().wait();
    deployed[p.name] = await c.getAddress();
    result.contracts[p.name] = { address: deployed[p.name], args: args.map(String), deployTx: r.hash, block: r.blockNumber, gasUsed: r.gasUsed.toString(), url: `${EXPLORER}/address/${deployed[p.name]}` };
    console.log(`  -> ${deployed[p.name]}  ${EXPLORER}/tx/${r.hash}`);
  }
  if (SEND) {
    mkdirSync(path.join(HERE, "out"), { recursive: true });
    const f = path.join(HERE, "out", `deploy-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(f, JSON.stringify(result, null, 2) + "\n");
    console.log(`written ${path.relative(process.cwd(), f)}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
