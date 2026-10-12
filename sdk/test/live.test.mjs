// Live, read-only: api.predge.io and Monad testnet RPC. Sends no transaction, needs no key.
import test from "node:test";
import assert from "node:assert/strict";
import { getSettlementRisk, getOnchainVerdict, isSafeToAct, MONAD_TESTNET } from "../dist/index.js";

const MARKET = process.env.MARKET || "1137824"; // a batch market: disputed proposal Under, settled Over

test(`live: signed record for ${MARKET} from api.predge.io verifies`, async () => {
  const r = await getSettlementRisk(MARKET);
  assert.equal(r.verified.signature, true);
  assert.equal(r.verified.pinnedKey, true);
  assert.equal(r.verified.contentHash, true);
  assert.equal(r.riskLevel, "resolved");
  assert.equal(r.outcome, "Over");
  console.log(`  record: risk ${r.riskLevel}, outcome ${r.outcome}, checked_at ${r.checkedAt}`);
});

test(`live: on-chain verdict for ${MARKET} on Monad testnet is bound to the signed record`, async () => {
  const v = await getOnchainVerdict(MARKET);
  assert.equal(v.found, true, v.problems.join("; "));
  assert.equal(v.contract, MONAD_TESTNET.contracts.PredgeAgentValidator);
  assert.equal(v.validatorMatches, true);
  assert.equal(v.bound, true, v.problems.join("; "));
  assert.equal(v.score, 0);
  assert.equal(v.scoreConsistent, true);
  console.log(`  verdict ${v.score}, responseHash ${v.responseHash}, tx ${v.responseTx}`);
});

test(`live: isSafeToAct(${MARKET})`, async () => {
  const d = await isSafeToAct(MARKET, { maxRisk: "resolved", outcome: "Over" });
  assert.equal(d.safe, true, d.reason);
  console.log(`  ${d.reason}`);
  const wrong = await isSafeToAct(MARKET, { outcome: "Under" });
  assert.equal(wrong.safe, false);
  console.log(`  ${wrong.reason}`);
});
