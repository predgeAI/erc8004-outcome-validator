// Compile PredgeSettlementWatch and (optionally) deploy it to Monad TESTNET.
//
//   node cre/contracts/deploy.mjs                                        compile + dry run, nothing sent
//   PRIVATE_KEY=0x... CONFIRM_TESTNET=yes node cre/contracts/deploy.mjs --send
//   ... --forwarder 0xF8344CFd5c43616a4366C34E3EEE75af79a74482           production KeystoneForwarder
//
// Default forwarder: the Monad testnet MockKeystoneForwarder used by `cre workflow simulate --broadcast`.
// The key comes from PRIVATE_KEY in the environment only; it is never printed. Refuses any chain id
// other than 10143. Writes the ABI and bytecode to cre/contracts/build/.
import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const solc = createRequire(import.meta.url)("solc");
const RPC = process.env.RPC_URL || "https://testnet-rpc.monad.xyz";
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SEND = argv.includes("--send");
const MOCK_FORWARDER = "0xB9F79d863261869B234c481D1f9A7af84AeAd192";
const forwarder = ethers.getAddress(arg("--forwarder", MOCK_FORWARDER));
if (SEND && process.env.CONFIRM_TESTNET !== "yes") { console.error("Refusing: --send needs CONFIRM_TESTNET=yes"); process.exit(2); }

export function compile() {
  const name = "PredgeSettlementWatch";
  const source = readFileSync(path.join(HERE, `${name}.sol`), "utf8");
  const settings = { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun", outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } };
  const out = JSON.parse(solc.compile(JSON.stringify({ language: "Solidity", sources: { [`${name}.sol`]: { content: source } }, settings })));
  const err = (out.errors || []).find((e) => e.severity === "error");
  if (err) throw new Error(err.formattedMessage);
  const c = out.contracts[`${name}.sol`][name];
  return { abi: c.abi, bytecode: `0x${c.evm.bytecode.object}`, solc: solc.version() };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { abi, bytecode, solc: version } = compile();
  mkdirSync(path.join(HERE, "build"), { recursive: true });
  writeFileSync(path.join(HERE, "build", "PredgeSettlementWatch.json"), JSON.stringify({ solc: version, abi, bytecode }, null, 1) + "\n");
  console.log(`compiled with solc ${version}, ${(bytecode.length - 2) / 2} bytes; forwarder ${forwarder}`);

  const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: ethers.Network.from(10143n) });
  if (BigInt(await provider.send("eth_chainId", [])) !== 10143n) throw new Error("RPC is not Monad testnet (10143)");
  const factory = new ethers.ContractFactory(abi, bytecode);
  const tx = await factory.getDeployTransaction(forwarder);
  if (!SEND) { console.log("DRY RUN. Set PRIVATE_KEY and CONFIRM_TESTNET=yes and add --send to deploy."); process.exit(0); }
  if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY not set");
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const gas = await provider.estimateGas({ ...tx, from: wallet.address });
  const sent = await wallet.sendTransaction({ ...tx, gasLimit: (gas * 110n) / 100n }); // Monad charges the limit
  const r = await sent.wait();
  console.log(`deployed PredgeSettlementWatch at ${r.contractAddress} (tx ${sent.hash}, block ${r.blockNumber})`);
  console.log(`set write.receiverAddress in cre/settlement-watch/config.staging.json to ${r.contractAddress}`);
}
