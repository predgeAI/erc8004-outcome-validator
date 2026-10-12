// Offline tests: fixtures are the signed records and results of the Monad batch run
// (monad/batch/records/, monad/batch/results-*.json). No network; the chain is a stub.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import {
  PINNED_KEYS, MONAD_TESTNET, verifyRecord, canonicalJson, sha256Hex, parseSettlementRisk, getSettlementRisk,
  claimFromPayload, requestHashOf, responseHashOf, getOnchainVerdict, isSafeToAct, PredgeVerificationError,
} from "../dist/index.js";
import { quoteSettlementRisk } from "../dist/x402.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BATCH = path.join(ROOT, "monad/batch");
const results = JSON.parse(readFileSync(path.join(BATCH, readFileSync(path.join(BATCH, "INDEX"), "utf8").trim().split("\n").pop()), "utf8"));
const record = (id) => JSON.parse(readFileSync(path.join(BATCH, "records", `${id}.json`), "utf8")).attestation;
const verdictOf = (id) => results.verdicts.find((v) => v.market_id === id);
const entries = results.verdicts.map((v) => ({ market_id: v.market_id, requestHash: v.requestHash, responseHash: v.responseHash, responseTx: v.responseTx, record: record(v.market_id) }));

// A stub Monad provider answering getValidationStatus from a map requestHash -> status.
const iface = new ethers.Interface(["function getValidationStatus(bytes32) view returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string tag, uint256 lastUpdate)"]);
function stubChain(statusByRequest) {
  return {
    provider: null,
    async call(tx) {
      const [rh] = iface.decodeFunctionData("getValidationStatus", tx.data);
      const s = statusByRequest[rh.toLowerCase()] ?? [ethers.ZeroAddress, 0, 0, ethers.ZeroHash, "", 0];
      return iface.encodeFunctionResult("getValidationStatus", s);
    },
  };
}
const chainFromResults = () => stubChain(Object.fromEntries(results.verdicts.map((v) => [v.requestHash.toLowerCase(), [results.validator, 0, v.score, v.responseHash, "predge-settlement-risk", 1]])));
const fetchServing = (bodyFor) => async (url) => {
  const id = String(url).split("/").pop();
  const body = bodyFor(id);
  return new Response(JSON.stringify(body), { status: body ? 200 : 404, headers: { "content-type": "application/json" } });
};

// a throwaway key to sign records the production key never signed (risk levels other than resolved)
const kp = crypto.generateKeyPairSync("ed25519");
const testPub = kp.publicKey.export({ type: "spki", format: "der" }).subarray(12).toString("hex");
const TEST_KEYS = { [testPub.slice(0, 16)]: testPub };
function signTest(payload) {
  const canonical = canonicalJson(payload);
  return { public_key: testPub, kid: testPub.slice(0, 16), signature: crypto.sign(null, Buffer.from(canonical), kp.privateKey).toString("hex"), canonical, content_hash: sha256Hex(canonical), payload };
}

test("constants match monad/deployment.json and the key in the signed records", () => {
  const dep = JSON.parse(readFileSync(path.join(ROOT, "monad/deployment.json"), "utf8"));
  for (const [k, v] of Object.entries(dep.contracts)) assert.equal(MONAD_TESTNET.contracts[k], v.address, k);
  assert.equal(MONAD_TESTNET.validator, dep.validator);
  assert.equal(MONAD_TESTNET.chainId, dep.chainId);
  assert.equal(MONAD_TESTNET.contracts.PredgeAgentValidator, results.contract);
  assert.equal(PINNED_KEYS["13fa3d18a369e6c7"], record("1137824").public_key);
});

test("every batch record verifies against the pinned key", () => {
  const ids = readdirSync(path.join(BATCH, "records")).filter((f) => /^\d+\.json$/.test(f)).map((f) => f.slice(0, -5));
  assert.equal(ids.length, 145);
  for (const id of ids) assert.equal(verifyRecord(record(id)).ok, true, id);
});

