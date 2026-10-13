// Tests for the passkey namespaces (account, attest, vault). A software authenticator stands in for
// the passkey: it computes the WebAuthn PRF exactly as the spec does (HMAC-SHA-256 over
// SHA-256("WebAuthn PRF" || 0x00 || salt)) from a fixed test credential secret. Two "devices" share
// that secret the way a synced passkey does, with separate storage. Nothing here touches a real
// passkey or the network. Run: npm run test:mera
import assert from "node:assert/strict";
import { createHmac, createHash, hkdfSync } from "node:crypto";
import type { WebAuthnClient } from "@category-labs/mera";
import { createSecp256k1SigningSession } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { mnemonicToAccount } from "viem/accounts";
import { deriveAttestSeed, deriveEvmKey, deriveVaultKeys, evmAddressFromPrf, hkdfBytes, meraDefaultSalt, namespaceSalt, INFO } from "../src/wallet/meraKeys";
import { createPasskey, getPrf, setWebAuthnClient, storedCredential } from "../src/wallet/passkey";
import { emptyState, mergeStates, openVault, parseSealed, sealedFromCalldata, sealedFromHash, sealedToCalldata, sealVault, vaultLink, VaultMismatch, type VaultState } from "../src/wallet/vault";
import { attestPublicKey, signAttestation, verifyAttestation } from "../src/wallet/attest";
import { buildReceipt, receiptTypedData, verifyReceipt } from "../src/wallet/receipt";

let n = 0;
const t = async (name: string, f: () => Promise<void> | void) => { await f(); n++; console.log(`ok ${n} ${name}`); };
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

// ---- environment: one localStorage per "device" ----
const stores = { A: new Map<string, string>(), B: new Map<string, string>() };
let current = stores.A;
const useDevice = (d: keyof typeof stores) => { current = stores[d]; };
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => current.get(k) ?? null, setItem: (k: string, v: string) => void current.set(k, v), removeItem: (k: string) => void current.delete(k),
  clear: () => current.clear(), key: () => null, get length() { return current.size; },
} as Storage;
(globalThis as unknown as { location: { hostname: string } }).location = { hostname: "localhost" };

// ---- software authenticator ----
function softAuthenticator(secret: Uint8Array, id: Uint8Array): WebAuthnClient & { calls: number } {
  const prf = (salt: Uint8Array) => {
    const s = createHash("sha256").update(Buffer.concat([Buffer.from("WebAuthn PRF"), Buffer.from([0]), Buffer.from(salt)])).digest();
    return new Uint8Array(createHmac("sha256", Buffer.from(secret)).update(s).digest());
  };
  const c = {
    calls: 0,
    createCredential: async (r: WebAuthnClient.CreateCredentialRequest) => { c.calls++; assert.equal(r.userVerification, "required"); return { credentialId: id, transports: ["internal"], prfEnabled: true, prfOutput: prf(r.prfSalt) }; },
    getCredential: async (r: WebAuthnClient.GetCredentialRequest) => {
      c.calls++;
      if (r.allowCredential) assert.equal(hex(r.allowCredential.credentialId), hex(id));
      return { credentialId: id, prfOutput: prf(r.prfSalt) };
    },
  };
  return c;
}

const SECRET = Uint8Array.from({ length: 32 }, (_, i) => i);            // test-only credential secret
const OTHER = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);       // a different passkey
const CRED = Uint8Array.from({ length: 16 }, (_, i) => 0xa0 + i);
const PRF_VECTOR = Uint8Array.from({ length: 32 }, (_, i) => i + 1);    // fixed PRF output for derivation vectors

const receipt = buildReceipt({ marketId: 1137824, riskLevel: "high", contentSha256: "c".repeat(64), onchain: { found: true, requested: true, score: 0, requestHash: `0x${"d".repeat(64)}` }, checkedAt: "2026-10-12T00:00:00Z" });

