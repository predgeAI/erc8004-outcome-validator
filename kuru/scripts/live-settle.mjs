// Live lifecycle on Monad TESTNET for notes on Polymarket markets that already resolved on Polygon:
//   list (createNote) -> mint -> [CRE workflow writes the settlement report] -> redeem.
//
//   CONFIRM_TESTNET=yes node kuru/scripts/live-settle.mjs list      createNote + faucet + approve + mint
//   (then, from kuru/cre: cre workflow simulate ./settle-notes --broadcast ... per condition)
//   CONFIRM_TESTNET=yes node kuru/scripts/live-settle.mjs redeem    redeem the winning leg, print balances
//   node kuru/scripts/live-settle.mjs status                        read-only
//
// Settlement is NOT done by this script: the factory accepts it only from the CRE forwarder.
// State and tx hashes: kuru/examples/live-settle-2026-10-13.json. Key never printed.
import os from "node:os";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { predgeRecord } from "./deploy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "../examples/live-settle-2026-10-13.json");
const DEPLOY = JSON.parse(readFileSync(path.join(HERE, "../deployments/monad-testnet.json"), "utf8"));
const RPC = process.env.RPC_URL || "https://testnet-rpc.monad.xyz";
const EXPLORER = "https://testnet.monadvision.com";
const CHAIN_ID = 10143n;
const MINT = 10n * 10n ** 6n; // 10 pairs per note (6-decimal collateral)
const cmd = process.argv[2] || "status";
if (cmd !== "status" && process.env.CONFIRM_TESTNET !== "yes") { console.error("Refusing: needs CONFIRM_TESTNET=yes"); process.exit(2); }

// Markets already resolved on Polygon CTF, each with one disputed proposal.
// Vectors are CTF outcome slots: 1112268 is [Over, Under], 1004831 is [Yes, No].
const MARKETS = [
  { marketId: "1112268", symbol: "1112268", proposal: [1n, 0n], proposalLabel: "Over" },
  { marketId: "1004831", symbol: "1004831", proposal: [0n, 1n], proposalLabel: "No" },
];

const FACTORY_ABI = [
  "function createNote(bytes32,uint256[2],bytes32,uint64,string,string) returns (uint256)",
  "function mint(uint256,uint256,address)",
  "function redeem(uint256,uint256,uint256,address) returns (uint256)",
  "function noteCount() view returns (uint256)",
  "function owner() view returns (address)",
  "function forwarder() view returns (address)",
  "function notes(uint256) view returns ((bytes32 conditionId, uint256 proposal0, uint256 proposal1, bytes32 disputeTx, uint64 expiry, uint8 state, address hold, address change, uint256 collateralLocked, string marketId))",
  "function resolutions(bytes32) view returns (uint256 payout0, uint256 payout1, uint256 denominator, uint64 polygonBlock, uint64 reportedAt)",
  "event NoteCreated(uint256 indexed noteId, bytes32 indexed conditionId, string marketId, uint256 proposal0, uint256 proposal1, bytes32 disputeTx, uint64 expiry, address hold, address change)",
];
const ERC20_ABI = ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)", "function faucet(address,uint256)"];
const STATE = ["OPEN", "SETTLED_HOLD", "SETTLED_CHANGE", "EXPIRED"];

function loadKey() {
  if (process.env.PRIVATE_KEY) return process.env.PRIVATE_KEY;
  const f = path.join(os.homedir(), ".predge-monad/monad-testnet.env");
  const m = readFileSync(f, "utf8").split("\n").map((l) => /^PRIVATE_KEY=(.*)$/.exec(l.trim())).find(Boolean);
  return m[1];
}
const fmt = (x) => ethers.formatUnits(x, 6);
const link = (tx) => `${EXPLORER}/tx/${tx}`;

