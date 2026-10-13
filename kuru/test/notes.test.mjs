// Dispute-hedge note tests on an in-process EVM (ganache). Run: cd kuru && npm install && npm test
// ganache tops out at the shanghai hardfork, so the contracts are compiled for shanghai here; the
// deploy script compiles the same sources for cancun (Monad).
import test from "node:test";
import assert from "node:assert/strict";
import ganache from "ganache";
import { ethers } from "ethers";
import { compile } from "../scripts/compile.mjs";

const OPTS = { evmVersion: "shanghai" };
const E6 = 1_000_000n;
const COND = "0x50d446794ad4e7b16e27e248ed841c76ca7edbb084907f61cd5a9d1f83cf96a8"; // Polymarket 5219930
const DISPUTE_TX = "0x7a19f69e9d4c2e1b128b9a994b3367a957ef431af0380a364d840fa656fa3b74";
const NO = [0n, 1n];
const coder = ethers.AbiCoder.defaultAbiCoder();
const report = (cond, p0, p1, den, block = 77_000_000n) =>
  coder.encode(["bytes32", "uint256", "uint256", "uint256", "uint64"], [cond, p0, p1, den, block]);
// metadata = workflowId (32) | workflowName (10) | workflowOwner (20) | reportId (2)
const metadata = (name, owner) => ethers.concat([ethers.ZeroHash, ethers.zeroPadBytes(ethers.toUtf8Bytes(name), 10), owner, "0x0001"]);

async function setup() {
  const eth = ganache.provider({ logging: { quiet: true }, chain: { hardfork: "shanghai" }, wallet: { totalAccounts: 5, defaultBalance: 1000 } });
  const provider = new ethers.BrowserProvider(eth, undefined, { cacheTimeout: -1 });
  const [admin, alice, bob, fwd, other] = await Promise.all([0, 1, 2, 3, 4].map((i) => provider.getSigner(i)));
  const deploy = async (file, name, args, signer = admin) => {
    const { abi, bytecode } = compile(file, name, OPTS);
    const c = await new ethers.ContractFactory(abi, bytecode, signer).deploy(...args);
    await c.waitForDeployment();
    return c;
  };
  const usd = await deploy("TestUSD.sol", "TestUSD", []);
  const f = await deploy("DisputeNotes.sol", "DisputeNoteFactory", [await usd.getAddress(), await fwd.getAddress()]);
  const now = (await provider.getBlock("latest")).timestamp;
  await (await f.createNote(COND, NO, DISPUTE_TX, now + 30 * 86400, "5219930", "5219930")).wait();
  const n = await f.notes(0);
  const tokenAbi = compile("DisputeNotes.sol", "NoteToken", OPTS).abi;
  const hold = new ethers.Contract(n.hold, tokenAbi, provider);
  const change = new ethers.Contract(n.change, tokenAbi, provider);
  for (const s of [alice, bob]) {
    await (await usd.faucet(await s.getAddress(), 1000n * E6)).wait();
    await (await usd.connect(s).approve(await f.getAddress(), ethers.MaxUint256)).wait();
  }
  const time = async (sec) => { await eth.request({ method: "evm_increaseTime", params: [sec] }); await eth.request({ method: "evm_mine", params: [] }); };
  return { provider, admin, alice, bob, fwd, other, usd, f, hold, change, time, A: (s) => s.getAddress() };
}

const STATE = { OPEN: 0n, HOLD: 1n, CHANGE: 2n, EXPIRED: 3n };

test("mint gives 1 HOLD + 1 CHANGE per unit of collateral; merge returns it", async () => {
  const { f, usd, hold, change, alice, A } = await setup();
  await (await f.connect(alice).mint(0, 100n * E6, await A(alice))).wait();
  assert.equal(await hold.balanceOf(await A(alice)), 100n * E6);
  assert.equal(await change.balanceOf(await A(alice)), 100n * E6);
  assert.equal(await usd.balanceOf(await f.getAddress()), 100n * E6);
  assert.equal(await hold.decimals(), 6n);
  assert.equal(await change.symbol(), "CHG-5219930");
  await (await f.connect(alice).merge(0, 40n * E6, await A(alice))).wait();
  assert.equal(await usd.balanceOf(await f.getAddress()), 60n * E6);
  assert.equal((await f.notes(0)).collateralLocked, 60n * E6);
});

