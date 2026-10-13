# Mera in Predge Guard: one passkey, many keys

Guard uses one passkey ([Mera](https://mera.category.xyz), WebAuthn PRF) for three unrelated keys.
Each key comes from its own PRF salt, so each one is a separate PRF evaluation. Nothing secret is
stored anywhere: the passkey recomputes every key on each device it syncs to.

| Namespace | PRF salt | Derivation | Used for |
|---|---|---|---|
| account | `sha256("mera.prf.salt.v1")` (Mera default) | BIP-39 entropy, BIP-44 `m/44'/60'/0'/0/0` | Monad testnet EOA: EIP-712 risk receipts, validationRequest, vault copies on Monad |
| attest | `sha256("predge.guard.attest.v1")` | HKDF-SHA-256, info `predge.guard.attest.ed25519-seed.v1`, into `createEd25519SigningSession` | Signs "I saw this risk" receipts. No wallet, no chain, no gas. Not linked to any address |
| vault | `sha256("predge.guard.vault.v1")` | HKDF-SHA-256: info `predge.guard.vault.aes-256-gcm.v1` gives a non-extractable AES-256-GCM key, info `predge.guard.vault.locator.v1` gives a public 16-byte locator | Seals the watchlist, wallet receipts and passkey receipts into one blob that can live anywhere |

Two of the three namespaces do non-account work. The account namespace is optional: the attest and
vault keys work with a Privy or Dynamic sign-in, or with no sign-in at all.

## What is stored, and where

- This browser: the credential id and transports (public, only pick which passkey to ask for), the
  Mera account address (public), and the sealed vault (ciphertext plus locator). While the vault is
  unlocked the readable watchlist and receipts are in localStorage too; **Lock** removes them and
  leaves only the ciphertext.
- Never stored: PRF outputs, private keys, the AES key. PRF buffers and seeds are zeroed after use and
  signing sessions are ended with `session.end()`.
- Sealed vault format: `{ kind: "predge.guard.vault", v: 1, loc, z, iv, ct, sealedAt }`. The plaintext is
  deflate-raw compressed JSON. `loc` is bound into the AES-GCM additional data, so a blob cannot be
  relabelled. The blob can be kept as a link (`#vault=` fragment, never sent to a server), a file, or
  Monad testnet calldata (`0x50475631` "PGV1" + JSON, sent to the account itself).
- Passkey receipts use the same `{ public_key, signature, canonical }` shape as Predge's own signed
  evidence records, so one ed25519 verifier checks both. `canonical` must equal the canonical JSON of
  the message, so a signature over other text does not verify.

## Session design

- Sign in: one passkey prompt (account namespace). It opens a Mera secp256k1 signing session, so EIP-712
  receipts and Monad transactions sign without prompts. The session ends after 10 minutes idle or
  30 minutes total, or on **Lock now**; the next signature prompts once.
- Vault: one prompt to unlock; the AES key stays in memory (non-extractable) until **Lock** or page close.
- Attest: one prompt per receipt. The ed25519 session lives only for that signature.

## Pages

- `index.html`: Privy, Dynamic and Mera side by side. Privy and Dynamic flows are unchanged.
- `mera.html`: Mera is the whole account layer. Privy and Dynamic are neither offered nor loaded.

## Tests

`npm run test:mera` (12 tests). A software authenticator computes the PRF the way WebAuthn does
(HMAC-SHA-256 over `SHA-256("WebAuthn PRF" || 0x00 || salt)`) from a fixed test secret. Covered:
salts pinned and distinct from Mera's default; the account key matches viem's independent
`mnemonicToAccount` (vector: PRF bytes `0x01..0x20` give `0x50B240678777451BEfd67B7e8c3b4366482ba8F9`);
HKDF outputs match `node:crypto` hkdfSync and pinned vectors; one ceremony per namespace; no PRF output
in storage; a second device with empty storage and the same synced passkey gets the same account,
attest key and locator and opens the vault from a link; another passkey gets different keys and cannot
open it; tampered or relabelled ciphertext is rejected; calldata round trip; tampered receipts fail;
merge rules; the Mera viem account signs the Guard EIP-712 receipt and stops after `session.end()`.

## Owner demo (real passkey)

Use the deployed HTTPS page (`https://guard.predge.io/mera.html`) or
`http://localhost:5173/mera.html` after `npm run build && npx vite preview --port 5173`. A passkey is
bound to the host it was created on, so do the whole demo on one host. Use iCloud Keychain,
1Password or Google Password Manager (on desktop Chrome, save to Google Password Manager; a passkey in
the local Chrome profile has no PRF).

Device 1 (for example the Mac in Safari):
1. Open `mera.html`. Click **Connect**, then **Create a passkey account**. Approve Touch ID once.
   The header shows the Mera address.
2. Click the **1137824** chip. Wait for "Is it safe to act?".
3. Click **Acknowledge risk**: no prompt (signing session). The EIP-712 receipt shows "Signature verified".
4. Click **Watch this market**.
5. Click **Attest with passkey**: one prompt. Scroll to **One passkey, many keys**: the attest card
   shows `key xxxx-xxxx-xxxx` and the receipt is listed as "ed25519 verified".
6. Click **Seal with my passkey**: one prompt. The vault card shows `locator xxxx-xxxx-xxxx`.
7. Optional, needs testnet MON on the Mera address (faucet link in the account menu): click
   **Keep a copy on Monad** (no prompt) and note the transaction hash.
8. Click **Copy vault link**, then **Lock and keep only ciphertext**. The watchlist, receipts and
   attestations disappear from the page.

Stateless test (device 2: the iPhone, or a fresh browser profile, or the same browser after clearing
site data):
9. Open the vault link from step 8 (AirDrop or Notes), or open `mera.html` and paste the step 7
   transaction hash into **Restore from Monad**.
10. Click **Open the vault from this link** (or **Unlock vault**) and pick the same passkey. One prompt.
    The same `locator`, the watchlist, the EIP-712 receipt and the passkey receipt come back, and the
    passkey receipt still verifies under the same key fingerprint.
11. Click **Connect**, then **Sign in with my passkey**. One prompt. The same Mera address appears.
12. Click **Show my key fingerprint** on the attest card if it is empty: same fingerprint as step 5.