const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: ethers.Network.from(CHAIN_ID), cacheTimeout: -1 });
if (BigInt(await provider.send("eth_chainId", [])) !== CHAIN_ID) throw new Error("not Monad testnet");
const wallet = new ethers.Wallet(loadKey(), provider);
const me = wallet.address;
const factory = new ethers.Contract(DEPLOY.factory, FACTORY_ABI, wallet);
const usd = new ethers.Contract(DEPLOY.collateral, ERC20_ABI, wallet);
const st = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {
  chainId: 10143, explorer: EXPLORER, factory: DEPLOY.factory, collateral: DEPLOY.collateral,
  forwarder: DEPLOY.forwarder, holder: me, notes: {}, txs: [],
};
const save = () => writeFileSync(OUT, JSON.stringify(st, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n");

async function send(step, c, fn, args) {
  const est = await c[fn].estimateGas(...args);
  const tx = await c[fn](...args, { gasLimit: (est * 110n) / 100n });
  const rc = await tx.wait();
  if (rc.status !== 1) throw new Error(`${step} reverted: ${tx.hash}`);
  st.txs.push({ step, tx: tx.hash, url: link(tx.hash), block: rc.blockNumber, gasUsed: rc.gasUsed.toString() });
  save();
  console.log(`ok   ${step.padEnd(48)} ${link(tx.hash)}`);
  return rc;
}

async function status() {
  const out = {};
  for (const m of MARKETS) {
    const s = st.notes[m.marketId];
    if (!s) continue;
    const n = await factory.notes(s.noteId);
    const r = await factory.resolutions(n.conditionId);
    const hold = new ethers.Contract(n.hold, ERC20_ABI, provider);
    const chg = new ethers.Contract(n.change, ERC20_ABI, provider);
    out[m.marketId] = {
      noteId: s.noteId, state: STATE[Number(n.state)], collateralLocked: fmt(n.collateralLocked),
      resolution: r.denominator === 0n ? null : { payouts: [r.payout0.toString(), r.payout1.toString()], denominator: r.denominator.toString(), polygonBlock: r.polygonBlock.toString(), reportedAt: r.reportedAt.toString() },
      holder: { HOLD: fmt(await hold.balanceOf(me)), CHANGE: fmt(await chg.balanceOf(me)) },
    };
  }
  out.holderCollateral = fmt(await usd.balanceOf(me));
  return out;
}

if (cmd === "list") {
  if ((await factory.owner()).toLowerCase() !== me.toLowerCase()) throw new Error("deployer is not factory owner");
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 60 * 86400);
  for (const m of MARKETS) {
    if (st.notes[m.marketId]) continue;
    const rec = await predgeRecord(m.marketId);
    if (rec.disputedProposal !== m.proposalLabel) throw new Error(`${m.marketId}: API proposal ${rec.disputedProposal} != ${m.proposalLabel}`);
    const rc = await send(`createNote ${m.marketId} (proposal ${m.proposalLabel})`, factory, "createNote",
      [rec.conditionId, m.proposal, rec.disputeTx, expiry, m.marketId, m.symbol]);
    const ev = rc.logs.map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "NoteCreated");
    st.notes[m.marketId] = { noteId: Number(ev.args.noteId), conditionId: rec.conditionId, question: rec.question, disputedProposal: m.proposalLabel,
      proposalVector: m.proposal.map(String), polygonDisputeTx: rec.disputeTx, hold: ev.args.hold, change: ev.args.change, expiry: expiry.toString() };
    save();
  }
  await send("TestUSD.faucet 20 tUSD", usd, "faucet", [me, 2n * MINT]);
  await send("approve tUSD -> factory", usd, "approve", [DEPLOY.factory, 2n * MINT]);
  for (const m of MARKETS) await send(`mint 10 HOLD + 10 CHANGE on ${m.marketId}`, factory, "mint", [st.notes[m.marketId].noteId, MINT, me]);
  st.afterMint = await status(); save();
  console.log(JSON.stringify(st.afterMint, null, 2));
} else if (cmd === "redeem") {
  st.beforeRedeem = await status(); save();
  for (const m of MARKETS) {
    const s = st.notes[m.marketId];
    const n = await factory.notes(s.noteId);
    const state = Number(n.state);
    if (state !== 1 && state !== 2) throw new Error(`${m.marketId} note ${s.noteId} not settled (${STATE[state]})`);
    const leg = state === 1 ? "HOLD" : "CHANGE";
    const bal = await new ethers.Contract(state === 1 ? n.hold : n.change, ERC20_ABI, provider).balanceOf(me);
    await send(`redeem ${fmt(bal)} ${leg} on ${m.marketId}`, factory, "redeem", [s.noteId, state === 1 ? bal : 0n, state === 2 ? bal : 0n, me]);
  }
  st.afterRedeem = await status(); save();
  console.log(JSON.stringify(st.afterRedeem, null, 2));
} else {
  console.log(JSON.stringify({ owner: await factory.owner(), forwarder: await factory.forwarder(), noteCount: (await factory.noteCount()).toString(), ...(await status()) }, null, 2));
}
