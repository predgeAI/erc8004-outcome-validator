// Dispute-hedge notes on Monad TESTNET: deploy, list one note, mint, open a Kuru CHANGE/tUSD book, seed quotes.
//
//   node kuru/scripts/deploy.mjs                                 dry run: compile, estimate, check Kuru, nothing sent
//   CONFIRM_TESTNET=yes node kuru/scripts/deploy.mjs --send      run every step not yet done (resumable)
//
// Options: --market 5219930   Polymarket market id (its record on api.predge.io gives condition id,
//                             disputed proposal and dispute tx; the API is used for listing and the
//                             initial quotes only, never for settlement)
//          --collateral 0x..  use an existing 6-decimal ERC-20 instead of deploying TestUSD
//          --mint 200         notes to mint for the seed quotes (whole units)
//          --ref 0.10         quote around this CHANGE price instead of the Predge reference rate
//
// Steps (state in kuru/deployments/monad-testnet.json, each step is skipped once recorded):
//   1 TestUSD                      testnet collateral with an open faucet (skipped with --collateral)
//   2 DisputeNoteFactory           collateral + CRE forwarder (MockKeystoneForwarder on testnet)
//   3 createNote                   HOLD/CHANGE pair for the disputed proposal
//   4 faucet + approve + mint      deployer mints N HOLD + N CHANGE
//   5 Router.deployProxy           Kuru v1 order book CHANGE/tUSD (permissionless on testnet)
//   6 MarginAccount.deposit        CHANGE and tUSD into Kuru's margin account
//   7 addBuyOrder / addSellOrder   two bids and two asks around the Predge reference rate
//
// Key: PRIVATE_KEY from the environment or ~/.predge-monad/monad-testnet.env. Never printed.
// Refuses any chain id other than 10143. Monad charges the gas LIMIT, so limits are estimate + 10%.
import os from "node:os";
import path from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { compile } from "./compile.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const CHAIN_ID = 10143n;
const RPC = process.env.RPC_URL || "https://testnet-rpc.monad.xyz";
const EXPLORER = "https://testnet.monadvision.com";
const SEND = argv.includes("--send");
if (SEND && process.env.CONFIRM_TESTNET !== "yes") { console.error("Refusing: --send needs CONFIRM_TESTNET=yes"); process.exit(2); }
const MARKET = arg("--market", "5219930");
const MINT = BigInt(arg("--mint", "200"));

// Kuru v1 on Monad testnet (docs.kuru.io/contracts/Contract-addresses)
export const KURU = {
  router: "0x7EFbE105Ca7415dE98F96622173458ac1c054630",
  marginAccount: "0xd029C2D98ff85D8F64799017fE00a59B1159CE02",
  usdc: "0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570", // official testnet USDC, no public mint
};
// CRE MockKeystoneForwarder on Monad testnet (what `cre workflow simulate --broadcast` calls).
export const MOCK_FORWARDER = "0xB9F79d863261869B234c481D1f9A7af84AeAd192";
// Market params from @kuru-labs/kuru-sdk ParamCreator.calculatePrecisions(0.2, 1, 1, 1, 500):
// price in units of 1e-4 tUSD, tick 0.01, size in units of 1e-4 CHANGE, min 1 CHANGE, max 1,000,000.
export const MARKET_PARAMS = { type: 0, sizePrecision: 10_000n, pricePrecision: 10_000, tickSize: 100, minSize: 10_000n, maxSize: 10_000_000_000n, takerFeeBps: 30n, makerFeeBps: 10n, kuruAmmSpread: 100n };

