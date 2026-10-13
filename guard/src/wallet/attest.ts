import { createEd25519SigningSession } from "@category-labs/mera";
import { canonicalJson, verifyEd25519 } from "../lib/verify";
import { deriveAttestSeed } from "./meraKeys";
import type { ReceiptMessage } from "./receipt";

/**
 * Passkey attestations: a risk receipt signed by an ed25519 key from the passkey's attest namespace.
 *
 * No wallet, no chain, no gas. The key is unrelated to the user's EVM account (different PRF salt),
 * so a receipt proves "the holder of this passkey acknowledged this risk" without linking it to an
 * address. The format is the one Predge already uses for its own evidence records
 * ({ public_key, signature, canonical }), so the same verifier checks both.
 */
export const ATTEST_DOMAIN = "predge.guard.attest.v1";

export interface Attestation {
  public_key: string;
  signature: string;
  canonical: string;
  message: ReceiptMessage;
  signedAt: string;
  title?: string;
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

export function attestationCanonical(message: ReceiptMessage, signedAt: string): string {
  return canonicalJson({ domain: ATTEST_DOMAIN, type: "RiskAcknowledgement", signedAt, ...message });
}

/** Public key of the attest namespace for a PRF output. The private key is zeroed before returning. */
export async function attestPublicKey(prf: Uint8Array): Promise<string> {
  const seed = await deriveAttestSeed(prf);
  const s = createEd25519SigningSession({ privateKey: seed });
  try { return hex(s.publicKey); } finally { s.end(); seed.fill(0); }
}

/** Signs one receipt. The signing session lives only for this call. */
export async function signAttestation(prf: Uint8Array, message: ReceiptMessage, title?: string, now = new Date()): Promise<Attestation> {
  const seed = await deriveAttestSeed(prf);
  const session = createEd25519SigningSession({ privateKey: seed });
  try {
    const signedAt = now.toISOString();
    const canonical = attestationCanonical(message, signedAt);
    const sig = await session.signMessage(new TextEncoder().encode(canonical));
    return { public_key: hex(session.publicKey), signature: hex(sig), canonical, message, signedAt, ...(title ? { title } : {}) };
  } finally {
    session.end();
    seed.fill(0);
  }
}

/** Checks the signature and that the canonical text really is this message (not just any signed text). */
export async function verifyAttestation(a: Attestation, expectedKey?: string): Promise<boolean> {
  if (expectedKey && a.public_key.toLowerCase() !== expectedKey.toLowerCase()) return false;
  if (attestationCanonical(a.message, a.signedAt) !== a.canonical) return false;
  try { return (await verifyEd25519(a)).ok; } catch { return false; }
}
