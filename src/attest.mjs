// Predge signed-outcome attestation primitive — a self-contained mirror of
// predge-x402-api/src/lib/attest.ts (ed25519 over canonical JSON). Kept here so
// the validator artifact needs no import from the API repo. Wire format is
// identical: signature = 64-byte ed25519 hex, public_key = raw 32-byte point hex,
// canonical = RFC-8785/JCS-subset JSON (keys sorted at every level, no whitespace).
import crypto from "node:crypto";

export const ATTEST_VERSION = "predge-attest-v1";
export const ATTEST_ISSUER = "predge.io";
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex"); // 12 bytes

/** Deterministic JSON: keys sorted lexicographically at every level, no whitespace. */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const parts = Object.keys(value)
    .sort()
    .filter((k) => value[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`);
  return `{${parts.join(",")}}`;
}

function rawPubKeyHex(publicKey) {
  const spki = publicKey.export({ type: "spki", format: "der" });
  if (!spki.subarray(0, 12).equals(SPKI_ED25519_PREFIX)) throw new Error("unexpected SPKI prefix");
  return spki.subarray(12).toString("hex"); // raw 32-byte point
}

/** Sign a payload object → the Predge attestation envelope. */
export function signAttestation(payload, privateKey, publicKey) {
  const canonical = canonicalJson(payload);
  const signature = crypto.sign(null, Buffer.from(canonical, "utf8"), privateKey);
  return {
    payload,
    canonical,
    signature: signature.toString("hex"),
    public_key: rawPubKeyHex(publicKey),
    algorithm: "ed25519",
    verify_recipe:
      "ed25519: verify `signature` (hex,64B) over UTF-8 bytes of `canonical` using `public_key` (hex, raw 32B point).",
  };
}

/** Independent offline verification — exactly what any consumer would run. */
export function verifyAttestation(att) {
  const spki = Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(att.public_key, "hex")]);
  const publicKey = crypto.createPublicKey({ key: spki, format: "der", type: "spki" });
  // canonical must reproduce from payload (no smuggled bytes)
  if (canonicalJson(att.payload) !== att.canonical) return false;
  return crypto.verify(null, Buffer.from(att.canonical, "utf8"), publicKey, Buffer.from(att.signature, "hex"));
}

/** Ephemeral ed25519 keypair (the real deployment uses env ATTEST_SIGNING_KEY). */
export function ephemeralKeypair() {
  return crypto.generateKeyPairSync("ed25519");
}