await t("namespace salts are fixed, 32 bytes, and distinct from each other and from Mera's default", async () => {
  const d = hex(await meraDefaultSalt()), a = hex(await namespaceSalt("attest")), v = hex(await namespaceSalt("vault"));
  assert.equal(d, createHash("sha256").update("mera.prf.salt.v1").digest("hex"));
  assert.equal(a, createHash("sha256").update("predge.guard.attest.v1").digest("hex"));
  assert.equal(v, createHash("sha256").update("predge.guard.vault.v1").digest("hex"));
  assert.equal(new Set([d, a, v]).size, 3);
});

await t("account namespace matches an independent BIP-39/BIP-44 derivation (viem mnemonicToAccount)", async () => {
  const independent = mnemonicToAccount(entropyToMnemonic(PRF_VECTOR, wordlist)).address;
  assert.equal(evmAddressFromPrf(PRF_VECTOR), independent);
  assert.equal(independent, "0x50B240678777451BEfd67B7e8c3b4366482ba8F9");
});

await t("HKDF labels give unrelated keys from the same PRF bytes", async () => {
  const s = hex(await deriveAttestSeed(PRF_VECTOR));
  const l = hex(await hkdfBytes(PRF_VECTOR, INFO.vaultLocator, 16));
  const k = hex(deriveEvmKey(PRF_VECTOR));
  assert.equal(new Set([s, l, k, hex(PRF_VECTOR)]).size, 4);
  assert.equal((await deriveVaultKeys(PRF_VECTOR)).locator, l);
  // independent HKDF (node:crypto) and pinned vectors
  assert.equal(s, Buffer.from(hkdfSync("sha256", PRF_VECTOR, new Uint8Array(0), INFO.attestSeed, 32)).toString("hex"));
  assert.equal(l, Buffer.from(hkdfSync("sha256", PRF_VECTOR, new Uint8Array(0), INFO.vaultLocator, 16)).toString("hex"));
  assert.equal(l, "2b908425210b68766928a401188fc359");
  assert.ok(s.startsWith("068125ce8736d574"));
});

let addrA = "", attestA = "", locA = "", sealed: Awaited<ReturnType<typeof sealVault>> | null = null, link = "";
const stateA: VaultState = { watchlist: ["1137824", "will-x-happen"], acks: [], attestations: [], updatedAt: "2026-10-13T10:00:00Z" };

await t("device A: one ceremony creates the passkey and the Monad account; nothing secret is stored", async () => {
  useDevice("A");
  const auth = softAuthenticator(SECRET, CRED);
  setWebAuthnClient(auth);
  const { prfOutput } = await createPasskey("account");
  assert.equal(auth.calls, 1);
  addrA = evmAddressFromPrf(prfOutput);
  assert.equal(storedCredential()?.credentialId, Buffer.from(CRED).toString("base64url"));
  const dump = JSON.stringify([...stores.A.entries()]);
  assert.ok(!dump.includes(hex(prfOutput)), "PRF output must not be stored");
});

await t("device A: attest and vault namespaces each take one ceremony and differ from the account", async () => {
  useDevice("A");
  const auth = softAuthenticator(SECRET, CRED);
  setWebAuthnClient(auth);
  const att = await getPrf("attest");
  const vlt = await getPrf("vault");
  assert.equal(auth.calls, 2);
  assert.notEqual(hex(att.prfOutput), hex(vlt.prfOutput));
  attestA = await attestPublicKey(att.prfOutput);
  const keys = await deriveVaultKeys(vlt.prfOutput);
  locA = keys.locator;
  const a = await signAttestation(att.prfOutput, receipt, "Test market");
  assert.ok(await verifyAttestation(a, attestA));
  stateA.attestations.push(a);
  sealed = await sealVault(stateA, keys);
  link = vaultLink(sealed, "https://predgeai.github.io/erc8004-outcome-validator/mera.html#x");
  assert.ok(link.includes("#vault="));
  const dump = JSON.stringify([...stores.A.entries()]);
  for (const secret of [att.prfOutput, vlt.prfOutput]) assert.ok(!dump.includes(hex(secret)));
});

