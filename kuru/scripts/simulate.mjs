// Full lifecycle on the CURRENT Monad testnet state with eth_simulateV1: nothing is signed or sent.
//
//   node kuru/scripts/simulate.mjs [--market 5219930] [--outcome yes|no]
//
// One simulated block, calls in order, state carried between them, against the live Kuru v1 testnet
// Router and MarginAccount:
//   deploy TestUSD, deploy DisputeNoteFactory, createNote for the market's disputed proposal,
//   faucet + approve + mint 200 notes, Kuru Router.deployProxy (CHANGE/tUSD), MarginAccount deposits,
//   two bids + two asks around the Predge reference rate, bestBidAsk, a taker deposits 5 tUSD and
//   crosses the ask with a limit buy of 8 CHANGE, withdraws the CHANGE, then a HYPOTHETICAL settlement report from the CRE forwarder (the market is still
//   under a UMA vote; --outcome picks the payout vector), and the taker redeems.
// Writes kuru/deployments/simulate-<time>.json with per-call status and gas.
import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { compile } from "./compile.mjs";
import { KURU, MARKET_PARAMS as P, MOCK_FORWARDER, predgeRecord, proposalVector, seedQuotes } from "./deploy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const MARKET = arg("--market", "5219930");
const OUTCOME = arg("--outcome", "yes"); // hypothetical chain outcome for the settlement step
const RPC = process.env.RPC_URL || "https://testnet-rpc.monad.xyz";
const ME = "0x9F0Af03C5695b72903c03852f7Dd4Fe5A0d49Fc9"; // issuer / market maker (deployer address, no key used)
const TAKER = "0x00000000000000000000000000000000000B0B00";

const provider = new ethers.JsonRpcProvider(RPC, 10143, { staticNetwork: true });
const rec = await predgeRecord(MARKET);
const proposal = proposalVector(rec.disputedProposal);
const quotes = seedQuotes(Number(arg("--ref", rec.reference)));
const usdC = compile("TestUSD.sol", "TestUSD");
const facC = compile("DisputeNotes.sol", "DisputeNoteFactory");
const tok = new ethers.Interface(compile("DisputeNotes.sol", "NoteToken").abi);
const fac = new ethers.Interface(facC.abi);
const usd = new ethers.Interface(usdC.abi);
const router = new ethers.Interface(["function deployProxy(uint8,address,address,uint96,uint32,uint32,uint96,uint96,uint256,uint256,uint96) returns (address)"]);
const margin = new ethers.Interface(["function deposit(address,address,uint256) payable", "function getBalance(address,address) view returns (uint256)", "function withdraw(uint256,address)"]);
const book = new ethers.Interface([
  "function addBuyOrder(uint32,uint96,bool)", "function addSellOrder(uint32,uint96,bool)", "function bestBidAsk() view returns (uint256,uint256)",
]);
const coder = ethers.AbiCoder.defaultAbiCoder();

const nonce = await provider.getTransactionCount(ME);
const USD = ethers.getCreateAddress({ from: ME, nonce });
const FACTORY = ethers.getCreateAddress({ from: ME, nonce: nonce + 1 });
const HOLD = ethers.getCreateAddress({ from: FACTORY, nonce: 1 });
const CHANGE = ethers.getCreateAddress({ from: FACTORY, nonce: 2 });
const proxyArgs = [P.type, CHANGE, USD, P.sizePrecision, P.pricePrecision, P.tickSize, P.minSize, P.maxSize, P.takerFeeBps, P.makerFeeBps, P.kuruAmmSpread];
const MARKET_ADDR = ethers.getAddress(coder.decode(["address"], await provider.send("eth_call", [{ from: ME, to: KURU.router, data: router.encodeFunctionData("deployProxy", proxyArgs) }, "latest", { [CHANGE]: { code: usdC.deployedBytecode }, [USD]: { code: usdC.deployedBytecode } }]))[0]);
const U = (x) => ethers.parseUnits(String(x), 6);
const expiry = Math.floor(Date.now() / 1000) + 60 * 86400;
const asks = quotes.filter((q) => q.side === "sell"), bids = quotes.filter((q) => q.side === "buy");
const chgDeposit = U(asks.reduce((s, q) => s + q.size, 0));
const usdDeposit = U(Math.ceil(bids.reduce((s, q) => s + q.price * q.size, 0)) + 1);
const payout = OUTCOME === "yes" ? [1n, 0n] : [0n, 1n];
const report = coder.encode(["bytes32", "uint256", "uint256", "uint256", "uint64"], [rec.conditionId, payout[0], payout[1], 1n, 0n]);

