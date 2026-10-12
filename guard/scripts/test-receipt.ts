// Unit test for the "Acknowledge risk" EIP-712 receipt. Uses a throwaway key generated in memory and
// never written anywhere. Run: npm run test:receipt
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hashTypedData, type Hex } from "viem";
import {
  buildReceipt, loadAcks, receiptTypedData, receiptTypedDataJson, RECEIPT_DOMAIN, removeAck, saveAck, signReceipt, verifyReceipt, ZERO32,
} from "../src/wallet/receipt";

// minimal localStorage for node
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(), key: () => null, get length() { return mem.size; },
} as Storage;

let n = 0;
const t = async (name: string, f: () => Promise<void> | void) => { await f(); n++; console.log(`ok ${n} ${name}`); };

const account = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());
const sha = "a".repeat(64);
const reqHash = `0x${"b".repeat(64)}`;

await t("domain is pinned to Monad testnet", () => {
  assert.deepEqual(RECEIPT_DOMAIN, { name: "Predge Guard", version: "1", chainId: 10143 });
});

await t("buildReceipt maps verdict states and hashes", () => {
  const base = { marketId: 1137824, riskLevel: "resolved", contentSha256: sha, checkedAt: "2026-10-02T00:00:00Z" };
  const found = buildReceipt({ ...base, onchain: { found: true, requested: true, score: 0, requestHash: reqHash } });
  assert.equal(found.marketId, "1137824");
  assert.equal(found.onchainVerdict, "0");
  assert.equal(found.contentHash, `0x${sha}`);
  assert.equal(found.requestHash, reqHash);
  assert.equal(buildReceipt({ ...base, onchain: { found: false, requested: true, score: null, requestHash: reqHash } }).onchainVerdict, "requested");
  const none = buildReceipt({ ...base, onchain: null });
  assert.equal(none.onchainVerdict, "none");
  assert.equal(none.requestHash, ZERO32);
  assert.throws(() => buildReceipt({ ...base, contentSha256: "xyz", onchain: null }));
});

const msg = buildReceipt({ marketId: "2169995", riskLevel: "resolved", contentSha256: `0x${sha}`, onchain: { found: true, requested: true, score: 100, requestHash: reqHash }, checkedAt: "2026-10-02T00:00:00Z" });

await t("sign and verify round trip, recovered address matches", async () => {
  const { signature, check } = await signReceipt((td) => account.signTypedData(td), msg, account.address);
  assert.ok(check.ok);
  assert.equal(check.recovered, account.address);
  assert.match(signature, /^0x[0-9a-f]{130}$/);
});

await t("tampered message fails", async () => {
  const sig = await account.signTypedData(receiptTypedData(msg));
  for (const k of ["marketId", "riskLevel", "onchainVerdict", "checkedAt"] as const) {
    assert.equal((await verifyReceipt({ ...msg, [k]: "x" }, sig, account.address)).ok, false, k);
  }
  assert.equal((await verifyReceipt({ ...msg, contentHash: ZERO32 }, sig, account.address)).ok, false);
  assert.equal((await verifyReceipt({ ...msg, requestHash: ZERO32 }, sig, account.address)).ok, false);
});

await t("wrong signer fails, garbage signature fails", async () => {
  const sig = await other.signTypedData(receiptTypedData(msg));
  const c = await verifyReceipt(msg, sig, account.address);
  assert.equal(c.ok, false);
  assert.equal(c.recovered, other.address);
  assert.equal((await verifyReceipt(msg, "0x1234" as Hex, account.address)).ok, false);
});

await t("signReceipt throws when the wallet returns a signature from another key", async () => {
  await assert.rejects(signReceipt((td) => other.signTypedData(td), msg, account.address));
});

await t("JSON payload with EIP712Domain (Privy shape) hashes the same as the viem payload", async () => {
  const j = receiptTypedDataJson(msg);
  assert.equal(hashTypedData(j as Parameters<typeof hashTypedData>[0]), hashTypedData(receiptTypedData(msg)));
  const sig = await account.signTypedData(j as Parameters<typeof account.signTypedData>[0]);
  assert.ok((await verifyReceipt(msg, sig, account.address)).ok);
});

await t("other chain id gives a different digest", () => {
  const td = receiptTypedData(msg);
  assert.notEqual(hashTypedData({ ...td, domain: { ...td.domain, chainId: 143 } }), hashTypedData(td));
});

await t("local store keeps receipts, dedupes, removes", async () => {
  const sig = await account.signTypedData(receiptTypedData(msg));
  const rec = { message: msg, signature: sig, signer: account.address, recovered: account.address, provider: "privy" as const, via: "test", signedAt: new Date().toISOString() };
  saveAck(rec); saveAck(rec);
  assert.equal(loadAcks().length, 1);
  assert.equal(removeAck(sig).length, 0);
});

console.log(`\n${n} passed`);