const ROUTER_ABI = [
  "function deployProxy(uint8 _type, address _baseAssetAddress, address _quoteAssetAddress, uint96 _sizePrecision, uint32 _pricePrecision, uint32 _tickSize, uint96 _minSize, uint96 _maxSize, uint256 _takerFeeBps, uint256 _makerFeeBps, uint96 _kuruAmmSpread) returns (address proxy)",
  "event MarketRegistered(address baseAsset, address quoteAsset, address market, address vaultAddress, uint32 pricePrecision, uint96 sizePrecision, uint32 tickSize, uint96 minSize, uint96 maxSize, uint256 takerFeeBps, uint256 makerFeeBps, uint96 kuruAmmSpread)",
];
const MARGIN_ABI = ["function deposit(address _user, address _token, uint256 _amount) payable", "function getBalance(address _user, address _token) view returns (uint256)"];
const BOOK_ABI = [
  "function addBuyOrder(uint32 _price, uint96 _size, bool _postOnly)",
  "function addSellOrder(uint32 _price, uint96 _size, bool _postOnly)",
  "function bestBidAsk() view returns (uint256, uint256)",
];
const ERC20_ABI = ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)", "function symbol() view returns (string)"];

// Gas used on an in-process EVM (ganache) for steps that depend on earlier deployments; the Kuru
// order and deposit figures are conservative guesses. Live steps are re-estimated before sending.
const GAS_GUESS = { createNote: 1_290_000n, faucet: 70_000n, approve: 50_000n, mint: 190_000n, deposit: 150_000n, order: 350_000n };

function loadKey() {
  if (process.env.PRIVATE_KEY) return process.env.PRIVATE_KEY;
  const f = process.env.PREDGE_ENV_FILE || path.join(os.homedir(), ".predge-monad/monad-testnet.env");
  const env = Object.fromEntries(readFileSync(f, "utf8").split("\n").map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2]]));
  return env.PRIVATE_KEY;
}

/** Quotes around the reference probability that the outcome settles differently (= fair CHANGE price). */
export function seedQuotes(ref, { tick = 0.01, half = 0.03, step = 0.03, levels = 2, size = 50 } = {}) {
  const t = (x) => Math.round(x / tick);
  const out = [];
  for (let i = 0; i < levels; i++) {
    const bid = Math.max(1, Math.floor((ref - half - i * step) / tick + 1e-9));
    const ask = Math.min(t(1) - 1, Math.ceil((ref + half + i * step) / tick - 1e-9));
    out.push({ side: "buy", price: bid * tick, size }, { side: "sell", price: ask * tick, size });
  }
  return out;
}

export async function predgeRecord(marketId) {
  const r = await fetch(`https://api.predge.io/v1/settlement-risk/${marketId}`);
  if (!r.ok) throw new Error(`api.predge.io ${marketId}: HTTP ${r.status}`);
  const j = await r.json();
  const d = (j.disputes || [])[0];
  if (!d) throw new Error(`market ${marketId} has no dispute`);
  return {
    conditionId: j.market.condition_id,
    question: j.market.question,
    disputedProposal: d.disputed_proposal,
    disputeTx: d.tx,
    disputedAt: d.disputed_at,
    resolved: j.resolved_on_chain,
    reference: Number(j.settlement_estimate?.settles_differently_probability),
    referenceBasis: j.settlement_estimate?.basis,
    referenceCi: j.settlement_estimate?.reference?.ci95,
  };
}

