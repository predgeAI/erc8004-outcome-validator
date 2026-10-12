// Nansen API over x402 (v2), paid in USDC on Monad mainnet (eip155:143), with a hard spend cap.
//
// Every call goes through nansenCall():
//   1. cache: nansen/cache/raw/<endpoint>-<sha256(body)>.json; a cached response is never paid for again
//   2. unpaid POST, read the 402 challenge (PAYMENT-REQUIRED header)
//   3. refuse unless an option is scheme exact, network eip155:143, asset = Monad USDC, payTo = the
//      Nansen payTo pinned below, amount <= 0.10 USDC
//   4. refuse if ledger spend + amount would exceed the cap (2.00 USDC lifetime, nansen/runs/spend-ledger.json)
//   5. write a pending ledger entry, sign the EIP-3009 authorization for that one option only, retry
//   6. record the settlement tx hash from PAYMENT-RESPONSE and check the USDC Transfer on Monad
//
// The payer key is PRIVATE_KEY in ~/.predge-monad/monad-testnet.env (KEY=VALUE, or PREDGE_ENV_FILE).
// It is read only when a payment is needed, never printed, never written anywhere. The only transaction
// this module ever causes is the Nansen x402 settlement, which Nansen's facilitator submits.
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const NANSEN_API = "https://api.nansen.ai";
export const MONAD = { network: "eip155:143", chainId: 143n, rpc: process.env.MONAD_MAINNET_RPC || "https://rpc.monad.xyz", explorer: "https://monadvision.com/tx/" };
export const USDC_MONAD = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";
export const NANSEN_PAY_TO = "0x93053f1e7A5eFEDa532Fe69CbbE43cBEc3A0F13f"; // read from the 402 challenge on 2026-10-12
export const EXPECTED_PAYER = "0x9F0Af03C5695b72903c03852f7Dd4Fe5A0d49Fc9";
export const MAX_PRICE_UNITS = 100_000n; // 0.10 USDC per call
export const CAP_UNITS = 2_000_000n; // 2.00 USDC lifetime, all runs
const CACHE_DIR = process.env.NANSEN_CACHE_DIR || path.join(HERE, "cache", "raw");
const LEDGER = process.env.NANSEN_LEDGER || path.join(HERE, "runs", "spend-ledger.json");

