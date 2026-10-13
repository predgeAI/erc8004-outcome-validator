import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Hex } from "viem";
import type { SignedPayload } from "../lib/api";
import { client, type OnchainResult } from "../lib/chain";
import { MONAD, tx } from "../lib/constants";
import type { WalletApi } from "../wallet/config";
import { attestPublicKey, signAttestation, verifyAttestation, type Attestation } from "../wallet/attest";
import { deriveVaultKeys, fingerprint, NAMESPACES, type VaultKeys } from "../wallet/meraKeys";
import { createPasskey, getPrf, passkeyError } from "../wallet/passkey";
import { buildReceipt, loadAcks, replaceAcks } from "../wallet/receipt";
import { mergeStates, openVault, parseSealed, sealedFromCalldata, sealedFromHash, sealedToCalldata, sealVault, vaultLink, type SealedVault, type VaultState } from "../wallet/vault";
import { ACKS_EVENT, readWatchlist, WATCH_EVENT, writeWatchlist } from "../lib/localLists";
import { Copy, Ext, fmtDate } from "./ui";

/**
 * "One passkey, many keys": the non-wallet half of Mera in Guard.
 *
 *  attest  an ed25519 identity that signs risk receipts. One prompt per receipt, no wallet, no gas.
 *  vault   an AES-256-GCM key that seals the watchlist and every receipt into one blob that can be
 *          stored anywhere. While locked, this browser keeps only the ciphertext.
 *
 * Works with any sign-in (Privy, Dynamic, Mera) or none. Keys live in memory only.
 */
const ATT_KEY = "guard.attest.v1";
const ATT_EVENT = "guard-attest";
const SEALED_KEY = "guard.vault.sealed";

const safeGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage blocked */ } };

