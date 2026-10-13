// Fund a Predge agent on Monad from any chain with Aurora Intents (powered by NEAR Intents),
// then spend the arrived USDC on Monad for an x402-paid Predge check.
//
//   node aurora/fund.mjs tokens                                   Monad assets the intents network can deliver
//   node aurora/fund.mjs quote   --from base --amount 2 --to 0xMonadAddr [--asset USDC|MON] [--refund 0x..]
//   node aurora/fund.mjs deposit --from base --amount 2 --to 0xMonadAddr --refund 0xOriginAddr [--asset USDC|MON]
//   node aurora/fund.mjs submit  <depositAddress> <originTxHash>  tell the solver network the deposit landed (optional, faster)
//   node aurora/fund.mjs status  <depositAddress> [--watch]       poll until SUCCESS / REFUNDED / FAILED
//   CONFIRM_SEND=yes node aurora/fund.mjs send <runFile>          optional: send the deposit from an EVM key (see below)
//
// quote   is a dry run: price only, no deposit address, nothing can move.
// deposit asks for a real quote: it returns a one-time deposit address on the origin chain. Nothing moves until
//         someone sends the origin token to that address. The quote and address are written to aurora/runs/.
// status  follows the swap: PENDING_DEPOSIT -> KNOWN_DEPOSIT_TX -> PROCESSING -> SUCCESS, then reads the
//         recipient's USDC (or MON) balance on Monad mainnet and prints the Monad delivery tx.
// send    transfers exactly amountIn of the origin USDC from the key in ORIGIN_PRIVATE_KEY (or X402_PAYER_PRIVATE_KEY
//         in ~/.predge-monad/monad-metropolis.env) to the run's deposit address, then submits the hash. It refuses
//         unless CONFIRM_SEND=yes. The key is never printed. A wallet transfer works just as well.
//
// Backend: with AURORA_APP_KEY set (a public app key from studio.aurora.dev) every call goes through the
// Aurora Intents API (https://intents-api.aurora.dev/api/.../{appKey}). Without it the script uses the NEAR
// Intents 1Click API (https://1click.chaindefuser.com/v0), the same solver network, keyless with a 0.25%
// platform fee. Status is read from 1Click by deposit address in both cases.
import os from "node:os";
import path from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, erc20Abi, formatUnits, parseUnits, isAddress, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, arbitrum, optimism, mainnet as ethereum, polygon } from "viem/chains";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ONECLICK = "https://1click.chaindefuser.com/v0";
const AURORA = "https://intents-api.aurora.dev/api";
const APP_KEY = process.env.AURORA_APP_KEY || "";
const BACKEND = APP_KEY ? "aurora-intents" : "near-intents-1click";

const MONAD = {
  chainId: 143,
  rpc: process.env.MONAD_RPC || "https://rpc.monad.xyz",
  explorer: "https://monadvision.com",
  usdc: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
};
// Origin chains we can send from with an EVM key (send subcommand). Any chain in `tokens` works for quote/deposit.
const EVM_ORIGINS = { base, arb: arbitrum, op: optimism, eth: ethereum, pol: polygon };

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i > 0 && args[i + 1] ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json", accept: "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { raw: text }; }
  if (!r.ok) throw new Error(`${method} ${url.replace(APP_KEY || "\u0000", "<appKey>")} -> HTTP ${r.status}: ${j.message || j.error || text.slice(0, 300)}`);
  return j;
}

async function tokens() {
  if (APP_KEY) { const j = await api("GET", `${AURORA}/tokens/${APP_KEY}`); return j.tokens ?? j; }
  return api("GET", `${ONECLICK}/tokens`);
}

function pick(list, chain, symbol) {
  const t = list.find((x) => x.blockchain === chain && x.symbol === symbol);
  if (!t) throw new Error(`no ${symbol} on "${chain}" in the intents token list (try: node aurora/fund.mjs tokens)`);
  return t;
}