test("tampered bytes, a foreign key and a wrong content hash are rejected", () => {
  const r = record("1137824");
  const tampered = { ...r, canonical: r.canonical.replace('"outcome":"Over"', '"outcome":"Under"') };
  assert.equal(verifyRecord(tampered).checks.signature, false);
  const foreign = signTest(JSON.parse(r.canonical));
  assert.equal(verifyRecord(foreign).checks.signature, true);
  assert.equal(verifyRecord(foreign).checks.pinnedKey, false);
  assert.equal(verifyRecord(foreign).ok, false);
  assert.equal(verifyRecord({ ...r, content_hash: "00".repeat(32) }).ok, false);
  assert.equal(verifyRecord({ ...r, content_hash: sha256Hex(r.canonical) }).checks.contentHash, true);
  assert.equal(verifyRecord({ ...r, kid: "ffffffffffffffff" }).checks.pinnedKey, false);
  assert.throws(() => parseSettlementRisk(tampered), PredgeVerificationError);
});

test("parseSettlementRisk reads only the signed bytes", () => {
  const s = parseSettlementRisk(record("1137824"));
  assert.equal(s.marketId, "1137824");
  assert.equal(s.riskLevel, "resolved");
  assert.equal(s.outcome, "Over");
  assert.equal(s.disputes[0].disputed_proposal, "Under");
  assert.equal(s.disputeCount, 1);
});

test("requestHash and responseHash recompute for all 145 batch verdicts", () => {
  for (const v of results.verdicts) {
    const r = record(v.market_id);
    assert.equal(requestHashOf(claimFromPayload(JSON.parse(r.canonical))), v.requestHash, v.market_id);
    assert.equal(responseHashOf(r), v.responseHash, v.market_id);
  }
});

test("getSettlementRisk fetches, verifies and refuses a record for another market", async () => {
  const ok = await getSettlementRisk("1137824", { fetch: fetchServing((id) => ({ attestation: record(id) })) });
  assert.equal(ok.outcome, "Over");
  await assert.rejects(getSettlementRisk("1137824", { fetch: fetchServing(() => ({ attestation: record("1004831") })) }), /for market 1004831/);
  await assert.rejects(getSettlementRisk("abc"), /market id/);
});

test("getOnchainVerdict: bound, by market id and by requestHash", async () => {
  const v = await getOnchainVerdict("1137824", { provider: chainFromResults(), boundSource: entries });
  assert.equal(v.found, true);
  assert.equal(v.score, 0);
  assert.equal(v.bound, true);
  assert.equal(v.scoreConsistent, true);
  assert.equal(v.validatorMatches, true);
  assert.equal(v.responseTx, verdictOf("1137824").responseTx);
  const byHash = await getOnchainVerdict(verdictOf("1004831").requestHash, { provider: chainFromResults(), boundSource: entries });
  assert.equal(byHash.bound, true);
  assert.equal(byHash.score, 100);
  assert.equal(byHash.claim.market_id, "1004831");
});

test("getOnchainVerdict reads bound records from the board data file", async () => {
  const v = await getOnchainVerdict("1004831", { provider: chainFromResults(), boundSource: path.join(ROOT, "docs/board-data.json") });
  assert.equal(v.bound, true);
});

test("getOnchainVerdict: a responseHash that does not match the signed bytes is not bound", async () => {
  const v0 = verdictOf("1137824");
  const chain = stubChain({ [v0.requestHash.toLowerCase()]: [results.validator, 0, 100, ethers.keccak256("0x01"), "x", 1] });
  const v = await getOnchainVerdict("1137824", { provider: chain, boundSource: entries });
  assert.equal(v.found, true);
  assert.equal(v.bound, false);
  const none = await getOnchainVerdict("1137824", { provider: stubChain({}), boundSource: entries });
  assert.equal(none.found, false);
  const wrongValidator = stubChain({ [v0.requestHash.toLowerCase()]: [ethers.Wallet.createRandom().address, 0, 0, v0.responseHash, "x", 1] });
  assert.equal((await getOnchainVerdict("1137824", { provider: wrongValidator, boundSource: entries })).validatorMatches, false);
  const wrongScore = stubChain({ [v0.requestHash.toLowerCase()]: [results.validator, 0, 100, v0.responseHash, "x", 1] });
  assert.equal((await getOnchainVerdict("1137824", { provider: wrongScore, boundSource: entries })).scoreConsistent, false);
});

