import { keccak256, toBytes } from "viem";
import * as noble from "@noble/ed25519";

export interface SignedRecord {
  public_key: string;
  signature: string;
  canonical: string;
  content_hash?: string;
  kid?: string;
}

/** Keys sorted at every level, no insignificant whitespace (the subset of RFC 8785 Predge signs). */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
}

export const hexToBytes = (h: string) => {
  const s = h.startsWith("0x") ? h.slice(2) : h;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16);
  return out;
};
const toHex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

export type Engine = "WebCrypto" | "noble-ed25519";

/** ed25519 over the UTF-8 bytes of `canonical`. WebCrypto first, @noble/ed25519 where the browser lacks it. */
export async function verifyEd25519(rec: SignedRecord): Promise<{ ok: boolean; engine: Engine }> {
  const msg = new TextEncoder().encode(rec.canonical);
  const pub = hexToBytes(rec.public_key);
  const sig = hexToBytes(rec.signature);
  try {
    const key = await crypto.subtle.importKey("raw", pub, { name: "Ed25519" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, sig, msg);
    return { ok, engine: "WebCrypto" };
  } catch {
    const ok = await noble.verifyAsync(sig, msg, pub);
    return { ok, engine: "noble-ed25519" };
  }
}

export async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

export const keccakOf = (s: string) => keccak256(toBytes(s));

/** The fields an agent sees must come from the signed bytes: parse and re-canonicalise. */
export function roundTrips(canonical: string): boolean {
  try { return canonicalJson(JSON.parse(canonical)) === canonical; } catch { return false; }
}
