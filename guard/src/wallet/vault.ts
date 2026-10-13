import type { VaultKeys } from "./meraKeys";
import type { AckRecord } from "./receipt";
import type { Attestation } from "./attest";

/**
 * The encrypted Guard vault: watched markets, wallet receipts and passkey attestations in one blob.
 *
 * The blob is safe to keep anywhere (this browser, a link, a file, Monad calldata) because only the
 * passkey's vault namespace can open it. The locator travels in clear so storage can index it;
 * it is bound into the AES-GCM additional data, so a blob cannot be relabelled to another locator.
 */
export const VAULT_KIND = "predge.guard.vault";
export const VAULT_VERSION = 1;

export interface VaultState {
  watchlist: string[];
  acks: AckRecord[];
  attestations: Attestation[];
  updatedAt: string;
}

export interface SealedVault {
  kind: typeof VAULT_KIND;
  v: typeof VAULT_VERSION;
  /** public locator from the vault namespace (hex) */
  loc: string;
  /** "deflate-raw" when the plaintext was compressed before encryption */
  z: "deflate-raw" | "none";
  iv: string;
  ct: string;
  sealedAt: string;
}

const utf8 = (s: string) => new TextEncoder().encode(s);
const b64u = (b: Uint8Array) => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64u = (s: string) => {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("not base64url");
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
export const base64url = { encode: b64u, decode: unb64u };

const aad = (loc: string) => utf8(`${VAULT_KIND}.v${VAULT_VERSION}:${loc}`);

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([new Uint8Array(data)]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
const canCompress = () => typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

export function emptyState(): VaultState {
  return { watchlist: [], acks: [], attestations: [], updatedAt: new Date(0).toISOString() };
}

export async function sealVault(state: VaultState, keys: VaultKeys): Promise<SealedVault> {
  const plain = utf8(JSON.stringify(state));
  const z = canCompress() ? "deflate-raw" : "none";
  const body = z === "deflate-raw" ? await pipe(plain, new CompressionStream("deflate-raw")) : plain;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(keys.locator) }, keys.key, new Uint8Array(body)));
  return { kind: VAULT_KIND, v: VAULT_VERSION, loc: keys.locator, z, iv: b64u(iv), ct: b64u(ct), sealedAt: new Date().toISOString() };
}

/** Validates untrusted input before any decryption. */
export function parseSealed(value: unknown): SealedVault {
  const o = (typeof value === "string" ? JSON.parse(value) : value) as Partial<SealedVault> | null;
  if (!o || typeof o !== "object") throw new Error("Not a Guard vault");
  if (o.kind !== VAULT_KIND || o.v !== VAULT_VERSION) throw new Error("Not a Guard vault (unknown kind or version)");
  if (typeof o.loc !== "string" || !/^[0-9a-f]{32}$/.test(o.loc)) throw new Error("Vault locator is malformed");
  if (o.z !== "deflate-raw" && o.z !== "none") throw new Error("Vault compression flag is malformed");
  if (typeof o.iv !== "string" || unb64u(o.iv).length !== 12) throw new Error("Vault nonce is malformed");
  if (typeof o.ct !== "string" || unb64u(o.ct).length < 16) throw new Error("Vault ciphertext is malformed");
  return { kind: VAULT_KIND, v: VAULT_VERSION, loc: o.loc, z: o.z, iv: o.iv, ct: o.ct, sealedAt: String(o.sealedAt ?? "") };
}

export class VaultMismatch extends Error {}

export async function openVault(sealed: SealedVault, keys: VaultKeys): Promise<VaultState> {
  if (sealed.loc !== keys.locator) throw new VaultMismatch("This vault was sealed by a different passkey.");
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(sealed.iv), additionalData: aad(sealed.loc) }, keys.key, unb64u(sealed.ct)));
  } catch {
    throw new VaultMismatch("This vault does not open with this passkey (authentication failed).");
  }
  const body = sealed.z === "deflate-raw" ? await pipe(plain, new DecompressionStream("deflate-raw")) : plain;
  const s = JSON.parse(new TextDecoder().decode(body)) as Partial<VaultState>;
  return {
    watchlist: Array.isArray(s.watchlist) ? s.watchlist.map(String) : [],
    acks: Array.isArray(s.acks) ? s.acks : [],
    attestations: Array.isArray(s.attestations) ? s.attestations : [],
    updatedAt: String(s.updatedAt ?? ""),
  };
}

/** Union of two states: nothing is dropped, newest first, duplicates removed by signature / id. */
export function mergeStates(a: VaultState, b: VaultState): VaultState {
  const watch = [...a.watchlist, ...b.watchlist.filter((x) => !a.watchlist.includes(x))].slice(0, 50);
  const bySig = new Map<string, AckRecord>();
  for (const x of [...a.acks, ...b.acks]) if (!bySig.has(x.signature)) bySig.set(x.signature, x);
  const byAtt = new Map<string, Attestation>();
  for (const x of [...a.attestations, ...b.attestations]) if (!byAtt.has(x.signature)) byAtt.set(x.signature, x);
  const newest = <T extends { signedAt: string }>(l: T[]) => l.sort((x, y) => y.signedAt.localeCompare(x.signedAt)).slice(0, 100);
  return {
    watchlist: watch,
    acks: newest([...bySig.values()]),
    attestations: newest([...byAtt.values()]),
    updatedAt: [a.updatedAt, b.updatedAt].sort().pop() ?? "",
  };
}

/** Vault link: the sealed blob in the URL fragment, which browsers never send to a server. */
export function vaultLink(sealed: SealedVault, base: string): string {
  return `${base.split("#")[0]}#vault=${b64u(utf8(JSON.stringify(sealed)))}`;
}

export function sealedFromHash(hash: string): SealedVault | null {
  const m = /[#&]vault=([A-Za-z0-9_-]+)/.exec(hash);
  if (!m) return null;
  return parseSealed(new TextDecoder().decode(unb64u(m[1])));
}

/** Calldata form, for keeping the sealed blob on Monad: "PGV1" magic + UTF-8 JSON. */
export const CALLDATA_MAGIC = "0x50475631";
export function sealedToCalldata(sealed: SealedVault): `0x${string}` {
  const bytes = utf8(JSON.stringify(sealed));
  return `${CALLDATA_MAGIC}${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
}
export function sealedFromCalldata(data: string): SealedVault {
  if (!data.toLowerCase().startsWith(CALLDATA_MAGIC)) throw new Error("This transaction does not carry a Guard vault");
  const hex = data.slice(CALLDATA_MAGIC.length);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return parseSealed(new TextDecoder().decode(bytes));
}