// Binary Polymarket markets: outcome slot 0 = "Yes" (or the first label), 1 = "No".
export function proposalVector(label) {
  const l = String(label).toLowerCase();
  if (l === "yes") return [1n, 0n];
  if (l === "no") return [0n, 1n];
  if (l === "50-50" || l === "unknown" || l === "0.5") return [1n, 1n];
  throw new Error(`disputed proposal "${label}" is not Yes/No/50-50; pass the vector by hand`);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: ethers.Network.from(CHAIN_ID), cacheTimeout: -1 });
  if (BigInt(await provider.send("eth_chainId", [])) !== CHAIN_ID) throw new Error("RPC is not Monad testnet (10143); refusing");
  const wallet = new ethers.Wallet(loadKey(), provider);
  const signer = new ethers.NonceManager(wallet);
  const me = wallet.address;
  const outDir = path.join(HERE, "..", "deployments");
  mkdirSync(outDir, { recursive: true });
  const stateFile = path.join(outDir, "monad-testnet.json");
  const st = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : { chainId: 10143, deployer: me, txs: {} };
  const save = () => SEND && writeFileSync(stateFile, JSON.stringify(st, null, 2) + "\n");

  const rec = await predgeRecord(MARKET);
  const proposal = proposalVector(rec.disputedProposal);
  const fee = await provider.getFeeData();
  const price = fee.maxFeePerGas ?? fee.gasPrice;
  const balance = await provider.getBalance(me);
  console.log(`chain 10143  deployer ${me}  balance ${ethers.formatEther(balance)} MON  gas ${ethers.formatUnits(fee.gasPrice, "gwei")} gwei (max ${ethers.formatUnits(price, "gwei")})  ${SEND ? "SEND" : "DRY RUN"}`);
  console.log(`market ${MARKET}: "${rec.question}"  condition ${rec.conditionId}`);
  console.log(`disputed proposal ${rec.disputedProposal} -> payout vector [${proposal}]  dispute tx ${rec.disputeTx}  resolved on chain: ${rec.resolved}`);
  console.log(`Predge reference rate (settles differently, ${rec.referenceBasis}): ${rec.reference}  ci95 ${JSON.stringify(rec.referenceCi)}  (quoting input only)`);
  // --ref overrides the reference rate used for the seed quotes (e.g. to quote nearer the Polymarket price).
  const quotes = seedQuotes(Number(arg("--ref", rec.reference)));
  console.log(`seed quotes CHANGE/tUSD: ${quotes.map((q) => `${q.side} ${q.size} @ ${q.price.toFixed(2)}`).join(", ")}`);

  const usdC = compile("TestUSD.sol", "TestUSD");
  const facC = compile("DisputeNotes.sol", "DisputeNoteFactory");
  const tokC = compile("DisputeNotes.sol", "NoteToken");
  const lim = (g) => (g * 110n) / 100n;
  const plan = [];
  const est = async (tx, overrides) => BigInt(await provider.send("eth_estimateGas", overrides ? [tx, "latest", overrides] : [tx, "latest"]));

  // Dry-run gas: real estimates where possible (state overrides stand in for contracts not yet deployed).
  const FAKE_USD = "0x00000000000000000000000000000000000a11ce", FAKE_CHG = "0x00000000000000000000000000000000000c4a6e";
  const ov = { [FAKE_USD]: { code: usdC.deployedBytecode }, [FAKE_CHG]: { code: usdC.deployedBytecode } };
  const coll = arg("--collateral") || st.collateral;
  if (!coll) plan.push(["TestUSD deploy", await est({ from: me, data: usdC.bytecode })]);
  if (!st.factory) {
    const data = ethers.concat([facC.bytecode, ethers.AbiCoder.defaultAbiCoder().encode(["address", "address"], [coll || FAKE_USD, MOCK_FORWARDER])]);
    plan.push(["DisputeNoteFactory deploy", await est({ from: me, data }, coll ? undefined : ov)]);
  }
  if (st.noteId === undefined) plan.push(["createNote (2 NoteTokens)", GAS_GUESS.createNote]);
  if (!st.minted) plan.push(["faucet + approve + mint", GAS_GUESS.faucet + GAS_GUESS.approve + GAS_GUESS.mint]);
  const router = new ethers.Contract(KURU.router, ROUTER_ABI, signer);
  const P = MARKET_PARAMS;
  const proxyArgs = (base, quote) => [P.type, base, quote, P.sizePrecision, P.pricePrecision, P.tickSize, P.minSize, P.maxSize, P.takerFeeBps, P.makerFeeBps, P.kuruAmmSpread];
  if (!st.kuruMarket) {
    const data = router.interface.encodeFunctionData("deployProxy", proxyArgs(FAKE_CHG, FAKE_USD));
    const tx = { from: me, to: KURU.router, data };
    const g = await est(tx, ov);
    const would = ethers.AbiCoder.defaultAbiCoder().decode(["address"], await provider.send("eth_call", [tx, "latest", ov]))[0];
    console.log(`Kuru Router.deployProxy check (eth_call with stand-in tokens): succeeds, would return ${would}, gas ${g}`);
    plan.push(["Kuru Router.deployProxy", g]);
  }
  if (!st.deposited) plan.push(["approve x2 + MarginAccount.deposit x2", 2n * (GAS_GUESS.approve + GAS_GUESS.deposit)]);
  if (!st.orders) plan.push([`${quotes.length} limit orders`, BigInt(quotes.length) * GAS_GUESS.order]);
  let total = 0n;
  for (const [name, g] of plan) { total += lim(g); console.log(`  ${name.padEnd(40)} gas ${String(g).padStart(9)}  limit ${lim(g)}`); }
  // Monad bills gas limit x (base fee + tip); 25% headroom for a base-fee rise between steps.
  const need = (total * fee.gasPrice * 125n) / 100n;
  console.log(`total gas limit ${total}  cost ~${ethers.formatEther(total * fee.gasPrice)} MON at ${ethers.formatUnits(fee.gasPrice, "gwei")} gwei; required balance with 25% headroom ${ethers.formatEther(need)} MON  (balance ${ethers.formatEther(balance)})`);
  if (!SEND) {
    if (balance < need) console.log(`NOT ENOUGH MON: short by ${ethers.formatEther(need - balance)} MON. Fund ${me} on Monad testnet, then run with --send.`);
    console.log("dry run: nothing sent");
    return;
  }
  if (balance < need) throw new Error(`balance ${ethers.formatEther(balance)} < needed ${ethers.formatEther(need)} MON; refusing to start`);

  const link = (h) => `${EXPLORER}/tx/${h}`;
  const send = async (label, txPromiseFn) => {
    const tx = await txPromiseFn();
    const r = await tx.wait();
    if (r.status !== 1) throw new Error(`${label} failed: ${link(tx.hash)}`);
    console.log(`${label}: ${link(tx.hash)}  gas ${r.gasUsed}`);
    st.txs[label] = tx.hash;
    save();
    return r;
  };
  const withLimit = async (contract, fn, args) => {
    const g = await contract[fn].estimateGas(...args);
    return contract[fn](...args, { gasLimit: lim(g) });
  };

  // 1 collateral
  if (!st.collateral) {
    if (arg("--collateral")) st.collateral = ethers.getAddress(arg("--collateral"));
    else {
      const f = new ethers.ContractFactory(usdC.abi, usdC.bytecode, signer);
      const c = await f.deploy({ gasLimit: lim(await est({ from: me, data: usdC.bytecode })) });
      await send("deploy TestUSD", async () => c.deploymentTransaction());
      st.collateral = await c.getAddress();
      st.collateralIsTestUSD = true;
    }
    save();
  }
  // 2 factory
  if (!st.factory) {
    const f = new ethers.ContractFactory(facC.abi, facC.bytecode, signer);
    const dtx = await f.getDeployTransaction(st.collateral, MOCK_FORWARDER);
    const c = await f.deploy(st.collateral, MOCK_FORWARDER, { gasLimit: lim(await est({ from: me, data: dtx.data })) });
    await send("deploy DisputeNoteFactory", async () => c.deploymentTransaction());
    st.factory = await c.getAddress();
    st.forwarder = MOCK_FORWARDER;
    save();
  }
  const factory = new ethers.Contract(st.factory, facC.abi, signer);
  // 3 note
  if (st.noteId === undefined) {
    const expiry = Math.floor(Date.now() / 1000) + 60 * 86400;
    const r = await send("createNote", () => withLimit(factory, "createNote", [rec.conditionId, proposal, rec.disputeTx, expiry, MARKET, MARKET]));
    const ev = r.logs.map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "NoteCreated");
    Object.assign(st, { noteId: Number(ev.args.noteId), hold: ev.args.hold, change: ev.args.change, expiry, marketId: MARKET, conditionId: rec.conditionId, proposal: proposal.map(String), disputeTx: rec.disputeTx });
    save();
  }
  const usd = new ethers.Contract(st.collateral, [...ERC20_ABI, "function faucet(address,uint256)"], signer);
  const dec = Number(await usd.decimals());
  const U = (x) => ethers.parseUnits(String(x), dec);
  // 4 mint
  if (!st.minted) {
    const quoteNeed = quotes.filter((q) => q.side === "buy").reduce((s, q) => s + q.price * q.size, 0);
    if (st.collateralIsTestUSD) await send("TestUSD.faucet", () => withLimit(usd, "faucet", [me, U(Number(MINT) + Math.ceil(quoteNeed) + 10)]));
    await send("approve collateral -> factory", () => withLimit(usd, "approve", [st.factory, ethers.MaxUint256]));
    await send(`mint ${MINT} notes`, () => withLimit(factory, "mint", [st.noteId, U(MINT), me]));
    st.minted = MINT.toString();
    save();
  }
  // 5 Kuru market
  if (!st.kuruMarket) {
    const r = await send("Kuru Router.deployProxy CHANGE/tUSD", () => withLimit(router, "deployProxy", proxyArgs(st.change, st.collateral)));
    const ev = r.logs.map((l) => { try { return router.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "MarketRegistered");
    st.kuruMarket = ev.args.market;
    st.kuruVault = ev.args.vaultAddress;
    st.kuruParams = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, String(v)]));
    save();
  }
  // 6 margin deposits
  const margin = new ethers.Contract(KURU.marginAccount, MARGIN_ABI, signer);
  const change = new ethers.Contract(st.change, ERC20_ABI, signer);
  const asks = quotes.filter((q) => q.side === "sell"), bids = quotes.filter((q) => q.side === "buy");
  if (!st.deposited) {
    const chgAmt = U(asks.reduce((s, q) => s + q.size, 0));
    const usdAmt = U(Math.ceil(bids.reduce((s, q) => s + q.price * q.size, 0)) + 1);
    await send("approve CHANGE -> MarginAccount", () => withLimit(change, "approve", [KURU.marginAccount, chgAmt]));
    await send("MarginAccount.deposit CHANGE", () => withLimit(margin, "deposit", [me, st.change, chgAmt]));
    await send("approve tUSD -> MarginAccount", () => withLimit(usd, "approve", [KURU.marginAccount, usdAmt]));
    await send("MarginAccount.deposit tUSD", () => withLimit(margin, "deposit", [me, st.collateral, usdAmt]));
    st.deposited = { change: chgAmt.toString(), collateral: usdAmt.toString() };
    save();
  }
  // 7 orders
  if (!st.orders) {
    const book = new ethers.Contract(st.kuruMarket, BOOK_ABI, signer);
    st.orders = [];
    for (const q of quotes) {
      const p = Math.round(q.price * P.pricePrecision);
      const s = BigInt(q.size) * P.sizePrecision;
      await send(`${q.side} ${q.size} CHANGE @ ${q.price.toFixed(2)}`, () => withLimit(book, q.side === "buy" ? "addBuyOrder" : "addSellOrder", [p, s, true]));
      st.orders.push({ ...q, priceUnits: p, sizeUnits: s.toString() });
    }
    save();
    try { const [b, a] = await book.bestBidAsk(); console.log(`bestBidAsk raw: ${b} / ${a}`); } catch {}
  }
  console.log(JSON.stringify({ factory: st.factory, collateral: st.collateral, hold: st.hold, change: st.change, kuruMarket: st.kuruMarket }, null, 2));
  console.log(`state: ${stateFile}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
