// Compile the kuru/contracts sources with the repo's solc 0.8.26 (same settings as monad/contracts/deploy.mjs).
import path from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const solc = createRequire(import.meta.url)("solc");
const cache = new Map();

export function compile(file, name, { evmVersion = "cancun" } = {}) {
  const key = `${file}:${evmVersion}`;
  if (!cache.has(key)) {
    const source = readFileSync(path.join(HERE, "..", "contracts", file), "utf8");
    const settings = { optimizer: { enabled: true, runs: 200 }, evmVersion, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } } };
    const out = JSON.parse(solc.compile(JSON.stringify({ language: "Solidity", sources: { [file]: { content: source } }, settings })));
    const err = (out.errors || []).find((e) => e.severity === "error");
    if (err) throw new Error(err.formattedMessage);
    cache.set(key, out.contracts[file]);
  }
  const c = cache.get(key)[name];
  return { abi: c.abi, bytecode: "0x" + c.evm.bytecode.object, deployedBytecode: "0x" + c.evm.deployedBytecode.object };
}
