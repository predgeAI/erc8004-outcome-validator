// Rebuild the four Predge contracts from the sources in this folder and compare them with the code
// that is live on Monad testnet. Read-only: no key, no transaction.
//
//   node monad/contracts/check-bytecode.mjs
//
// Compiler: solc 0.8.26 (npm `solc`, pinned in package.json), optimizer on, 200 runs, evmVersion
// cancun, source unit name "<Contract>.sol". These are the settings the deployed builds used, so the
// runtime must match byte for byte, metadata hash included. The only bytes that differ by design are
// immutables (PredgeValidatorBond.job), which the constructor writes; they are taken from the chain
// and checked against the expected AgentJob address.
import path from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const solc = createRequire(import.meta.url)("solc");
const RPC = process.env.RPC_URL || "https://testnet-rpc.monad.xyz";
const dep = JSON.parse(readFileSync(path.join(HERE, "..", "deployment.json"), "utf8"));
const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: ethers.Network.from(10143n) });

const SETTINGS = {
  optimizer: { enabled: true, runs: 200 },
  evmVersion: "cancun",
  outputSelection: { "*": { "*": ["evm.deployedBytecode.object", "evm.deployedBytecode.immutableReferences"] } },
};

let fail = 0;
console.log(`solc ${solc.version()}\n`);
for (const [name, info] of Object.entries(dep.contracts)) {
  const source = readFileSync(path.join(HERE, `${name}.sol`), "utf8");
  const out = JSON.parse(solc.compile(JSON.stringify({ language: "Solidity", sources: { [`${name}.sol`]: { content: source } }, settings: SETTINGS })));
  const errors = (out.errors || []).filter((e) => e.severity === "error");
  if (errors.length) { console.log(`FAIL ${name}: ${errors[0].formattedMessage}`); fail++; continue; }
  const evm = out.contracts[`${name}.sol`][name].evm.deployedBytecode;
  const built = Buffer.from(evm.object, "hex");
  const live = Buffer.from((await provider.getCode(info.address)).slice(2), "hex");
  const immutables = [];
  for (const refs of Object.values(evm.immutableReferences || {})) {
    for (const { start, length } of refs) {
      immutables.push("0x" + live.subarray(start + length - 20, start + length).toString("hex"));
      live.copy(built, start, start, start + length);
    }
  }
  const same = built.length === live.length && built.equals(live);
  let note = "";
  if (name === "PredgeValidatorBond") {
    const ok = immutables.length > 0 && immutables.every((a) => ethers.getAddress(a) === ethers.getAddress(dep.contracts.AgentJob.address));
    note = ` | immutable job == AgentJob: ${ok}`;
    if (!ok) fail++;
  }
  console.log(`${same ? "PASS" : "FAIL"} ${name.padEnd(21)} ${info.address}  ${live.length} B, keccak ${ethers.keccak256(live)}${note}`);
  if (!same) fail++;
}
console.log(fail ? `\n${fail} check(s) failed` : "\nALL PASS: the sources in monad/contracts/ are what runs on Monad testnet");
process.exit(fail ? 1 : 0);
