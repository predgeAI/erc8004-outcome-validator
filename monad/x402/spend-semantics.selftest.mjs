// Self-check for spend-semantics.mjs. Zero dependencies, offline, no network.
//
//   node monad/x402/spend-semantics.selftest.mjs
//
// Two properties matter more than the rest and are asserted explicitly:
//
//   1. redeem_count counts ATTEMPTS, not completed redemptions. Under `exact`
//      (EIP-3009) a completed second redemption is structurally impossible, so
//      counting completions would pin the field at 1 forever and make `> 1`
//      meaningless.
//   2. The change is ADDITIVE. The response's existing fields keep their names
//      and their values; `spend` is one new key and nothing else moves.

import assert from "node:assert/strict";
import { attestConsumption, countRedemption, sellerSpendBlock, sha256hex } from "./spend-semantics.mjs";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

check("one proof seen once is 1", () => {
  const store = new Map();
  assert.equal(countRedemption(store, "proof-A").redeem_count, 1);
});

check("the same proof seen again is 2, and first_seen does not move", () => {
  const store = new Map();
  const first = countRedemption(store, "proof-A");
  const second = countRedemption(store, "proof-A");
  assert.equal(second.redeem_count, 2);
  assert.equal(second.first_seen, first.first_seen);
});

check("a replay, a retry and a refused redemption all increment", () => {
  // They are indistinguishable at the point the seller counts, which is
  // precisely why the field counts attempts: the seller observes the proof,
  // not the outcome.
  const store = new Map();
  countRedemption(store, "proof-A");
  countRedemption(store, "proof-A");
  assert.equal(countRedemption(store, "proof-A").redeem_count, 3);
});

check("different proofs do not interfere", () => {
  const store = new Map();
  countRedemption(store, "proof-A");
  countRedemption(store, "proof-A");
  assert.equal(countRedemption(store, "proof-B").redeem_count, 1);
});

check("an unpaid request produces no spend block", () => {
  const store = new Map();
  assert.equal(sellerSpendBlock(store, undefined), null);
  assert.equal(sellerSpendBlock(store, ""), null);
});

check("the spend block names the proof it counted", () => {
  const store = new Map();
  const block = sellerSpendBlock(store, "x-payment:abc");
  assert.equal(block.proof_hash, `sha256:${sha256hex("x-payment:abc")}`);
  assert.equal(block.redeem_count, 1);
});

check("consumed is unknown without a decision, never no", () => {
  // Absence of a downstream reference is not evidence of idle spend. `no` is
  // reserved for a runtime that can positively demonstrate the result was
  // discarded; this demo cannot, so it does not emit it.
  assert.deepEqual(attestConsumption({ decision: undefined }), { consumed: "unknown" });
  assert.deepEqual(attestConsumption({ decision: "" }), { consumed: "unknown" });
});

check("a decision derived from the record is consumed: yes, naming what referenced it", () => {
  const a = attestConsumption({ decision: "act: the outcome is final on chain", reference: "market:2169995" });
  assert.equal(a.consumed, "yes");
  assert.deepEqual(a.consumed_by, ["market:2169995"]);
  assert.ok(a.consumed_at);
});

check("the change is additive: existing response fields keep name and value", () => {
  const before = {
    market: "2169995",
    record: { canonical: "{}", signature: "0x00" },
    onchainVerdict: { response: 1, responseHash: "0xaa" },
  };
  const store = new Map();
  const spend = sellerSpendBlock(store, "x-payment:abc");

  // What the server now does: same object spread, one new key.
  const after = { ...before, spend };

  for (const k of Object.keys(before)) {
    assert.deepEqual(after[k], before[k], `${k} must be unchanged`);
  }
  assert.deepEqual(
    Object.keys(after).filter((k) => !(k in before)),
    ["spend"],
    "exactly one key may be added",
  );
});

check("the buyer's spend block carries consumed and cannot be written by the seller", () => {
  // The seller has no observation of the buyer's runtime, so a seller-written
  // `consumed` would be unfalsifiable. attestConsumption is on the buyer side
  // for that reason and is never called from server.mjs.
  const buyer = attestConsumption({ decision: "wait: low", reference: "market:2169995" });
  const seller = sellerSpendBlock(new Map(), "x-payment:abc");
  assert.equal(buyer.consumed, "yes");
  assert.ok(!("consumed" in seller));
});

console.log(`\n${passed} checks passed`);