async function quote({ dry }) {
  const from = opt("from", "base");
  const asset = opt("asset", "USDC");
  const amount = opt("amount", "2");
  const to = opt("to");
  const refund = opt("refund", dry ? to : undefined);
  if (!to || !isAddress(to)) throw new Error("--to <Monad 0x address> is required");
  if (!refund) throw new Error("--refund <address on the origin chain> is required for a real deposit");
  const list = await tokens();
  const origin = pick(list, from, opt("from-symbol", "USDC"));
  const dest = pick(list, "monad", asset);
  const deadline = new Date(Date.now() + Number(opt("minutes", "60")) * 60_000).toISOString();
  const req = {
    dry,
    swapType: "EXACT_INPUT",
    slippageTolerance: Number(opt("slippage-bps", "100")),
    originAsset: origin.assetId,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: dest.assetId,
    amount: parseUnits(amount, origin.decimals).toString(),
    refundTo: refund,
    refundType: "ORIGIN_CHAIN",
    recipient: getAddress(to),
    recipientType: "DESTINATION_CHAIN",
    deadline,
    referral: "predge",
  };
  const res = APP_KEY ? await api("POST", `${AURORA}/quote/${APP_KEY}`, req) : await api("POST", `${ONECLICK}/quote`, req);
  const q = res.quote ?? res;
  const view = {
    backend: BACKEND,
    route: `${amount} ${origin.symbol} on ${from} -> ${dest.symbol} on Monad (chain 143)`,
    recipientOnMonad: req.recipient,
    amountIn: q.amountInFormatted,
    expectedOut: `${q.amountOutFormatted} ${dest.symbol}`,
    minOut: formatUnits(BigInt(q.minAmountOut ?? 0), dest.decimals),
    etaSeconds: q.timeEstimate,
    depositAddress: q.depositAddress ?? (dry ? "(dry run: no address issued)" : null),
    deadline: q.deadline ?? deadline,
  };
  console.log(JSON.stringify(view, null, 2));
  if (!dry) {
    if (!q.depositAddress) throw new Error("the quote came back without a deposit address");
    mkdirSync(path.join(HERE, "runs"), { recursive: true });
    const file = path.join(HERE, "runs", `fund-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(file, JSON.stringify({ kind: "aurora-fund", backend: BACKEND, createdAt: new Date().toISOString(), from, origin: { assetId: origin.assetId, contract: origin.contractAddress, decimals: origin.decimals, symbol: origin.symbol }, destination: { assetId: dest.assetId, contract: dest.contractAddress ?? null, decimals: dest.decimals, symbol: dest.symbol }, request: req, quote: q, signature: res.signature ?? null, correlationId: res.correlationId ?? null }, null, 2) + "\n");
    console.log(`\nrun -> ${path.relative(process.cwd(), file)}`);
    console.log(`\nNEXT: send exactly ${q.amountInFormatted} ${origin.symbol} on ${from} to ${q.depositAddress} before ${view.deadline}.`);
    console.log(`      then: node aurora/fund.mjs status ${q.depositAddress} --watch`);
  }
}

async function balanceOnMonad(addr, symbol) {
  const c = createPublicClient({ transport: http(MONAD.rpc) });
  if (symbol === "MON") return `${formatUnits(await c.getBalance({ address: addr }), 18)} MON`;
  return `${formatUnits(await c.readContract({ address: MONAD.usdc, abi: erc20Abi, functionName: "balanceOf", args: [addr] }), 6)} USDC`;
}

async function status(depositAddress, watch) {
  if (!depositAddress) throw new Error("usage: status <depositAddress> [--watch]");
  let last = "";
  for (;;) {
    const s = await api("GET", `${ONECLICK}/status?depositAddress=${encodeURIComponent(depositAddress)}`);
    const d = s.swapDetails ?? {};
    const line = `${new Date().toISOString()}  ${s.status}  in ${d.amountInFormatted ?? "-"}  out ${d.amountOutFormatted ?? "-"}`;
    if (line.split("  ").slice(1).join() !== last) { console.log(line); last = line.split("  ").slice(1).join(); }
    const terminal = ["SUCCESS", "REFUNDED", "FAILED"].includes(s.status);
    if (terminal || !watch) {
      const qr = s.quoteResponse?.quoteRequest ?? {};
      const out = {
        status: s.status,
        originTx: (d.originChainTxHashes ?? []).map((h) => h.explorerUrl || h.hash),
        nearTx: d.nearTxHashes ?? [],
        monadTx: (d.destinationChainTxHashes ?? []).map((h) => h.explorerUrl || `${MONAD.explorer}/tx/${h.hash}`),
        amountIn: d.amountInFormatted, amountOut: d.amountOutFormatted, refunded: d.refundedAmountFormatted, refundReason: d.refundReason,
      };
      if (s.status === "SUCCESS" && qr.recipient && isAddress(qr.recipient)) {
        const sym = String(qr.destinationAsset ?? "").endsWith("_11111111111111111111") ? "MON" : "USDC";
        out.recipient = qr.recipient;
        out.recipientBalanceOnMonad = await balanceOnMonad(getAddress(qr.recipient), sym);
        if (sym === "USDC") out.next = `MONAD_NETWORK=mainnet node monad/x402/agent.mjs 5532382 http://localhost:4021   # pay 0.001 USDC for a Predge check from ${qr.recipient}`;
      }
      console.log(JSON.stringify(out, null, 2));
      mkdirSync(path.join(HERE, "runs"), { recursive: true });
      const file = path.join(HERE, "runs", `status-${depositAddress.slice(0, 10)}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      writeFileSync(file, JSON.stringify({ checkedAt: new Date().toISOString(), depositAddress, ...out, raw: s }, null, 2) + "\n");
      console.log(`run -> ${path.relative(process.cwd(), file)}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function submit(depositAddress, txHash) {
  if (!depositAddress || !txHash) throw new Error("usage: submit <depositAddress> <originTxHash>");
  const r = await api("POST", `${ONECLICK}/deposit/submit`, { txHash, depositAddress });
  console.log(`submitted; status ${r.status}`);
}

function readKey() {
  if (process.env.ORIGIN_PRIVATE_KEY) return process.env.ORIGIN_PRIVATE_KEY;
  const f = process.env.PREDGE_AGENT_ENV_FILE || path.join(os.homedir(), ".predge-monad/monad-metropolis.env");
  if (!existsSync(f)) return null;
  const m = readFileSync(f, "utf8").split("\n").map((l) => /^X402_PAYER_PRIVATE_KEY=(.*)$/.exec(l.trim())).find(Boolean);
  return m ? m[1] : null;
}

async function send(runFile) {
  if (process.env.CONFIRM_SEND !== "yes") throw new Error("send moves real funds; rerun with CONFIRM_SEND=yes");
  const run = JSON.parse(readFileSync(runFile, "utf8"));
  const chain = EVM_ORIGINS[run.from];
  if (!chain) throw new Error(`send supports ${Object.keys(EVM_ORIGINS).join(", ")}; for ${run.from} send from a wallet`);
  if (new Date(run.quote.deadline ?? run.request.deadline) < new Date()) throw new Error("this quote has expired; make a new deposit quote");
  const key = readKey();
  if (!key) throw new Error("no ORIGIN_PRIVATE_KEY (or X402_PAYER_PRIVATE_KEY in the env file)");
  const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
  const token = getAddress(run.origin.contract);
  const amount = BigInt(run.quote.amountIn);
  const pub = createPublicClient({ chain, transport: http() });
  const bal = await pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  console.log(`sender ${account.address} on ${chain.name}: ${formatUnits(bal, run.origin.decimals)} ${run.origin.symbol}; sending ${formatUnits(amount, run.origin.decimals)} to ${run.quote.depositAddress}`);
  if (bal < amount) throw new Error("not enough balance");
  const wallet = createWalletClient({ account, chain, transport: http() });
  const hash = await wallet.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [getAddress(run.quote.depositAddress), amount] });
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  console.log(`origin tx ${hash} status ${rcpt.status} block ${rcpt.blockNumber}`);
  run.originTx = { hash, status: rcpt.status, block: Number(rcpt.blockNumber), explorer: `${chain.blockExplorers?.default.url}/tx/${hash}` };
  writeFileSync(runFile, JSON.stringify(run, null, 2) + "\n");
  await submit(run.quote.depositAddress, hash).catch((e) => console.log(`submit skipped: ${e.message}`));
  console.log(`then: node aurora/fund.mjs status ${run.quote.depositAddress} --watch`);
}

try {
  if (cmd === "tokens") {
    const list = await tokens();
    const monad = list.filter((t) => t.blockchain === "monad");
    console.log(`backend ${BACKEND}; ${list.length} assets on ${new Set(list.map((t) => t.blockchain)).size} chains; Monad:`);
    for (const t of monad) console.log(`  ${t.symbol.padEnd(6)} ${t.contractAddress ?? "(native)"}  ${t.assetId}`);
    const usdc = list.filter((t) => t.symbol === "USDC").map((t) => t.blockchain);
    console.log(`USDC origins: ${usdc.join(", ")}`);
  } else if (cmd === "quote") await quote({ dry: true });
  else if (cmd === "deposit") await quote({ dry: false });
  else if (cmd === "status") await status(args[1], flag("watch"));
  else if (cmd === "submit") await submit(args[1], args[2]);
  else if (cmd === "send") await send(args[1]);
  else { console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).slice(0, 10).join("\n")); process.exit(cmd ? 2 : 0); }
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(1);
}
