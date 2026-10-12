// The spend cap refuses before any key is loaded or anything is signed. Uses a temporary ledger and
// cache, makes one unpaid request to read Nansen's 402 challenge, pays nothing.
//   node --test nansen/test/cap.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";

const dir = mkdtempSync(path.join(os.tmpdir(), "nansen-cap-"));
process.env.NANSEN_LEDGER = path.join(dir, "ledger.json");
process.env.NANSEN_CACHE_DIR = path.join(dir, "raw");
process.env.PREDGE_ENV_FILE = path.join(dir, "no-such-key-file.env"); // a payment attempt would throw ENOENT, not refuse
writeFileSync(process.env.NANSEN_LEDGER, JSON.stringify({ entries: [{ endpoint: "x", amountUnits: "1990000", amountUSDC: "1.99", status: "settled" }] }));
const { nansenCall, spentUnits, readLedger } = await import("../nansen-x402.mjs");

test("refuses a call that would cross the 2.00 USDC cap", async () => {
  assert.equal(spentUnits(readLedger()), 1_990_000n);
  await assert.rejects(nansenCall("top-holders", { market_id: "5219930", pagination: { page: 1, per_page: 7 } }), /spend cap/);
  assert.equal(readLedger().entries.length, 1, "no ledger entry was added");
});

test("cache-only mode never pays", async () => {
  await assert.rejects(nansenCall("top-holders", { market_id: "5219930" }, { pay: false }), /payment disabled/);
});
