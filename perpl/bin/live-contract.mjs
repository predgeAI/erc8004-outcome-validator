#!/usr/bin/env node
// Live hedge on Perpl TESTNET (chain 10143) sent straight to the Exchange contract from a wallet,
// no API key. The hedger prices a real open Polymarket "Bitcoin above K" market, computes the
// delta hedge for a YES position, opens that BTC short on Perpl, reads it back, then closes it.
//
//   node bin/live-contract.mjs                    dry run: market, model, order, gas; nothing sent
//   CONFIRM_TESTNET=yes node bin/live-contract.mjs --send [--shares 50] [--query "Bitcoin above on October 14"]
//
// Key: PRIVATE_KEY from PREDGE_ENV_FILE (default ~/.predge-monad/monad-testnet.env), never printed.
// Refuses any chain other than 10143. Test AUSD comes from Agora's public testnet faucet.
import os from "node:os";
import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { network, DEFAULTS } from "../src/config.mjs";
import { searchThresholdMarkets } from "../src/polymarket.mjs";
import { targetHedge, realizedVol, YEAR_MS } from "../src/model.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SEND = argv.includes("--send");
if (SEND && process.env.CONFIRM_TESTNET !== "yes") { console.error("Refusing: --send needs CONFIRM_TESTNET=yes"); process.exit(2); }

const NET = network("testnet");
const RPC = process.env.MONAD_TESTNET_RPC || "https://testnet-rpc.monad.xyz";
const EXPLORER = "https://testnet.monadvision.com";
const AUSD = "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC";
const FAUCET = "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C";
const BTC = BigInt(NET.markets.BTC);
const ACCOUNT_AUSD = 1000;
const ORDER = { openShort: 1, closeShort: 3 };

const ERC20 = ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function decimals() view returns (uint8)"];
const FAUCET_ABI = ["function requestFunds(address to)"];
const ORDER_DESC = "tuple(uint256 orderDescId,uint256 perpId,uint8 orderType,uint256 orderId,uint256 pricePNS,uint256 lotLNS,uint256 expiryBlock,bool postOnly,bool fillOrKill,bool immediateOrCancel,uint256 maxMatches,uint256 leverageHdths,uint256 lastExecutionBlock,uint256 amountCNS,uint256 maxNegPnlCollatBPS)";
const EXCHANGE = [
  "function getAccountByAddr(address) view returns (tuple(uint256 accountId,uint256 balanceCNS,uint256 lockedBalanceCNS,uint8 frozen,address accountAddr,uint256 positions0,uint256 positions1))",
  "function createAccount(uint256 amountCNS) returns (uint256)",
  `function execOrder(${ORDER_DESC} orderDesc)`,
  "function getPosition(uint256 perpId,uint256 accountId) view returns (tuple(uint256 accountId,uint256 nextNodeId,uint256 prevNodeId,uint8 positionType,uint256 depositCNS,uint256 pricePNS,uint256 lotLNS,uint256 entryBlock,int256 pnlCNS,int256 deltaPnlCNS,int256 premiumPnlCNS) position, uint256 markPNS, bool markValid)",
];

function loadKey() {
  const f = process.env.PREDGE_ENV_FILE || path.join(os.homedir(), ".predge-monad/monad-testnet.env");
  const env = Object.fromEntries(readFileSync(f, "utf8").split("\n").map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2]]));
  return env.PRIVATE_KEY;
}

