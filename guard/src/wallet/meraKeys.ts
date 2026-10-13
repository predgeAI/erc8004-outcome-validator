import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { privateKeyToAddress } from "viem/accounts";
import { bytesToHex, type Address } from "viem";

/**
 * One passkey, several unrelated keys.
 *
 * Every namespace below is a separate WebAuthn PRF salt, so each one is its own PRF evaluation:
 * knowing the output of one namespace tells nothing about another. Inside a namespace, HKDF with
 * a fixed info label turns the 32 PRF bytes into the key that namespace needs. Nothing derived
 * here is written to storage; the passkey recomputes it on any device it syncs to.
 *
 *   account  Mera's default salt sha256("mera.prf.salt.v1")  -> BIP-44 EVM account on Monad (the only wallet use)
 *   attest   sha256("predge.guard.attest.v1")                 -> ed25519 identity that signs risk receipts, unlinkable to the account
 *   vault    sha256("predge.guard.vault.v1")                  -> AES-256-GCM key + public locator for the encrypted watchlist and receipts
 */
export const NAMESPACES = {
  attest: "predge.guard.attest.v1",
  vault: "predge.guard.vault.v1",
} as const;
export type Namespace = keyof typeof NAMESPACES;

/** HKDF info labels: one per key, so the same PRF bytes never serve two purposes. */
export const INFO = {
  attestSeed: "predge.guard.attest.ed25519-seed.v1",
  vaultAes: "predge.guard.vault.aes-256-gcm.v1",
  vaultLocator: "predge.guard.vault.locator.v1",
} as const;

const utf8 = (s: string) => new TextEncoder().encode(s);
const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("WebCrypto is unavailable (needs HTTPS or localhost)");
  return s;
};

/** The 32-byte PRF salt for a namespace: sha256 of its label. */
export async function namespaceSalt(ns: Namespace): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await subtle().digest("SHA-256", utf8(NAMESPACES[ns])));
}

/** Mera's default salt, reproduced here so tests can check the namespaces never collide with it. */
export async function meraDefaultSalt(): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await subtle().digest("SHA-256", utf8("mera.prf.salt.v1")));
}

function assertPrf(prf: Uint8Array) {
  if (!(prf instanceof Uint8Array) || prf.length !== 32) throw new Error("PRF output must be 32 bytes");
}

/** HKDF-SHA-256 with an empty salt (the PRF output is already uniform) and a fixed info label. */
export async function hkdfBytes(prf: Uint8Array, info: string, length = 32): Promise<Uint8Array<ArrayBuffer>> {
  assertPrf(prf);
  const ikm = await subtle().importKey("raw", new Uint8Array(prf), "HKDF", false, ["deriveBits"]);
  const bits = await subtle().deriveBits({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: utf8(info) }, ikm, length * 8);
  return new Uint8Array(bits);
}

/** account namespace: the BIP-39/BIP-44 path from the Mera guide, so an exported phrase imports into other wallets. */
export function deriveEvmKey(prf: Uint8Array, index = 0): Uint8Array {
  assertPrf(prf);
  const seed = mnemonicToSeedSync(entropyToMnemonic(prf, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(`m/44'/60'/0'/0/${index}`);
  if (!node.privateKey) throw new Error("derivation produced no key");
  return node.privateKey;
}

export function evmAddressFromPrf(prf: Uint8Array): Address {
  const k = deriveEvmKey(prf);
  try { return privateKeyToAddress(bytesToHex(k)); } finally { k.fill(0); }
}

/** attest namespace: the 32-byte ed25519 private key (seed). Feed it to Mera's createEd25519SigningSession. */
export function deriveAttestSeed(prf: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  return hkdfBytes(prf, INFO.attestSeed);
}

export interface VaultKeys {
  /** non-extractable AES-256-GCM key; never leaves WebCrypto */
  key: CryptoKey;
  /** public, deterministic id for this vault (16 bytes, hex). Safe to give to untrusted storage. */
  locator: string;
}

/** vault namespace: an AES-256-GCM key and a locator, both from the same PRF bytes under different HKDF labels. */
export async function deriveVaultKeys(prf: Uint8Array): Promise<VaultKeys> {
  assertPrf(prf);
  const ikm = await subtle().importKey("raw", new Uint8Array(prf), "HKDF", false, ["deriveKey", "deriveBits"]);
  const key = await subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: utf8(INFO.vaultAes) },
    ikm, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
  const loc = new Uint8Array(await subtle().deriveBits({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: utf8(INFO.vaultLocator) }, ikm, 128));
  return { key, locator: bytesToHex(loc).slice(2) };
}

/** Short, human-comparable fingerprint for showing that two devices derived the same key. */
export async function fingerprint(bytes: Uint8Array | string): Promise<string> {
  const data = typeof bytes === "string" ? utf8(bytes) : new Uint8Array(bytes);
  const h = new Uint8Array(await subtle().digest("SHA-256", data));
  return Array.from(h.slice(0, 6), (b) => b.toString(16).padStart(2, "0")).join("").replace(/(.{4})(?!$)/g, "$1-");
}
