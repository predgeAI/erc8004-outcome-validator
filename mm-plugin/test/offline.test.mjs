// Offline tests: no network. Uses the signed record committed at monad/mainnet/record-1112268.json.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as core from "../dist/core.js";

const signedRecord = JSON.parse(readFileSync(new URL("../../monad/mainnet/record-1112268.json", import.meta.url), "utf8"));
const respond = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fakeFetch = (routes) => async (url) => {
  for (const [re, body] of routes) if (re.test(String(url))) return typeof body === "function" ? body() : respond(body);
  return respond({ error: "not found" }, 404);
};

const gamma = {
  id: "1112268", slug: "sea-tor-rom-2026-01-18-total-2pt5", question: "Torino FC vs. AS Roma: O/U 2.5",
  conditionId: "0xddff7251af9c56b2048edd2513019e55ae104143faa97d5799978f926bfcf1e0",
  outcomes: '["Over", "Under"]', clobTokenIds: '["111", "222"]', outcomePrices: '["0", "1"]', closed: true,
};
const noChain = () => { throw new Error("no chain in offline tests"); };

test("classifyInput and URL normalisation", () => {
  assert.equal(core.classifyInput("1112268"), "marketId");
  assert.equal(core.classifyInput("0xddff7251af9c56b2048edd2513019e55ae104143faa97d5799978f926bfcf1e0"), "conditionId");
  assert.equal(core.classifyInput("sea-tor-rom-2026-01-18-total-2pt5"), "slug");
  assert.equal(core.normaliseInput("https://polymarket.com/event/foo/sea-tor-rom-2026-01-18-total-2pt5"), "sea-tor-rom-2026-01-18-total-2pt5");
  assert.throws(() => core.classifyInput("not a market!"));
});

test("pickOutcome maps YES/NO to outcome 0/1 and accepts labels", () => {
  const m = { outcomes: ["Over", "Under"], tokenIds: ["111", "222"] };
  assert.equal(core.pickOutcome(m, "YES").tokenId, "111");
  assert.equal(core.pickOutcome(m, "no").tokenId, "222");
  assert.equal(core.pickOutcome(m, "under").index, 1);
  assert.throws(() => core.pickOutcome(m, "Draw"));
});

test("check verifies the signed record and decides from signed bytes only", async () => {
  const fetch = fakeFetch([[/gamma-api.*markets\/1112268/, gamma], [/settlement-risk\/1112268/, { attestation: signedRecord }]]);
  const r = await core.check("1112268", { fetch, skipChain: true, clients: noChain });
  assert.equal(r.riskLevel, "resolved");
  assert.equal(r.finalOutcome, "Under");
  assert.equal(r.disputedProposal, "Over");
  assert.match(r.proposalVsOutcome, /overturned/);
  assert.equal(r.record.signature, true);
  assert.equal(r.safeToAct, true);
  const strict = await core.check("1112268", { fetch, skipChain: true, clients: noChain, maxRisk: "resolved" });
  assert.equal(strict.safeToAct, true);
});

test("a tampered record is rejected", async () => {
  const bad = { ...signedRecord, canonical: signedRecord.canonical.replace('"outcome":"Under"', '"outcome":"Over"') };
  const fetch = fakeFetch([[/gamma-api.*markets\/1112268/, gamma], [/settlement-risk\/1112268/, { attestation: bad }]]);
  await assert.rejects(core.check("1112268", { fetch, skipChain: true, clients: noChain }), /verification/);
});

test("a record for a different condition id is not safe", async () => {
  const other = { ...gamma, conditionId: "0x" + "ab".repeat(32) };
  const fetch = fakeFetch([[/gamma-api.*markets\/1112268/, other], [/settlement-risk\/1112268/, { attestation: signedRecord }]]);
  const r = await core.check("1112268", { fetch, skipChain: true, clients: noChain });
  assert.equal(r.safeToAct, false);
  assert.match(r.reason, /not this market/);
});

test("guard refuses a closed market and never builds commands for it", async () => {
  const fetch = fakeFetch([[/gamma-api.*markets\/1112268/, gamma], [/settlement-risk\/1112268/, { attestation: signedRecord }], [/clob.*book/, { bids: [], asks: [] }]]);
  const g = await core.guard("1112268", { fetch, skipChain: true, clients: noChain, side: "NO", size: 5 });
  assert.equal(g.allowed, false);
  assert.equal(g.commands, null);
  assert.match(g.reason, /closed/);
});

test("guard on an open market with a settled record prints quote and place commands", async () => {
  const open = { ...gamma, closed: false };
  const fetch = fakeFetch([[/gamma-api.*markets\/1112268/, open], [/settlement-risk\/1112268/, { attestation: signedRecord }], [/clob.*book/, { bids: [{ price: "0.40", size: "10" }], asks: [{ price: "0.43", size: "10" }], tick_size: "0.01", min_order_size: "5" }]]);
  const g = await core.guard("1112268", { fetch, skipChain: true, clients: noChain, side: "NO", size: 10 });
  assert.equal(g.allowed, true);
  assert.equal(g.commands.place, "mm predict place --token-id 222 --side buy --size 10 --price 0.43 --tick-size 0.01");
  assert.equal(g.commands.quote, "mm predict quote --token-id 222 --side buy --size 10 --limit-price 0.43 --tick-size 0.01");
  // the record says the market resolved to Under: buying Over is refused
  const over = await core.guard("1112268", { fetch, skipChain: true, clients: noChain, side: "Over", size: 10 });
  assert.equal(over.allowed, false);
  assert.match(over.reason, /redeem at 0/);
});