export function loadAttestations(): Attestation[] {
  try { const v = JSON.parse(safeGet(ATT_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writeAttestations(l: Attestation[] | null) {
  safeSet(ATT_KEY, l === null ? null : JSON.stringify(l.slice(0, 100)));
  window.dispatchEvent(new Event(ATT_EVENT));
}
const loadSealed = (): SealedVault | null => { try { const s = safeGet(SEALED_KEY); return s ? parseSealed(s) : null; } catch { return null; } };

// ---- in-memory key store shared by the panel and the per-market attest button ----
interface KeyState {
  vault: VaultKeys | null;
  vaultFp: string | null;
  attestPub: string | null;
  attestFp: string | null;
  busy: string | null;
  msg: { kind: "ok" | "err" | "info"; text: string; hash?: string } | null;
  lastSealed: SealedVault | null;
}
let ks: KeyState = { vault: null, vaultFp: null, attestPub: null, attestFp: null, busy: null, msg: null, lastSealed: loadSealed() };
const subs = new Set<() => void>();
const setKs = (p: Partial<KeyState>) => { ks = { ...ks, ...p }; subs.forEach((f) => f()); };
const useKs = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => ks);

function localState(): VaultState {
  return { watchlist: readWatchlist(), acks: loadAcks(), attestations: loadAttestations(), updatedAt: new Date().toISOString() };
}
function writeLocal(s: VaultState) {
  writeWatchlist(s.watchlist);
  replaceAcks(s.acks);
  window.dispatchEvent(new Event(ACKS_EVENT));
  writeAttestations(s.attestations);
}
function wipeLocal() {
  writeWatchlist(null);
  replaceAcks(null);
  window.dispatchEvent(new Event(ACKS_EVENT));
  writeAttestations(null);
}

async function reseal(keys: VaultKeys) {
  const sealed = await sealVault(localState(), keys);
  safeSet(SEALED_KEY, JSON.stringify(sealed));
  setKs({ lastSealed: sealed });
  return sealed;
}

/** One prompt (vault namespace). Opens every sealed copy it can find and merges them into this browser. */
async function unlockVault(mode: "get" | "pick" | "create", extra: SealedVault[] = []) {
  setKs({ busy: "Waiting for your passkey (vault key)…", msg: null });
  try {
    const r = mode === "create" ? await createPasskey("vault") : await getPrf("vault", { pick: mode === "pick" });
    const keys = await deriveVaultKeys(r.prfOutput);
    r.prfOutput.fill(0);
    let state = localState();
    let opened = 0;
    const notes: string[] = [];
    const here = loadSealed();
    if (here) {
      // Never overwrite a sealed copy this passkey cannot open: it may be the only copy.
      try { state = mergeStates(await openVault(here, keys), state); opened++; } catch {
        setKs({ busy: null, msg: { kind: "err", text: "The vault in this browser was sealed by a different passkey. Use \"Choose another passkey\" and pick that one." } });
        return;
      }
    }
    for (const s of extra) {
      try { state = mergeStates(await openVault(s, keys), state); opened++; } catch (e) { notes.push((e as Error).message); }
    }
    writeLocal(state);
    setKs({ vault: keys, vaultFp: await fingerprint(keys.locator) });
    await reseal(keys);
    setKs({ busy: null, msg: { kind: notes.length && !opened ? "err" : "ok", text: `Vault open: ${state.watchlist.length} watched, ${state.acks.length} wallet receipts, ${state.attestations.length} passkey receipts${opened ? ` (merged ${opened} sealed cop${opened === 1 ? "y" : "ies"})` : ""}.${notes.length ? ` ${notes.join(" ")}` : ""}` } });
  } catch (e) {
    setKs({ busy: null, msg: { kind: "err", text: passkeyError(e) } });
  }
}

async function lockVault() {
  if (!ks.vault) return;
  await reseal(ks.vault);
  wipeLocal();
  setKs({ vault: null, msg: { kind: "info", text: "Locked. This browser now holds only the ciphertext; the key is gone from memory." } });
}

/** Imports a sealed blob from a link, a file or Monad. Opens it right away if the vault is unlocked. */
async function importSealed(s: SealedVault, from: string) {
  if (!ks.vault) return unlockVault("get", [s]);
  try {
    const merged = mergeStates(await openVault(s, ks.vault), localState());
    writeLocal(merged);
    await reseal(ks.vault);
    setKs({ msg: { kind: "ok", text: `Merged the vault from ${from}: ${merged.watchlist.length} watched, ${merged.acks.length + merged.attestations.length} receipts.` } });
  } catch (e) {
    setKs({ msg: { kind: "err", text: (e as Error).message } });
  }
}

/** One prompt (attest namespace) per receipt; the session ends as soon as it has signed. */
async function attest(payload: SignedPayload, oc: OnchainResult | null, sha: string, title: string) {
  setKs({ busy: "Waiting for your passkey (attestation key)…", msg: null });
  try {
    const { prfOutput } = await getPrf("attest");
    const message = buildReceipt({ marketId: String(payload.market_id), riskLevel: String(payload.risk_level), contentSha256: sha, onchain: oc, checkedAt: payload.checked_at });
    const a = await signAttestation(prfOutput, message, title);
    prfOutput.fill(0);
    if (!(await verifyAttestation(a))) throw new Error("The new attestation did not verify");
    writeAttestations([a, ...loadAttestations().filter((x) => x.signature !== a.signature)]);
    setKs({ busy: null, attestPub: a.public_key, attestFp: await fingerprint(a.public_key), msg: { kind: "ok", text: `Signed and verified with passkey key ${await fingerprint(a.public_key)}.` } });
  } catch (e) {
    setKs({ busy: null, msg: { kind: "err", text: passkeyError(e) } });
  }
}

async function showAttestKey() {
  setKs({ busy: "Waiting for your passkey (attestation key)…", msg: null });
  try {
    const { prfOutput } = await getPrf("attest");
    const pub = await attestPublicKey(prfOutput);
    prfOutput.fill(0);
    setKs({ busy: null, attestPub: pub, attestFp: await fingerprint(pub) });
  } catch (e) {
    setKs({ busy: null, msg: { kind: "err", text: passkeyError(e) } });
  }
}

export function AttestButton({ payload, oc, evidence, title }: { payload: SignedPayload; oc: OnchainResult | null; evidence: { ok: boolean; sha?: string }; title: string }) {
  const k = useKs();
  return (
    <button className="btn-ghost" data-testid="attest" disabled={!evidence.ok || !evidence.sha || Boolean(k.busy)}
      title={evidence.ok ? "Signs this check with an ed25519 key derived from your passkey. No wallet, no gas." : "Available once the evidence has verified"}
      onClick={() => attest(payload, oc, evidence.sha!, title)}>
      Attest with passkey
    </button>
  );
}

export function PasskeyKeys({ wallet, onOpen }: { wallet: WalletApi | null; onOpen: (id: string) => void }) {
  const k = useKs();
  const [atts, setAtts] = useState<Attestation[]>(loadAttestations);
  const [txIn, setTxIn] = useState("");
  const [linkVault, setLinkVault] = useState<SealedVault | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = () => setAtts(loadAttestations());
    window.addEventListener(ATT_EVENT, h);
    return () => window.removeEventListener(ATT_EVENT, h);
  }, []);

  // A vault link carries the sealed blob in the URL fragment.
  useEffect(() => {
    try {
      const s = sealedFromHash(location.hash);
      if (s) { setLinkVault(s); history.replaceState(null, "", location.pathname + location.search); }
    } catch (e) { setKs({ msg: { kind: "err", text: `Vault link: ${(e as Error).message}` } }); }
  }, []);

  // While unlocked, every change is sealed again.
  useEffect(() => {
    if (!k.vault) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const h = () => { clearTimeout(t); t = setTimeout(() => { if (ks.vault) reseal(ks.vault).catch(() => {}); }, 300); };
    for (const ev of [WATCH_EVENT, ACKS_EVENT, ATT_EVENT]) window.addEventListener(ev, h);
    return () => { clearTimeout(t); for (const ev of [WATCH_EVENT, ACKS_EVENT, ATT_EVENT]) window.removeEventListener(ev, h); };
  }, [k.vault]);

  const busy = Boolean(k.busy);
  const link = k.lastSealed ? vaultLink(k.lastSealed, location.href) : "";
  const download = () => {
    if (!k.lastSealed) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(k.lastSealed, null, 2)], { type: "application/json" }));
    a.download = `predge-guard-vault-${k.lastSealed.loc.slice(0, 8)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try { await importSealed(parseSealed(await f.text()), "the file"); } catch (e) { setKs({ msg: { kind: "err", text: `File: ${(e as Error).message}` } }); }
    if (fileRef.current) fileRef.current.value = "";
  };
  const fromTx = async () => {
    try {
      const h = txIn.trim() as Hex;
      if (!/^0x[0-9a-fA-F]{64}$/.test(h)) throw new Error("Paste a Monad testnet transaction hash");
      const t = await client.getTransaction({ hash: h });
      await importSealed(sealedFromCalldata(t.input), "Monad");
      setTxIn("");
    } catch (e) { setKs({ msg: { kind: "err", text: `Monad: ${(e as Error).message.split("\n")[0]}` } }); }
  };
  const publish = async () => {
    if (!wallet?.address || !ks.vault) return;
    try {
      const sealed = await reseal(ks.vault);
      setKs({ busy: `Sending the sealed vault to Monad testnet (${wallet.sendVia})…` });
      const hash = await wallet.sendTx({ to: wallet.address, data: sealedToCalldata(sealed) });
      setKs({ busy: "Waiting for Monad…" });
      await client.waitForTransactionReceipt({ hash });
      setKs({ busy: null, msg: { kind: "ok", text: "Ciphertext stored on Monad testnet. Restore it on any device with this transaction hash and the same passkey.", hash } });
      wallet.refreshBalance();
    } catch (e) {
      const m = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message;
      setKs({ busy: null, msg: { kind: "err", text: /insufficient funds|exceeds the balance/i.test(m) ? "The signed-in account needs testnet MON for gas (faucet)." : m.split("\n")[0] } });
    }
  };

  return (
    <section className="section" id="keys" data-testid="passkey-keys">
      <div className="section-head">
        <span className="eyebrow">One passkey, many keys</span>
        <h2>Your receipts and watchlist, keyed to your passkey</h2>
        <p className="lede">Each key below comes from a separate PRF salt on the same passkey (Mera). Nothing secret is stored: the passkey recomputes every key on any device it syncs to. Works with any sign-in, or none.</p>
      </div>

      <div className="ns-grid">
        <div className="card ns-card">
          <div className="ns-top"><span className="ptag ptag-mera">account</span><span className="mono sm muted">sha256("mera.prf.salt.v1")</span></div>
          <b>Monad account</b>
          <p className="sm muted">BIP-44 EOA. The only wallet use, and optional here.</p>
          <div className="mono sm break" data-testid="ns-account">{wallet?.kind === "mera" && wallet.address ? wallet.address : "Sign in with Mera to derive it"}</div>
        </div>
        <div className="card ns-card">
          <div className="ns-top"><span className="ptag ptag-mera">attest</span><span className="mono sm muted">sha256("{NAMESPACES.attest}")</span></div>
          <b>Receipt identity (ed25519)</b>
          <p className="sm muted">Signs "I saw this risk" receipts. Not linked to any address. One prompt per receipt.</p>
          <div className="mono sm" data-testid="ns-attest">{k.attestFp ? <>key {k.attestFp}</> : <button className="linkish" disabled={busy} onClick={showAttestKey}>Show my key fingerprint</button>}</div>
        </div>
        <div className="card ns-card">
          <div className="ns-top"><span className="ptag ptag-mera">vault</span><span className="mono sm muted">sha256("{NAMESPACES.vault}")</span></div>
          <b>Vault key (AES-256-GCM)</b>
          <p className="sm muted">Seals the watchlist and every receipt. Non-extractable, memory only.</p>
          <div className="mono sm" data-testid="ns-vault">{k.vault ? <>locator {k.vaultFp}</> : k.lastSealed ? "Locked (ciphertext in this browser)" : "Not created yet"}</div>
        </div>
      </div>

      <div className="card vault-card">
        <div className="vault-row">
          {!k.vault ? (<>
            <button className="btn-primary sm" disabled={busy} onClick={() => unlockVault("get", linkVault ? [linkVault] : [])} data-testid="vault-unlock">{linkVault ? "Open the vault from this link" : k.lastSealed ? "Unlock vault" : "Seal with my passkey"}</button>
            <button className="btn-ghost sm" disabled={busy} onClick={() => unlockVault("pick", linkVault ? [linkVault] : [])}>Choose another passkey</button>
            <button className="btn-ghost sm" disabled={busy} onClick={() => unlockVault("create")} data-testid="vault-create">Create a passkey</button>
          </>) : (<>
            <span className="badge badge-ok">Vault open</span>
            <button className="btn-primary sm" disabled={busy} onClick={lockVault} data-testid="vault-lock">Lock and keep only ciphertext</button>
            {link && <Copy text={link} label="Copy vault link" />}
            <button className="btn-ghost sm" onClick={download} disabled={!k.lastSealed}>Download sealed file</button>
            {wallet?.authenticated && wallet.address && <button className="btn-ghost sm" disabled={busy} onClick={publish} data-testid="vault-publish">Keep a copy on Monad</button>}
          </>)}
        </div>
        <div className="vault-row">
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <button className="btn-ghost sm" disabled={busy} onClick={() => fileRef.current?.click()}>Restore from file</button>
          <input className="tx-in mono" value={txIn} onChange={(e) => setTxIn(e.target.value)} placeholder="or a Monad testnet tx hash" spellCheck={false} />
          <button className="btn-ghost sm" disabled={busy || !txIn} onClick={fromTx}>Restore from Monad</button>
        </div>
        {k.busy && <p className="sm muted">{k.busy}</p>}
        {k.msg && <p className={`sm ${k.msg.kind === "err" ? "err" : k.msg.kind === "ok" ? "okc" : "muted"}`} data-testid="vault-msg">{k.msg.text} {k.msg.hash && <Ext href={tx(k.msg.hash)} className="mono">{k.msg.hash.slice(0, 12)}… ↗</Ext>}</p>}
        {linkVault && !k.vault && <p className="sm muted">This link carries a sealed vault (locator {linkVault.loc.slice(0, 8)}…). Only the passkey that sealed it can open it.</p>}
        <p className="sm muted">The sealed blob is ciphertext plus a public locator; keep it in this browser, a link, a file or Monad calldata. Locking removes the readable copy from this browser. Monad copies cost testnet gas from the signed-in account ({MONAD.name}).</p>
      </div>

      {atts.length > 0 && (
        <div className="ack-list">
          <h3 className="sm">Passkey receipts</h3>
          {atts.map((a) => <AttRow key={a.signature} a={a} onOpen={onOpen} />)}
        </div>
      )}
    </section>
  );
}

function AttRow({ a, onOpen }: { a: Attestation; onOpen: (id: string) => void }) {
  const [ok, setOk] = useState<boolean | null>(null);
  const [fp, setFp] = useState("");
  useEffect(() => {
    let live = true;
    verifyAttestation(a).then((v) => live && setOk(v));
    fingerprint(a.public_key).then((f) => live && setFp(f));
    return () => { live = false; };
  }, [a]);
  const json = JSON.stringify({ public_key: a.public_key, signature: a.signature, canonical: a.canonical }, null, 2);
  return (
    <div className="card ack-row" data-testid="attestation">
      <div className="ack-top">
        <div>
          <b>Market {a.message.marketId}</b>{a.title ? <span className="muted"> · {a.title}</span> : null}
          <div className="sm muted">risk {a.message.riskLevel} · verdict {a.message.onchainVerdict} · signed {fmtDate(a.signedAt)} by passkey key {fp} · {ok === null ? "verifying…" : ok ? <span className="okc">ed25519 verified</span> : <span className="err">does not verify</span>}</div>
        </div>
        <div className="menu-row">
          <Copy text={json} label="Copy signed receipt" />
          <button className="btn-ghost sm" onClick={() => onOpen(a.message.marketId)}>Check again</button>
        </div>
      </div>
    </div>
  );
}