await t("cross-device: fresh storage + same synced passkey reproduces account, attest key and locator, and opens the vault", async () => {
  useDevice("B");
  assert.equal(storedCredential(), undefined);
  setWebAuthnClient(softAuthenticator(SECRET, CRED));
  const acct = await getPrf("account");                 // discoverable: no stored credential
  assert.equal(evmAddressFromPrf(acct.prfOutput), addrA);
  assert.equal(await attestPublicKey((await getPrf("attest")).prfOutput), attestA);
  const keys = await deriveVaultKeys((await getPrf("vault")).prfOutput);
  assert.equal(keys.locator, locA);
  const opened = await openVault(sealedFromHash(new URL(link).hash)!, keys);
  assert.deepEqual(opened.watchlist, stateA.watchlist);
  assert.equal(opened.attestations.length, 1);
  assert.ok(await verifyAttestation(opened.attestations[0], attestA), "attestation still verifies after the round trip");
});

await t("a different passkey cannot open the vault and gets different keys", async () => {
  useDevice("B");
  stores.B.clear();
  setWebAuthnClient(softAuthenticator(OTHER, Uint8Array.from({ length: 16 }, () => 7)));
  const keys = await deriveVaultKeys((await getPrf("vault")).prfOutput);
  assert.notEqual(keys.locator, locA);
  await assert.rejects(openVault(sealed!, keys), VaultMismatch);
  await assert.rejects(openVault({ ...sealed!, loc: keys.locator }, keys), VaultMismatch, "relabelled locator fails AES-GCM authentication");
  assert.notEqual(evmAddressFromPrf((await getPrf("account")).prfOutput), addrA);
});

await t("tampered vault ciphertext is rejected; malformed input is rejected before decryption", async () => {
  useDevice("A");
  setWebAuthnClient(softAuthenticator(SECRET, CRED));
  const keys = await deriveVaultKeys((await getPrf("vault")).prfOutput);
  const ct = Buffer.from(sealed!.ct, "base64url"); ct[0] ^= 1;
  await assert.rejects(openVault({ ...sealed!, ct: ct.toString("base64url") }, keys), VaultMismatch);
  assert.throws(() => parseSealed({ ...sealed, loc: "zz" }));
  assert.throws(() => parseSealed({ ...sealed, kind: "other" }));
  assert.throws(() => parseSealed("{}"));
});

await t("vault calldata round-trips (PGV1 magic) for keeping the blob on Monad", () => {
  const data = sealedToCalldata(sealed!);
  assert.ok(data.startsWith("0x50475631"));
  assert.deepEqual(sealedFromCalldata(data), parseSealed(sealed));
  assert.throws(() => sealedFromCalldata("0xdeadbeef"));
});

await t("attestations: tampered message, foreign key and swapped canonical text all fail", async () => {
  const a = stateA.attestations[0];
  assert.equal(await verifyAttestation({ ...a, message: { ...a.message, riskLevel: "low" } }), false);
  assert.equal(await verifyAttestation(a, "00".repeat(32)), false);
  assert.equal(await verifyAttestation({ ...a, canonical: a.canonical.replace("high", "low") }), false);
});

await t("merge keeps both sides, dedupes by signature, newest first", () => {
  const a = stateA.attestations[0];
  const b: VaultState = { ...emptyState(), watchlist: ["999", "1137824"], attestations: [a, { ...a, signature: "ff", signedAt: "2030-01-01T00:00:00Z" }] };
  const m = mergeStates(stateA, b);
  assert.deepEqual(m.watchlist, ["1137824", "will-x-happen", "999"]);
  assert.equal(m.attestations.length, 2);
  assert.equal(m.attestations[0].signature, "ff");
});

await t("account session: Mera viem account signs the Guard EIP-712 receipt prompt-free and it verifies", async () => {
  useDevice("A");
  setWebAuthnClient(softAuthenticator(SECRET, CRED));
  const key = deriveEvmKey((await getPrf("account")).prfOutput);
  const session = createSecp256k1SigningSession({ privateKey: key });
  key.fill(0);
  const acct = toViemAccount(session);
  assert.equal(acct.address, addrA);
  const sig = await acct.signTypedData(receiptTypedData(receipt));
  assert.ok((await verifyReceipt(receipt, sig, acct.address)).ok);
  session.end();
  await assert.rejects(acct.signTypedData(receiptTypedData(receipt)), /SESSION_ENDED|ended/i);
});

console.log(`\n${n} tests passed`);