const canon = (v) => (v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`);
const fmt = (units) => ethers.formatUnits(units, 6);

export function readLedger() {
  if (!existsSync(LEDGER)) return { asset: `USDC ${USDC_MONAD} on ${MONAD.network}`, payer: EXPECTED_PAYER, capUSDC: fmt(CAP_UNITS), entries: [] };
  return JSON.parse(readFileSync(LEDGER, "utf8"));
}
const writeLedger = (l) => { mkdirSync(path.dirname(LEDGER), { recursive: true }); writeFileSync(LEDGER, JSON.stringify(l, null, 2) + "\n"); };
// Pending and unconfirmed entries count as spent: if in doubt, assume the money left.
export const spentUnits = (l = readLedger()) => l.entries.filter((e) => e.status !== "not_settled").reduce((s, e) => s + BigInt(e.amountUnits), 0n);

function loadSigner() {
  const file = process.env.PREDGE_ENV_FILE || path.join(os.homedir(), ".predge-monad/monad-testnet.env");
  const env = Object.fromEntries(readFileSync(file, "utf8").split("\n").map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2]]));
  if (!env.PRIVATE_KEY) throw new Error(`no PRIVATE_KEY in ${file}`);
  return env.PRIVATE_KEY;
}

let http = null; // x402HTTPClient, built on first payment
async function payingClient() {
  if (http) return http;
  const { privateKeyToAccount } = await import("viem/accounts");
  const { x402Client, x402HTTPClient } = await import("@x402/core/client");
  const { ExactEvmScheme } = await import("@x402/evm/exact/client");
  const account = privateKeyToAccount(loadSigner());
  if (account.address.toLowerCase() !== EXPECTED_PAYER.toLowerCase()) throw new Error(`payer key derives ${account.address}, expected ${EXPECTED_PAYER}; refusing`);
  const client = new x402Client();
  client.register(MONAD.network, new ExactEvmScheme(account));
  client.registerPolicy((_v, reqs) => reqs.filter(okOption));
  http = new x402HTTPClient(client);
  return http;
}

const okOption = (a) => a?.scheme === "exact" && a.network === MONAD.network && String(a.asset).toLowerCase() === USDC_MONAD.toLowerCase() && String(a.payTo).toLowerCase() === NANSEN_PAY_TO.toLowerCase() && BigInt(a.amount) > 0n && BigInt(a.amount) <= MAX_PRICE_UNITS;
const decodeHeader = (h) => (h ? JSON.parse(Buffer.from(h, "base64").toString("utf8")) : null);

async function verifySettlement(tx, amountUnits) {
  try {
    const p = new ethers.JsonRpcProvider(MONAD.rpc, undefined, { staticNetwork: ethers.Network.from(MONAD.chainId) });
    const r = await p.waitForTransaction(tx, 1, 60_000);
    const iface = new ethers.Interface(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
    const t = r.logs.filter((l) => l.address.toLowerCase() === USDC_MONAD.toLowerCase()).map((l) => { try { return iface.parseLog(l); } catch { return null; } })
      .find((e) => e?.name === "Transfer" && e.args.from.toLowerCase() === EXPECTED_PAYER.toLowerCase());
    return { block: r.blockNumber, status: r.status, transferTo: t?.args.to ?? null, transferUSDC: t ? fmt(t.args.value) : null, matches: !!t && t.args.to.toLowerCase() === NANSEN_PAY_TO.toLowerCase() && t.args.value === BigInt(amountUnits) };
  } catch (e) { return { error: e.shortMessage || e.message }; }
}

/**
 * POST a Nansen endpoint. Returns { data, fetchedAt, fromCache, payment }.
 * opts.pay=false (or NANSEN_NO_PAY=1) serves the cache only and never pays.
 * opts.runBudgetUnits: refuse if this run would spend more than this.
 */
export async function nansenCall(endpoint, body, opts = {}) {
  const key = crypto.createHash("sha256").update(`${endpoint}\n${canon(body)}`).digest("hex").slice(0, 16);
  const cacheFile = path.join(CACHE_DIR, `${endpoint.replace(/[^a-z0-9]+/gi, "-")}-${key}.json`);
  if (existsSync(cacheFile)) { const c = JSON.parse(readFileSync(cacheFile, "utf8")); return { ...c, fromCache: true }; }
  if (opts.pay === false || process.env.NANSEN_NO_PAY === "1") throw new Error(`not cached and payment disabled: ${endpoint} ${canon(body)}`);

  const url = `${NANSEN_API}/api/v1/prediction-market/${endpoint}`;
  const headers = { "content-type": "application/json", accept: "application/json", "x-payer-address": EXPECTED_PAYER };
  const unpaid = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (unpaid.ok) { const data = await unpaid.json(); const out = { endpoint, request: body, fetchedAt: new Date().toISOString(), data, payment: null }; save(cacheFile, out); return { ...out, fromCache: false }; }
  if (unpaid.status !== 402) throw new Error(`${endpoint}: unpaid request HTTP ${unpaid.status} ${(await unpaid.text()).slice(0, 300)}`);
  const challenge = decodeHeader(unpaid.headers.get("payment-required"));
  await unpaid.text();
  const option = challenge?.accepts?.find(okOption);
  if (!option) {
    const monad = challenge?.accepts?.find((a) => a.network === MONAD.network);
    throw new Error(`${endpoint}: refusing, no acceptable option (need exact / ${MONAD.network} / USDC ${USDC_MONAD} / payTo ${NANSEN_PAY_TO} / <= ${fmt(MAX_PRICE_UNITS)}); Monad option offered: ${JSON.stringify(monad ?? null)}`);
  }
  const amount = BigInt(option.amount);
  const ledger = readLedger();
  const spent = spentUnits(ledger);
  if (spent + amount > CAP_UNITS) throw new Error(`${endpoint}: refusing, spend cap: ${fmt(spent)} spent + ${fmt(amount)} > cap ${fmt(CAP_UNITS)} USDC`);
  if (opts.runSpent && opts.runBudgetUnits !== undefined && opts.runSpent.units + amount > opts.runBudgetUnits) throw new Error(`${endpoint}: refusing, run budget ${fmt(opts.runBudgetUnits)} USDC would be exceeded`);

  const client = await payingClient();
  const payload = await client.createPaymentPayload({ ...challenge, accepts: [option] });
  if (payload.accepted && (payload.accepted.network !== MONAD.network || BigInt(payload.accepted.amount) !== amount)) throw new Error("signed payload does not match the checked option; refusing");
  const entry = { at: new Date().toISOString(), endpoint, request: body, network: option.network, asset: option.asset, payTo: option.payTo, amountUnits: amount.toString(), amountUSDC: fmt(amount), status: "pending", tx: null };
  ledger.entries.push(entry); writeLedger(ledger);
  if (opts.runSpent) opts.runSpent.units += amount;

  const paid = await fetch(url, { method: "POST", headers: { ...headers, ...client.encodePaymentSignatureHeader(payload) }, body: JSON.stringify(body) });
  let settle = null;
  try { settle = client.getPaymentSettleResponse((n) => paid.headers.get(n)); } catch { settle = decodeHeader(paid.headers.get("payment-response")); }
  const text = await paid.text();
  const l2 = readLedger(); const e2 = l2.entries.find((x) => x.at === entry.at && x.endpoint === endpoint && x.status === "pending");
  e2.httpStatus = paid.status;
  e2.tx = settle?.transaction || null;
  e2.explorer = e2.tx ? MONAD.explorer + e2.tx : null;
  e2.status = e2.tx ? "settled" : paid.status === 402 ? "not_settled" : "unconfirmed";
  if (e2.tx) e2.onchain = await verifySettlement(e2.tx, amount);
  writeLedger(l2);
  if (e2.status === "not_settled" && opts.runSpent) opts.runSpent.units -= amount;
  console.error(`  paid ${fmt(amount)} USDC for ${endpoint} -> HTTP ${paid.status}, ${e2.status}${e2.tx ? ` tx ${e2.explorer}` : ""}; lifetime spend ${fmt(spentUnits(l2))} / ${fmt(CAP_UNITS)}`);
  if (!paid.ok) throw new Error(`${endpoint}: paid request HTTP ${paid.status} ${text.slice(0, 300)}`);
  const out = { endpoint, request: body, fetchedAt: new Date().toISOString(), data: JSON.parse(text), payment: { amountUSDC: fmt(amount), network: option.network, tx: e2.tx, explorer: e2.explorer, onchain: e2.onchain ?? null } };
  save(cacheFile, out);
  return { ...out, fromCache: false };
}
const save = (f, o) => { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(o, null, 2) + "\n"); };

/** Read the 402 challenge for an endpoint without paying; for the preflight check. */
export async function readChallenge(endpoint, body) {
  const res = await fetch(`${NANSEN_API}/api/v1/prediction-market/${endpoint}`, { method: "POST", headers: { "content-type": "application/json", "x-payer-address": EXPECTED_PAYER }, body: JSON.stringify(body) });
  const ch = decodeHeader(res.headers.get("payment-required")); await res.text();
  const monad = ch?.accepts?.find((a) => a.network === MONAD.network) ?? null;
  return { httpStatus: res.status, monad, acceptable: !!ch?.accepts?.find(okOption) };
}