test("merge needs both legs", async () => {
  const { f, change, alice, bob, A } = await setup();
  await (await f.connect(alice).mint(0, 10n * E6, await A(alice))).wait();
  await (await change.connect(alice).transfer(await A(bob), 10n * E6)).wait();
  await assert.rejects(f.connect(alice).merge(0, 1n * E6, await A(alice)));
});

test("only the forwarder can settle; Predge (owner) cannot", async () => {
  const { f, admin, other } = await setup();
  await assert.rejects(f.connect(admin).onReport("0x", report(COND, 0n, 1n, 1n)));
  await assert.rejects(f.connect(other).onReport("0x", report(COND, 0n, 1n, 1n)));
  assert.equal((await f.notes(0)).state, STATE.OPEN);
});

test("chain outcome equals the disputed proposal (No): HOLD pays 1, CHANGE pays 0", async () => {
  const { f, usd, hold, change, alice, bob, fwd, A } = await setup();
  await (await f.connect(alice).mint(0, 100n * E6, await A(alice))).wait();
  await (await change.connect(alice).transfer(await A(bob), 100n * E6)).wait(); // bob bought CHANGE
  await (await f.connect(fwd).onReport("0x", report(COND, 0n, 1n, 1n))).wait();
  assert.equal((await f.notes(0)).state, STATE.HOLD);
  const r = await f.resolutions(COND);
  assert.equal(r.denominator, 1n);
  const before = await usd.balanceOf(await A(alice));
  await (await f.connect(alice).redeem(0, 100n * E6, 0n, await A(alice))).wait();
  assert.equal((await usd.balanceOf(await A(alice))) - before, 100n * E6);
  const b0 = await usd.balanceOf(await A(bob));
  await (await f.connect(bob).redeem(0, 0n, 100n * E6, await A(bob))).wait();
  assert.equal(await usd.balanceOf(await A(bob)), b0);
  assert.equal(await usd.balanceOf(await f.getAddress()), 0n);
  assert.equal(await hold.totalSupply(), 0n);
  assert.equal(await change.totalSupply(), 0n);
});

test("chain outcome differs (Yes): CHANGE pays 1", async () => {
  const { f, usd, alice, fwd, A } = await setup();
  await (await f.connect(alice).mint(0, 50n * E6, await A(alice))).wait();
  await (await f.connect(fwd).onReport("0x", report(COND, 1n, 0n, 1n))).wait();
  assert.equal((await f.notes(0)).state, STATE.CHANGE);
  const before = await usd.balanceOf(await A(alice));
  await (await f.connect(alice).redeem(0, 50n * E6, 50n * E6, await A(alice))).wait();
  assert.equal((await usd.balanceOf(await A(alice))) - before, 50n * E6);
});

test("50/50 resolution differs from a No proposal: CHANGE pays 1", async () => {
  const { f, alice, fwd, A } = await setup();
  await (await f.connect(alice).mint(0, 1n * E6, await A(alice))).wait();
  await (await f.connect(fwd).onReport("0x", report(COND, 1n, 1n, 2n))).wait();
  assert.equal((await f.notes(0)).state, STATE.CHANGE);
});

test("payout vectors compare up to scale (CTF denominators vary)", async () => {
  const { f, fwd } = await setup();
  await (await f.connect(fwd).onReport("0x", report(COND, 0n, 7n, 7n))).wait();
  assert.equal((await f.notes(0)).state, STATE.HOLD);
});

test("unresolved or repeated reports are rejected", async () => {
  const { f, fwd } = await setup();
  await assert.rejects(f.connect(fwd).onReport("0x", report(COND, 0n, 0n, 0n)));
  await (await f.connect(fwd).onReport("0x", report(COND, 0n, 1n, 1n))).wait();
  await assert.rejects(f.connect(fwd).onReport("0x", report(COND, 1n, 0n, 1n)));
  assert.equal((await f.notes(0)).state, STATE.HOLD);
});