const c = (label, from, to, data, gas = 6_000_000) => ({ label, call: { from, ...(to ? { to } : {}), data, gas: ethers.toBeHex(gas), maxFeePerGas: ethers.toBeHex(ethers.parseUnits("250", "gwei")), maxPriorityFeePerGas: ethers.toBeHex(ethers.parseUnits("2", "gwei")) } });
const steps = [
  c("deploy TestUSD", ME, null, usdC.bytecode),
  c("deploy DisputeNoteFactory", ME, null, ethers.concat([facC.bytecode, coder.encode(["address", "address"], [USD, MOCK_FORWARDER])])),
  c("createNote", ME, FACTORY, fac.encodeFunctionData("createNote", [rec.conditionId, proposal, rec.disputeTx, expiry, MARKET, MARKET])),
  c("TestUSD.faucet (issuer)", ME, USD, usd.encodeFunctionData("faucet", [ME, U(1000)])),
  c("approve tUSD -> factory", ME, USD, usd.encodeFunctionData("approve", [FACTORY, ethers.MaxUint256])),
  c("mint 200 HOLD + 200 CHANGE", ME, FACTORY, fac.encodeFunctionData("mint", [0, U(200), ME])),
  c("Kuru Router.deployProxy CHANGE/tUSD", ME, KURU.router, router.encodeFunctionData("deployProxy", proxyArgs), 8_000_000),
  c("approve CHANGE -> MarginAccount", ME, CHANGE, tok.encodeFunctionData("approve", [KURU.marginAccount, chgDeposit])),
  c("MarginAccount.deposit CHANGE", ME, KURU.marginAccount, margin.encodeFunctionData("deposit", [ME, CHANGE, chgDeposit])),
  c("approve tUSD -> MarginAccount", ME, USD, usd.encodeFunctionData("approve", [KURU.marginAccount, usdDeposit])),
  c("MarginAccount.deposit tUSD", ME, KURU.marginAccount, margin.encodeFunctionData("deposit", [ME, USD, usdDeposit])),
  ...quotes.map((q) => c(`${q.side} ${q.size} CHANGE @ ${q.price.toFixed(2)}`, ME, MARKET_ADDR, book.encodeFunctionData(q.side === "buy" ? "addBuyOrder" : "addSellOrder", [Math.round(q.price * P.pricePrecision), BigInt(q.size) * P.sizePrecision, true]))),
  c("bestBidAsk", ME, MARKET_ADDR, book.encodeFunctionData("bestBidAsk", [])),
  c("TestUSD.faucet (taker)", TAKER, USD, usd.encodeFunctionData("faucet", [TAKER, U(5)])),
  c("taker approve tUSD -> MarginAccount", TAKER, USD, usd.encodeFunctionData("approve", [KURU.marginAccount, U(5)])),
  c("taker MarginAccount.deposit 5 tUSD", TAKER, KURU.marginAccount, margin.encodeFunctionData("deposit", [TAKER, USD, U(5)])),
  c("taker crossing limit buy 8 CHANGE @ 0.25", TAKER, MARKET_ADDR, book.encodeFunctionData("addBuyOrder", [2500, 8n * P.sizePrecision, false])),
  c("taker margin CHANGE balance", TAKER, KURU.marginAccount, margin.encodeFunctionData("getBalance", [TAKER, CHANGE])),
  c("taker withdraws CHANGE from margin", TAKER, KURU.marginAccount, "0x"), // filled in below
  c("taker CHANGE balance", TAKER, CHANGE, tok.encodeFunctionData("balanceOf", [TAKER])),
  c(`HYPOTHETICAL CRE report via forwarder: payouts [${payout}]`, MOCK_FORWARDER, FACTORY, fac.encodeFunctionData("onReport", ["0x", report])),
  c("note state", ME, FACTORY, fac.encodeFunctionData("notes", [0])),
  c("taker redeems CHANGE", TAKER, FACTORY, "0x"), // filled in below once the balance is known
  c("taker tUSD balance", TAKER, USD, usd.encodeFunctionData("balanceOf", [TAKER])),
];