async function perplBtc() {
  const ctx = await (await fetch(`${NET.apiUrl}/v1/pub/context`)).json();
  const m = ctx.markets.find((x) => x.perpetual_id === Number(BTC));
  if (!m) throw new Error("BTC market not found on Perpl testnet");
  return { markPNS: BigInt(m.state.mrk), priceDecimals: m.config.price_decimals, sizeDecimals: m.config.size_decimals, maxNegPnlBps: m.order_max_neg_pnl_collat_bps ?? 1000 };
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: ethers.Network.from(10143n) });
  if (BigInt(await provider.send("eth_chainId", [])) !== 10143n) throw new Error("RPC is not Monad testnet (10143); refusing");
  const wallet = new ethers.Wallet(loadKey(), provider);
  const signer = new ethers.NonceManager(wallet);
  const ex = new ethers.Contract(NET.exchange, EXCHANGE, signer);
  const ausd = new ethers.Contract(AUSD, ERC20, signer);
  const log = { network: "monad-testnet", chainId: 10143, exchange: NET.exchange, trader: wallet.address, ranAt: new Date().toISOString(), txs: [] };

  // 1. A real open Polymarket BTC threshold market, nearest to the money with time left.
  const query = arg("--query", `Bitcoin above on ${new Date(Date.now() + 864e5).toLocaleString("en-US", { month: "long", day: "numeric", timeZone: "America/New_York" })}`);
  const btc = await perplBtc();
  const spot = Number(btc.markPNS) / 10 ** btc.priceDecimals;
  const now = Date.now();
  const markets = (await searchThresholdMarkets(query, { limit: 10 })).filter((m) => m.symbol === "BTC" && !m.closed && m.observationMs - now > DEFAULTS.pinZoneMinutes * 60e3);
  if (!markets.length) throw new Error(`no open BTC threshold market for "${query}"`);
  const mkt = markets.sort((a, b) => Math.abs(a.threshold - spot) - Math.abs(b.threshold - spot))[0];
  const shares = Number(arg("--shares", "50"));
  const vol = Math.max(DEFAULTS.volFloor, 0.45);
  const years = (mkt.observationMs - now) / YEAR_MS;
  const h = targetHedge({ side: "Yes", shares, spot, strike: mkt.threshold, vol, years, maxHedgeUsd: 2000 });
  const lot = BigInt(Math.max(1, Math.round(Math.abs(h.target) * 10 ** btc.sizeDecimals)));
  console.log(`market ${mkt.marketId} "${mkt.question}" yes ${mkt.yesPrice}  observation ${new Date(mkt.observationMs).toISOString()}`);
  console.log(`Perpl testnet BTC mark ${spot}  vol ${vol}  model P(yes) ${h.prob.toFixed(3)}  delta/share ${h.deltaPerShare.toExponential(3)}`);
  console.log(`position YES x${shares} -> hedge short ${Number(lot) / 10 ** btc.sizeDecimals} BTC (~$${(Number(lot) / 10 ** btc.sizeDecimals * spot).toFixed(2)})`);
  Object.assign(log, { market: mkt, spot, vol, model: { prob: h.prob, deltaPerShare: h.deltaPerShare, targetBtc: h.target }, shares, lotLNS: lot.toString() });

  const order = (type, lotLNS, price) => ({ orderDescId: 0n, perpId: BTC, orderType: type, orderId: 0n, pricePNS: price, lotLNS, expiryBlock: 0n, postOnly: false, fillOrKill: false, immediateOrCancel: true, maxMatches: 16n, leverageHdths: 200n, lastExecutionBlock: 0n, amountCNS: 0n, maxNegPnlCollatBPS: BigInt(btc.maxNegPnlBps) });
  async function send(label, c, fn, args) {
    await c[fn].staticCall(...args, { from: wallet.address });
    const est = await c[fn].estimateGas(...args);
    if (!SEND) { console.log(`  [dry] ${label}: gas ${est}`); return null; }
    const t = await c[fn](...args, { gasLimit: (est * 13n) / 10n });
    const r = await t.wait();
    if (r.status !== 1) throw new Error(`${label} reverted ${t.hash}`);
    console.log(`  ${label}: ${EXPLORER}/tx/${t.hash}`);
    log.txs.push({ step: label, tx: t.hash, url: `${EXPLORER}/tx/${t.hash}`, block: r.blockNumber });
    return t.hash;
  }

  // 2. Account: test AUSD from the faucet, approve, createAccount (once).
  const dec = Number(await ausd.decimals());
  const need = ethers.parseUnits(String(ACCOUNT_AUSD), dec);
  let acct = await ex.getAccountByAddr(wallet.address).catch(() => ({ accountId: 0n }));
  if (acct.accountId === 0n) {
    if ((await ausd.balanceOf(wallet.address)) < need) {
      if (!SEND) console.log("  [dry] faucet requestFunds (10,000 test AUSD)");
      else await send("faucet requestFunds", new ethers.Contract(FAUCET, FAUCET_ABI, signer), "requestFunds", [wallet.address]);
    }
    if ((await ausd.allowance(wallet.address, NET.exchange)) < need) {
      if (!SEND) console.log("  [dry] approve AUSD");
      else await send("approve AUSD", ausd, "approve", [NET.exchange, need]);
    }
    if (!SEND) { console.log(`  [dry] createAccount(${ACCOUNT_AUSD} AUSD)`); console.log("\nDRY RUN OK"); return; }
    await send(`createAccount ${ACCOUNT_AUSD} AUSD`, ex, "createAccount", [need]);
    acct = await ex.getAccountByAddr(wallet.address);
  }
  log.accountId = acct.accountId.toString();

  // 3. Open the hedge, read it back, close it.
  await send("execOrder openShort (hedge)", ex, "execOrder", [order(ORDER.openShort, lot, (btc.markPNS * 98n) / 100n)]);
  if (!SEND) { console.log("\nDRY RUN OK"); return; }
  let [p] = await ex.getPosition(BTC, acct.accountId);
  console.log(`position after open: type ${p.positionType} lot ${p.lotLNS} entry ${Number(p.pricePNS) / 10 ** btc.priceDecimals} deposit ${p.depositCNS}`);
  log.positionAfterOpen = { type: Number(p.positionType), lotLNS: p.lotLNS.toString(), entryPNS: p.pricePNS.toString(), depositCNS: p.depositCNS.toString() };
  if (p.lotLNS > 0n) {
    const b2 = await perplBtc();
    await send("execOrder closeShort (unwind)", ex, "execOrder", [order(ORDER.closeShort, p.lotLNS, (b2.markPNS * 102n) / 100n)]);
    [p] = await ex.getPosition(BTC, acct.accountId);
    console.log(`position after close: lot ${p.lotLNS}`);
    log.positionAfterClose = { lotLNS: p.lotLNS.toString() };
  }
  mkdirSync(path.join(HERE, "..", "examples"), { recursive: true });
  const f = path.join(HERE, "..", "examples", `live-testnet-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(f, JSON.stringify(log, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n");
  console.log(`receipts -> ${path.relative(process.cwd(), f)}`);
}

await main();
