// Perpl API-key signing (Ed25519), as specified in
// https://docs.perpl.xyz/resources/for-developers/api/authentication
import { createHash, createPrivateKey, createPublicKey, randomBytes, sign } from "node:crypto";
import { readFileSync } from "node:fs";

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

/** Build a node KeyObject from the 32-byte Ed25519 seed (hex, with or without 0x). */
export function keyFromSeedHex(hex) {
  const seed = Buffer.from(String(hex).trim().replace(/^0x/, ""), "hex");
  if (seed.length !== 32) throw new Error("Perpl API key secret must be a 32-byte Ed25519 seed in hex");
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: "der", type: "pkcs8" });
}

/** Raw 32-byte public key as 0x-hex, the form Perpl enrolls. */
export function publicKeyHex(key) {
  const der = createPublicKey(key).export({ format: "der", type: "spki" });
  return "0x" + der.subarray(der.length - 32).toString("hex");
}

/**
 * Load credentials for live mode. The secret is read from a file the owner provides
 * (PERPL_API_KEY_SECRET_FILE) and is never printed or logged.
 */
export function loadCredentials(env = process.env) {
  const apiKey = env.PERPL_API_KEY;
  const file = env.PERPL_API_KEY_SECRET_FILE;
  const account = env.PERPL_ACCOUNT_ID;
  const missing = [!apiKey && "PERPL_API_KEY", !file && "PERPL_API_KEY_SECRET_FILE", !account && "PERPL_ACCOUNT_ID"].filter(Boolean);
  if (missing.length) throw new Error(`live mode needs ${missing.join(", ")} (see README, "Going live on testnet")`);
  return { apiKey, key: keyFromSeedHex(readFileSync(file, "utf8")), accountId: Number(account) };
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");
export const nonce = () => randomBytes(16).toString("base64url");

/** REST canonical string: chain_id, METHOD, request-target, timestamp_ms, nonce, sha256(body) hex. */
export function restCanonical({ chainId, method, target, timestamp, nonce: n, body = "" }) {
  const bodyHash = createHash("sha256").update(body).digest("hex");
  return [chainId, method.toUpperCase(), target, timestamp, n, bodyHash].join("\n");
}

export function signRest({ chainId, apiKey, key, method, target, body = "", timestamp = Date.now().toString(), nonce: n = nonce() }) {
  const canonical = restCanonical({ chainId, method, target, timestamp, nonce: n, body });
  return {
    canonical,
    headers: {
      "X-API-Key": apiKey,
      "X-API-Timestamp": timestamp,
      "X-API-Nonce": n,
      "X-API-Signature": b64url(sign(null, Buffer.from(canonical), key)),
    },
  };
}

/** Trading WebSocket sign-in frame (mt 29). */
export function wsSignInFrame({ chainId, apiKey, key, timestamp = Date.now().toString(), nonce: n = nonce() }) {
  const canonical = [chainId, "trading-ws-signin", timestamp, n].join("\n");
  return { mt: 29, chain_id: chainId, api_key: apiKey, timestamp, nonce: n, signature: b64url(sign(null, Buffer.from(canonical), key)) };
}