test("no minting or merging after settlement; no redeem before", async () => {
  const { f, alice, fwd, A } = await setup();
  await (await f.connect(alice).mint(0, 10n * E6, await A(alice))).wait();
  await assert.rejects(f.connect(alice).redeem(0, 1n, 0n, await A(alice)));
  await (await f.connect(fwd).onReport("0x", report(COND, 0n, 1n, 1n))).wait();
  await assert.rejects(f.connect(alice).mint(0, 1n * E6, await A(alice)));
  await assert.rejects(f.connect(alice).merge(0, 1n * E6, await A(alice)));
});

test("no report by expiry: anyone can expire, each leg redeems for half", async () => {
  const { f, usd, change, alice, bob, other, time, A } = await setup();
  await (await f.connect(alice).mint(0, 10n * E6, await A(alice))).wait();
  await (await change.connect(alice).transfer(await A(bob), 10n * E6)).wait();
  await assert.rejects(f.connect(other).expire(0));
  await time(31 * 86400);
  await (await f.connect(other).expire(0)).wait();
  assert.equal((await f.notes(0)).state, STATE.EXPIRED);
  const a0 = await usd.balanceOf(await A(alice));
  await (await f.connect(alice).redeem(0, 10n * E6, 0n, await A(alice))).wait();
  assert.equal((await usd.balanceOf(await A(alice))) - a0, 5n * E6);
  await (await f.connect(bob).redeem(0, 0n, 10n * E6, await A(bob))).wait();
  assert.equal(await usd.balanceOf(await f.getAddress()), 0n);
});

test("workflow pin: wrong workflow owner or name is rejected", async () => {
  const { f, admin, fwd, other, A } = await setup();
  const wfOwner = await A(other);
  await (await f.connect(admin).pinWorkflow(wfOwner, ethers.zeroPadBytes(ethers.toUtf8Bytes("dnotes"), 10))).wait();
  await assert.rejects(f.connect(fwd).onReport("0x", report(COND, 0n, 1n, 1n)));
  await assert.rejects(f.connect(fwd).onReport(metadata("dnotes", await A(admin)), report(COND, 0n, 1n, 1n)));
  await assert.rejects(f.connect(fwd).onReport(metadata("other", wfOwner), report(COND, 0n, 1n, 1n)));
  await (await f.connect(fwd).onReport(metadata("dnotes", wfOwner), report(COND, 0n, 1n, 1n))).wait();
  assert.equal((await f.notes(0)).state, STATE.HOLD);
});

test("listing is owner-only; a note listed after the chain resolved settles at once", async () => {
  const { f, admin, fwd, other, provider } = await setup();
  const now = (await provider.getBlock("latest")).timestamp;
  const cond2 = ethers.id("other condition");
  await assert.rejects(f.connect(other).createNote(cond2, NO, ethers.ZeroHash, now + 86400, "1", "1"));
  await assert.rejects(f.connect(admin).createNote(cond2, [0n, 0n], ethers.ZeroHash, now + 86400, "1", "1"));
  await (await f.connect(fwd).onReport("0x", report(cond2, 1n, 0n, 1n))).wait();
  await (await f.connect(admin).createNote(cond2, NO, ethers.ZeroHash, now + 86400, "1", "1")).wait();
  assert.equal((await f.notes(1)).state, STATE.CHANGE);
  assert.deepEqual((await f.notesForCondition(cond2)).map(Number), [1]);
});

test("one report settles every note on the condition", async () => {
  const { f, admin, fwd, provider } = await setup();
  const now = (await provider.getBlock("latest")).timestamp;
  await (await f.connect(admin).createNote(COND, [1n, 0n], DISPUTE_TX, now + 86400, "5219930", "5219930Y")).wait();
  await (await f.connect(fwd).onReport("0x", report(COND, 0n, 1n, 1n))).wait();
  assert.equal((await f.notes(0)).state, STATE.HOLD);
  assert.equal((await f.notes(1)).state, STATE.CHANGE);
});

test("IReceiver interface", async () => {
  const { f } = await setup();
  assert.equal(await f.supportsInterface("0x805f2132"), true);
  assert.equal(await f.supportsInterface("0x01ffc9a7"), true);
});