test("isSafeToAct: resolved market, outcome check, bound verdict", async () => {
  const opts = { provider: chainFromResults(), boundSource: entries, fetch: fetchServing((id) => ({ attestation: record(id) })) };
  const yes = await isSafeToAct("1137824", { ...opts, outcome: "Over" });
  assert.equal(yes.safe, true, yes.reason);
  assert.match(yes.reason, /final outcome Over; on-chain verdict 0/);
  const wrong = await isSafeToAct("1137824", { ...opts, outcome: "Under" });
  assert.equal(wrong.safe, false);
  assert.match(wrong.reason, /on-chain outcome is Over, not Under/);
  const stale = await isSafeToAct("1137824", { ...opts, maxAgeSeconds: 60 });
  assert.equal(stale.safe, false);
  const v0 = verdictOf("1137824");
  const badChain = stubChain({ [v0.requestHash.toLowerCase()]: [results.validator, 0, 0, ethers.keccak256("0x02"), "x", 1] });
  const unbound = await isSafeToAct("1137824", { ...opts, provider: badChain });
  assert.equal(unbound.safe, false);
  assert.match(unbound.reason, /not bound/);
  const tampered = await isSafeToAct("1137824", { ...opts, fetch: fetchServing((id) => ({ attestation: { ...record(id), signature: "00".repeat(64) } })) });
  assert.equal(tampered.safe, false);
  assert.match(tampered.reason, /^refuse: evidence did not verify/);
});

test("isSafeToAct: maxRisk gates open markets", async () => {
  const base = JSON.parse(record("1137824").canonical);
  const caution = signTest({ ...base, market_id: "42", resolved_on_chain: false, uma_state: "proposed", onchain_resolution: null, risk_level: "caution", recommendation: "caution: disputed once" });
  const watch = signTest({ ...base, market_id: "43", disputes: [], dispute_count: "0", resolved_on_chain: false, uma_state: "proposed", onchain_resolution: null, risk_level: "watch", recommendation: "watch: proposed" });
  const opts = { pinnedKeys: TEST_KEYS, provider: stubChain({}), boundSource: [], fetch: fetchServing((id) => ({ attestation: id === "42" ? caution : watch })) };
  assert.equal((await isSafeToAct("42", opts)).safe, false);
  assert.match((await isSafeToAct("42", { ...opts, maxRisk: "watch" })).reason, /^wait: risk caution is above watch/);
  assert.equal((await isSafeToAct("42", { ...opts, maxRisk: "caution" })).safe, true);
  assert.equal((await isSafeToAct("43", { ...opts, maxRisk: "watch" })).safe, true);
  assert.equal((await isSafeToAct("42", { ...opts, maxRisk: "caution", requireOnchainVerdict: true })).safe, false);
  // the production pinned key does not accept the test key
  assert.equal((await isSafeToAct("42", { ...opts, pinnedKeys: undefined, maxRisk: "caution" })).safe, false);
});

test("x402 quote parses the 402 challenge without paying", async () => {
  const accepts = [{ scheme: "exact", network: "eip155:10143", asset: MONAD_TESTNET.usdc, amount: "1000", payTo: MONAD_TESTNET.validator }];
  const f = async () => new Response("{}", { status: 402, headers: { "payment-required": Buffer.from(JSON.stringify({ x402Version: 2, accepts })).toString("base64") } });
  const q = await quoteSettlementRisk("1137824", "http://x", f);
  assert.equal(q.status, 402);
  assert.equal(q.accepts[0].network, "eip155:10143");
  assert.equal(q.accepts[0].amount, "1000");
});

test("x402 paying fetch builds from a caller-held account (throwaway key, nothing is paid)", async () => {
  const { createMonadPayingFetch } = await import("../dist/x402.js");
  const { privateKeyToAccount, generatePrivateKey } = await import("viem/accounts");
  const f = await createMonadPayingFetch(privateKeyToAccount(generatePrivateKey()));
  assert.equal(typeof f, "function");
});