async function run(list) {
  const res = await provider.send("eth_simulateV1", [{
    // The MockKeystoneForwarder is a contract; its code is blanked inside the simulation only so the
    // simulator accepts a call "from" it (EIP-3607). On chain the forwarder itself makes this call.
    blockStateCalls: [{ stateOverrides: { [ME]: { balance: "0x56BC75E2D63100000" }, [TAKER]: { balance: "0x56BC75E2D63100000" }, [MOCK_FORWARDER]: { balance: "0x56BC75E2D63100000", code: "0x" } }, calls: list.map((s) => s.call) }],
  }, "latest"]);
  return res[0].calls;
}

// Passes: learn the taker's margin CHANGE, fill the withdraw; learn the wallet CHANGE, fill the redeem.
const idx = (l) => steps.findIndex((s) => s.label === l);
const num = (cs, l) => (cs[idx(l)].status === "0x1" ? BigInt(cs[idx(l)].returnData) : 0n);
let calls = await run(steps);
steps[idx("taker withdraws CHANGE from margin")].call.data = margin.encodeFunctionData("withdraw", [num(calls, "taker margin CHANGE balance"), CHANGE]);
calls = await run(steps);
steps[idx("taker redeems CHANGE")].call.data = fac.encodeFunctionData("redeem", [0, 0n, num(calls, "taker CHANGE balance"), TAKER]);
calls = await run(steps);

const decode = (label, ret) => {
  if (label === "bestBidAsk") { const [b, a] = coder.decode(["uint256", "uint256"], ret); return `bid ${b} ask ${a} (raw)`; }
  if (label.endsWith("balance")) return ethers.formatUnits(BigInt(ret), 6);
  if (label === "note state") { const n = fac.decodeFunctionResult("notes", ret)[0]; return `state ${n.state} (1 HOLD wins, 2 CHANGE wins), collateralLocked ${ethers.formatUnits(n.collateralLocked, 6)}`; }
  if (label.startsWith("taker market buy")) return `returned ${BigInt(ret)}`;
  return "";
};
const rows = steps.map((s, i) => ({ step: s.label, ok: calls[i].status === "0x1", note: calls[i].status === "0x1" ? decode(s.label, calls[i].returnData) : `${calls[i].error?.message || ""} ${calls[i].returnData || ""} ${calls[i].error?.data || ""}` }));
console.log(`market ${MARKET} "${rec.question}"  disputed proposal ${rec.disputedProposal} [${proposal}]  reference ${rec.reference}`);
console.log(`simulated addresses: TestUSD ${USD}  factory ${FACTORY}  HOLD ${HOLD}  CHANGE ${CHANGE}  Kuru market ${MARKET_ADDR}`);
// (Monad reports gasUsed == gas limit, so per-call gas is not printed; see deploy.mjs for estimates.)
for (const r of rows) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.step.padEnd(52)} ${r.note}`);
const out = path.join(HERE, "..", "deployments");
mkdirSync(out, { recursive: true });
const file = path.join(out, `simulate-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), rpc: RPC, market: MARKET, conditionId: rec.conditionId, proposal: proposal.map(String), reference: rec.reference, quotes, hypotheticalOutcome: OUTCOME, addresses: { USD, FACTORY, HOLD, CHANGE, MARKET_ADDR }, rows }, null, 2) + "\n");
console.log(`written ${file}`);
