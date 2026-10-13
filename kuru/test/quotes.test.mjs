// Offline tests for the quoting and listing helpers in scripts/deploy.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { MARKET_PARAMS, proposalVector, seedQuotes } from "../scripts/deploy.mjs";

test("seed quotes straddle the reference rate on the 0.01 tick", () => {
  const q = seedQuotes(0.2166);
  assert.deepEqual(q.map((x) => [x.side, Number(x.price.toFixed(2))]), [["buy", 0.18], ["sell", 0.25], ["buy", 0.15], ["sell", 0.28]]);
  for (const x of q) assert.equal(Math.round(x.price * MARKET_PARAMS.pricePrecision) % MARKET_PARAMS.tickSize, 0);
});

test("seed quotes stay inside (0, 1)", () => {
  for (const ref of [0.001, 0.02, 0.5, 0.97, 0.999]) {
    for (const x of seedQuotes(ref)) assert.ok(x.price >= 0.01 && x.price <= 0.99, `${ref}: ${x.price}`);
  }
});

test("disputed proposal labels map to CTF payout vectors (slot 0 = Yes)", () => {
  assert.deepEqual(proposalVector("No"), [0n, 1n]);
  assert.deepEqual(proposalVector("Yes"), [1n, 0n]);
  assert.deepEqual(proposalVector("50-50"), [1n, 1n]);
  assert.throws(() => proposalVector("Over"));
});
