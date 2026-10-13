import { createPasskeyWithPrfOutput, getPasskeyPrfOutput, isMeraError, type PasskeyCredentialMetadata, type WebAuthnClient } from "@category-labs/mera";
import { namespaceSalt, type Namespace } from "./meraKeys";

/**
 * Passkey ceremonies for Guard. The only thing stored is the credential id and transports, which
 * are public and only pick which passkey to ask for. If they are missing (fresh browser, cleared
 * storage) the browser offers every passkey saved for this site and the keys come back the same.
 */
const CRED_KEY = "guard.mera.credential";

export type PrfNamespace = "account" | Namespace;

let client: WebAuthnClient | undefined;
/** Tests swap in a software authenticator. */
export function setWebAuthnClient(c: WebAuthnClient | undefined) { client = c; }

export const rpId = () => location.hostname;

export function storedCredential(): PasskeyCredentialMetadata | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(CRED_KEY) || "null");
    return v && typeof v.credentialId === "string" ? { credentialId: v.credentialId, ...(Array.isArray(v.transports) ? { transports: v.transports } : {}) } : undefined;
  } catch { return undefined; }
}
function remember(c: PasskeyCredentialMetadata) {
  try { localStorage.setItem(CRED_KEY, JSON.stringify(c)); } catch { /* storage blocked: next sign-in uses the passkey picker */ }
}
export function forgetCredential() { try { localStorage.removeItem(CRED_KEY); } catch { /* ignore */ } }

const saltFor = async (ns: PrfNamespace) => (ns === "account" ? undefined : await namespaceSalt(ns));

/** One ceremony: creates a new passkey and evaluates the PRF for `ns`. */
export async function createPasskey(ns: PrfNamespace): Promise<{ prfOutput: Uint8Array<ArrayBuffer>; credentialId: string }> {
  const prfSalt = await saltFor(ns);
  const created = await createPasskeyWithPrfOutput({
    rp: { id: rpId(), name: "Predge Guard" },
    user: { name: `Predge Guard ${new Date().toISOString().slice(0, 10)}`, displayName: "Predge Guard" },
    ...(prfSalt ? { prfSalt } : {}),
    ...(client ? { webAuthnClient: client } : {}),
  });
  remember({ credentialId: created.credentialId, ...(created.transports ? { transports: created.transports } : {}) });
  return { prfOutput: created.prfOutput, credentialId: created.credentialId };
}

/** One ceremony: evaluates the PRF for `ns` on the remembered passkey, or lets the user pick one. */
export async function getPrf(ns: PrfNamespace, opts: { pick?: boolean } = {}): Promise<{ prfOutput: Uint8Array<ArrayBuffer>; credentialId: string }> {
  const prfSalt = await saltFor(ns);
  const known = opts.pick ? undefined : storedCredential();
  const r = await getPasskeyPrfOutput({
    rpId: rpId(),
    ...(known ? { credential: known } : {}),
    ...(prfSalt ? { prfSalt } : {}),
    ...(client ? { webAuthnClient: client } : {}),
  });
  remember(known?.credentialId === r.credentialId ? known : { credentialId: r.credentialId });
  return r;
}

export function passkeyError(e: unknown): string {
  if (isMeraError(e)) {
    switch (e.code) {
      case "PRF_UNAVAILABLE": return "This passkey provider does not support the PRF extension. Use iCloud Keychain, 1Password or Google Password Manager (on desktop Chrome, save the passkey to Google Password Manager, not the local profile).";
      case "PASSKEY_OPERATION_FAILED": return "The passkey prompt was dismissed or failed. Try again.";
      case "CRYPTO_UNAVAILABLE": return "Passkeys need HTTPS or localhost.";
      case "SESSION_ENDED": return "The signing session ended. Unlock again.";
      default: return `Passkey error (${e.code}).`;
    }
  }
  return ((e as Error)?.message ?? "Passkey error").split("\n")[0];
}

/** A plain-words reason passkey keys cannot work in this browser, or null when nothing rules it out. */
export function passkeySupportProblem(): string | null {
  if (typeof window === "undefined" || !window.isSecureContext) return "Passkeys need HTTPS or localhost.";
  if (!("PublicKeyCredential" in window) || !navigator.credentials) return "This browser has no passkey (WebAuthn) support. Try Chrome or Safari.";
  return null;
}

/** Async probe: true/false when the browser reports PRF support, null when it does not say. */
export async function prfSupported(): Promise<boolean | null> {
  try {
    const f = (window.PublicKeyCredential as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> }).getClientCapabilities;
    if (!f) return null;
    const c = await f.call(window.PublicKeyCredential);
    return typeof c["extension:prf"] === "boolean" ? c["extension:prf"] : null;
  } catch { return null; }
}
