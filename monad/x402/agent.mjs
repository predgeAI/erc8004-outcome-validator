// An agent that pays for Predge settlement risk with USDC on Monad testnet (x402 v2, Monad's
// facilitator), then checks what it bought before acting.
//
//   node monad/x402/agent.mjs [market_id] [server]        default server http://localhost:4021
//
// Payer key: X402_PAYER_PRIVATE_KEY in ~/.predge-monad/monad-metropolis.env (or PAYER_PRIVATE_KEY in
// the environment). Never printed. The payer needs Monad testnet USDC (faucet.circle.com) and no MON.
// Checks: ed25519 signature of the record; if Predge has an on-chain verdict for this market, that
// the verdict's responseHash on Monad equals keccak256 of the signed bytes it was bound to; and the
// USDC settlement tx on Monad (Transfer payer -> payTo in that receipt).
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MARKET = process.argv[2] || "2169995";
const BASE = process.argv[3] || "http://localhost:4021";
const RPC = process.env.RPC_URL || "https://testnet-rpc.monad.xyz";
const USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
const readEnv = (f) => Object.fromEntries(readFileSync(f, "utf8").split("\n").map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2]]));
const key = process.env.PAYER_PRIVATE_KEY || readEnv(process.env.PREDGE_AGENT_ENV_FILE || path.join(os.homedir(), ".predge-monad/monad-metropolis.env")).X402_PAYER_PRIVATE_KEY;
const account = privateKeyToAccount(key);
const chain = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: ethers.Network.from(10143n) });
const usdc = new ethers.Contract(USDC, ["function balanceOf(address) view returns (uint256)", "event Transfer(address indexed from, address indexed to, uint256 value)"], chain);

const verifyEd25519 = (a) => crypto.verify(null, Buffer.from(a.canonical), crypto.createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(a.public_key, "hex")]), format: "der", type: "spki" }), Buffer.from(a.signature, "hex"));

const client = new x402Client();
client.register("eip155:10143", new ExactEvmScheme(account));
const payFetch = wrapFetchWithPayment(fetch, client);

const before = await usdc.balanceOf(account.address);
console.log(`agent ${account.address}  USDC ${ethers.formatUnits(before, 6)} on Monad testnet`);
const unpaid = await fetch(`${BASE}/v1/settlement-risk/${MARKET}`);
const required = JSON.parse(Buffer.from(unpaid.headers.get("payment-required") || "", "base64").toString() || "{}");
console.log(`unpaid request -> HTTP ${unpaid.status}; accepts ${JSON.stringify(required.accepts?.map((x) => ({ network: x.network, asset: x.asset, amount: x.amount, payTo: x.payTo })))}`);

const t0 = Date.now();
const res = await payFetch(`${BASE}/v1/settlement-risk/${MARKET}`);
const ms = Date.now() - t0;
const settle = JSON.parse(Buffer.from(res.headers.get("payment-response") || "", "base64").toString() || "{}");
if (!res.ok) { console.error(`paid request failed: HTTP ${res.status} ${await res.text()}`); process.exit(1); }
const body = await res.json();
console.log(`paid request -> HTTP ${res.status} in ${ms} ms; settlement ${JSON.stringify(settle)}`);

// 1. the record
const sigOk = verifyEd25519(body.record);
const rec = JSON.parse(body.record.canonical);
console.log(`record ed25519 ${sigOk}; market ${rec.market_id}, uma_state ${rec.uma_state}, disputes ${rec.dispute_count}, on-chain outcome ${rec.onchain_resolution?.outcome ?? "none"}, risk ${rec.risk_level}`);

// 2. the on-chain verdict, bound to signed bytes
let verdict = null;
if (body.onchainVerdict) {
  const v = body.onchainVerdict;
  const boundOk = verifyEd25519(v.boundRecord) && ethers.keccak256(ethers.toUtf8Bytes(v.boundRecord.canonical)) === v.responseHash;
  verdict = { response: v.response, responseHash: v.responseHash, responseTx: v.responseTx, boundToSignedRecord: boundOk };
  console.log(`on-chain verdict ${v.response} (tx ${v.responseTx}); responseHash == keccak256(signed record) ${boundOk}`);
} else console.log("no on-chain verdict for this market yet");

// 3. the payment on Monad
let payment = null;
if (settle.transaction) {
  const r = await chain.waitForTransaction(settle.transaction, 1, 60_000);
  const t = r.logs.filter((l) => l.address.toLowerCase() === USDC.toLowerCase()).map((l) => { try { return usdc.interface.parseLog(l); } catch { return null; } }).find((l) => l?.name === "Transfer" && l.args.from === account.address);
  payment = { tx: settle.transaction, block: r.blockNumber, status: r.status, from: t?.args.from, to: t?.args.to, amountUSDC: t ? ethers.formatUnits(t.args.value, 6) : null, gasPaidBy: r.from };
  console.log(`settlement tx ${settle.transaction}: block ${r.blockNumber}, status ${r.status}, USDC ${payment.amountUSDC} ${payment.from} -> ${payment.to}, gas paid by ${r.from} (facilitator)`);
}
const after = await usdc.balanceOf(account.address);
console.log(`agent USDC after ${ethers.formatUnits(after, 6)}`);
const decision = sigOk && (!verdict || verdict.boundToSignedRecord) ? (rec.resolved_on_chain ? "act: the outcome is final on chain" : `wait: ${rec.risk_level}`) : "refuse: evidence did not verify";
console.log(`agent decision: ${decision}`);

mkdirSync(path.join(HERE, "runs"), { recursive: true });
const out = path.join(HERE, "runs", `x402-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(out, JSON.stringify({ network: "eip155:10143", facilitator: "https://x402-facilitator.molandak.org", market: MARKET, payer: account.address, latencyMs: ms, settlement: settle, payment, recordSignatureOk: sigOk, verdict, decision, usdcBefore: ethers.formatUnits(before, 6), usdcAfter: ethers.formatUnits(after, 6) }, null, 2) + "\n");
console.log(`run -> ${path.relative(process.cwd(), out)}`);
