// Spend semantics for Predge's x402 pay-per-call endpoint.
//
// Two optional, off-chain fields. Neither touches a contract: both travel inside the
// existing HTTP response and the agent's run file.
//
//   payment.redeem_count  How many times the seller SAW the same payment proof.
//                         Counted as ATTEMPTS, not as completed redemptions: a replay,
//                         a retry or a refused second redemption all increment. Under
//                         x402 `exact` (EIP-3009) the nonce is single-use, so a
//                         *completed* second redemption is structurally impossible --
//                         counting attempts is what makes `> 1` meaningful instead of
//                         reading as broken forever at 1.
//
//   result.consumed       Whether the buyer runtime actually referenced the paid result
//                         downstream. Attested by the BUYER, never by the seller: the
//                         seller has no observation of the buyer's runtime, so a
//                         seller-written `consumed` is unfalsifiable. Default is
//                         `unknown`. Absence of a downstream reference is NOT evidence
//                         of idle spend.
//
// Field names follow gates-spec v0.1 (https://github.com/ruiruii/gates-spec, Apache-2.0).
// If Predge prefers different names, adopt them -- the point is one vocabulary, not a
// new project.
//
// Zero dependencies: node:crypto only.

import { createHash } from "node:crypto";

export function sha256hex(s) {
  return createHash("sha256").update(String(s), "utf8").digest("hex");
}

/**
 * Seller side. Increment and return the attempt count for one proof hash.
 * Called BEFORE the payment is verified, so refusals are recorded too.
 *
 * @param {Map<string, {count: number, firstSeen: string}>} store
 * @param {string} proofHash  hex sha256 of the raw payment header
 * @returns {{redeem_count: number, first_seen: string}}
 */
export function countRedemption(store, proofHash) {
  const now = new Date().toISOString();
  const rec = store.get(proofHash);
  if (!rec) {
    store.set(proofHash, { count: 1, firstSeen: now });
    return { redeem_count: 1, first_seen: now };
  }
  rec.count += 1;
  return { redeem_count: rec.count, first_seen: rec.firstSeen };
}

/**
 * Buyer side. Attest whether the paid result was referenced downstream.
 *
 * `consumed = yes` requires an actual downstream reference -- here, the agent deriving
 * its decision from the record. Anything else stays `unknown`; `no` is reserved for a
 * runtime that can positively demonstrate the result was discarded, which this demo
 * cannot do, so it is never emitted here.
 *
 * @param {{decision: string, reference?: string, at?: string}} input
 * @returns {{consumed: "yes"|"no"|"unknown", consumed_by?: string[], consumed_at?: string}}
 */
export function attestConsumption({ decision, reference, at }) {
  const consumedAt = at ?? new Date().toISOString();
  if (typeof decision !== "string" || decision.length === 0) {
    return { consumed: "unknown" };
  }
  return {
    consumed: "yes",
    consumed_by: [reference ?? `decision:${decision.split(":")[0]}`],
    consumed_at: consumedAt,
  };
}

/**
 * Convenience for the seller: build the `spend` block of a response.
 * Returns null when no payment header was present (unpaid request).
 */
export function sellerSpendBlock(store, paymentHeader) {
  const raw = paymentHeader ? String(paymentHeader) : "";
  if (!raw) return null;
  const proofHash = sha256hex(raw);
  return { proof_hash: `sha256:${proofHash}`, ...countRedemption(store, proofHash) };
}
