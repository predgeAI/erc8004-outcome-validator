import crypto from "node:crypto";
import { PINNED_KEYS } from "./constants.js";

/** A Predge signed record (the `attestation` object of an API response). */
export interface SignedRecord {
  public_key: string;
  signature: string;
  canonical: string;
  kid?: string;
  content_hash?: string;
  payload?: unknown;
  [k: string]: unknown;
}

export interface RecordChecks {
  /** ed25519 signature over the UTF-8 bytes of `canonical`. */
  signature: boolean;
  /** the signing key is one of the pinned keys (and `kid`, if present, names it). */
  pinnedKey: boolean;
  /** sha256(canonical) == content_hash; null when the record carries no content_hash (older records). */
  contentHash: boolean | null;
  /** re-canonicalised `payload` == `canonical`; null when the record carries no payload. */
  payloadMatchesCanonical: boolean | null;
}

export interface RecordVerification {
  ok: boolean;
  checks: RecordChecks;
  /** the parsed signed bytes; the only payload a caller should use. */
  payload: Record<string, unknown>;
  /** keccak256 preimage used on chain: the exact signed bytes. */
  canonical: string;
}

const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Keys sorted at every level, no whitespace (the subset of RFC 8785 that Predge signs). */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
}

export function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");
}

function ed25519Verify(publicKeyHex: string, message: string, signatureHex: string): boolean {
  try {
    const key = crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(publicKeyHex, "hex")]), format: "der", type: "spki" });
    return crypto.verify(null, Buffer.from(message, "utf8"), key, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}

/** Verify a signed record offline. Never throws on bad input; read `ok` and `checks`. */
export function verifyRecord(rec: SignedRecord, pinnedKeys: Readonly<Record<string, string>> = PINNED_KEYS): RecordVerification {
  const pk = String(rec?.public_key ?? "").toLowerCase();
  const pinned = Object.entries(pinnedKeys).some(([kid, key]) => key.toLowerCase() === pk && (rec.kid === undefined || rec.kid === kid));
  const canonical = typeof rec?.canonical === "string" ? rec.canonical : "";
  const checks: RecordChecks = {
    signature: canonical !== "" && ed25519Verify(pk, canonical, String(rec?.signature ?? "")),
    pinnedKey: pinned,
    contentHash: rec?.content_hash === undefined ? null : sha256Hex(canonical) === String(rec.content_hash).toLowerCase(),
    payloadMatchesCanonical: rec?.payload === undefined ? null : canonicalJson(rec.payload) === canonical,
  };
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(canonical); } catch { checks.signature = false; }
  const ok = checks.signature && checks.pinnedKey && checks.contentHash !== false && checks.payloadMatchesCanonical !== false;
  return { ok, checks, payload, canonical };
}

export class PredgeVerificationError extends Error {
  constructor(message: string, public readonly checks?: RecordChecks) {
    super(message);
    this.name = "PredgeVerificationError";
  }
}
