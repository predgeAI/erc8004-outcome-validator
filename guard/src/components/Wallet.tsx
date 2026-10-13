import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { encodeFunctionData, formatEther, type Hex } from "viem";
import { AVAILABLE, type WalletApi, type WalletKind } from "../wallet/config";
import type { SignedPayload } from "../lib/api";
import { client, VALIDATOR_ABI, type OnchainResult } from "../lib/chain";
import { addr, MONAD, tx } from "../lib/constants";
import { buildReceipt, loadAcks, removeAck, saveAck, signReceipt, verifyReceipt, type AckRecord } from "../wallet/receipt";
import { Copy, Ext, fmtDate, Hash } from "./ui";
import { meraIntent } from "../wallet/meraIntent";
import { AttestButton } from "./PasskeyKeys";
import { ACKS_EVENT, readWatchlist, WATCH_EVENT, writeWatchlist } from "../lib/localLists";

const PrivyHost = lazy(() => import("../wallet/PrivyHost"));
const DynamicHost = lazy(() => import("../wallet/DynamicHost"));
const MeraHost = lazy(() => import("../wallet/MeraHost"));

const KIND_KEY = "guard.wallet.kind";
const safeGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage blocked */ } };

/** A provider chunk that fails to load must not leave the header stuck: report it as a stuck sign-in. */
class HostBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** Mounts only the provider the user picked, so neither SDK loads until it is needed. */
export function WalletHost({ kind, autoLogin, enabled, nonce, onChange, onFail }: { kind: WalletKind | null; autoLogin: boolean; enabled: boolean; nonce: number; onChange: (w: WalletApi | null) => void; onFail: () => void }) {
  if (!kind || !enabled) return null;
  return (
    <HostBoundary key={`${kind}-${nonce}`} onFail={onFail}>
      <Suspense fallback={null}>
        {kind === "privy" ? <PrivyHost onChange={onChange} autoLogin={autoLogin} /> : kind === "dynamic" ? <DynamicHost onChange={onChange} autoLogin={autoLogin} /> : <MeraHost onChange={onChange} autoLogin={autoLogin} />}
      </Suspense>
    </HostBoundary>
  );
}

/** How long a provider SDK gets to become ready before the page stops showing a spinner. */
export const READY_TIMEOUT_MS = 8000;

export function stuckMessage(kind: WalletKind | null): string {
  return kind === "mera"
    ? "Passkey sign-in did not start. This browser may block passkeys or not support them here. Try Chrome or Safari, then retry."
    : "Your browser blocked the sign-in window. In Brave, turn Shields off for this site, or try Chrome.";
}

export function useWalletState() {
  const saved = safeGet(KIND_KEY) as WalletKind | null;
  const [kind, setKind] = useState<WalletKind | null>(saved && AVAILABLE.includes(saved) ? saved : null);
  const [autoLogin, setAutoLogin] = useState(false);
  const [api, setApi] = useState<WalletApi | null>(null);
  // A saved session is restored after first paint, never before; a fresh click mounts the provider at once.
  const [enabled, setEnabled] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!kind || enabled) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const go = () => setEnabled(true);
    if (w.requestIdleCallback) { w.requestIdleCallback(go, { timeout: 3000 }); return; }
    const id = setTimeout(go, 1500);
    return () => clearTimeout(id);
  }, [kind, enabled]);
  const ready = Boolean(api?.ready);
  useEffect(() => {
    if (!kind || !enabled || ready) { setStuck(false); return; }
    const id = setTimeout(() => setStuck(true), READY_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [kind, enabled, ready, nonce]);
  const choose = (k: WalletKind, mode?: "create" | "get" | "pick") => {
    if (mode) meraIntent.mode = mode;
    if (kind === k && api?.ready) { api.login(); return; }
    setApi(null); setStuck(false); setAutoLogin(true); setEnabled(true); setKind(k); setNonce((n) => n + 1); safeSet(KIND_KEY, k);
  };
  const retry = () => {
    if (!kind) return;
    setApi(null); setStuck(false); setAutoLogin(true); setEnabled(true); setNonce((n) => n + 1);
  };
  const fail = () => setStuck(true);
  const disconnect = async () => {
    try { await api?.logout(); } catch { /* ignore */ }
    setApi(null); setKind(null); setAutoLogin(false); setStuck(false); safeSet(KIND_KEY, null);
  };
  return { kind, autoLogin, api, setApi, choose, disconnect, enabled, stuck, retry, fail, nonce };
}

const NAMES: Record<WalletKind, { name: string; sub: string }> = {
  privy: { name: "Privy", sub: "Email or wallet, embedded wallet if you have none" },
  dynamic: { name: "Dynamic", sub: "Wallet or email via Dynamic" },
  mera: { name: "Mera", sub: "Passkey account: Face ID, Touch ID or a security key. No seed phrase, no extension" },
};

export function ConnectButton({ state }: { state: ReturnType<typeof useWalletState> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const { api } = state;
  useEffect(() => { if (state.stuck && state.autoLogin) setOpen(true); }, [state.stuck, state.autoLogin]);
  const apiError = api?.error ?? null;
  useEffect(() => { if (apiError) setOpen(true); }, [apiError]);
  if (!AVAILABLE.length) return null;
  if (api?.authenticated && api.address) {
    return (
      <div className="connect" ref={ref}>
        <button className="btn-ghost addr-btn" onClick={() => setOpen((o) => !o)} data-testid="wallet-address">
          <span className="dot ok" /> <ProviderTag kind={api.kind} /> <span className="mono">{api.address.slice(0, 6)}…{api.address.slice(-4)}</span>
        </button>
        {open && (
          <div className="menu">
            <div className="menu-head">Signed in with <ProviderTag kind={api.kind} /></div>
            <div className="menu-addr mono">{api.address}</div>
            <div className="menu-sub">{api.walletLabel} · Monad testnet (chain {MONAD.chainId})</div>
            <div className="menu-sub">Balance: <BalanceText api={api} /></div>
            {api.kind === "mera" && <SessionText endsAt={api.sessionEndsAt ?? null} />}
            <div className="menu-row">
              <Ext href={addr(api.address)} className="btn-ghost sm">MonadVision ↗</Ext>
              <Ext href={MONAD.faucet} className="btn-ghost sm">Testnet faucet ↗</Ext>
            </div>
            {api.extras.map((x) => (
              <button key={x.id} className="btn-ghost sm full" data-testid={x.id} onClick={() => { setOpen(false); Promise.resolve(x.run()).catch(() => {}); }}>{x.label}</button>
            ))}
            <button className="btn-ghost sm full" onClick={() => { setOpen(false); state.disconnect(); }}>Sign out</button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="connect" ref={ref}>
      <button className="btn-primary sm" onClick={() => setOpen((o) => !o)} data-testid="connect">{state.kind && state.enabled && !api?.ready && !state.stuck ? "Loading…" : "Connect"}</button>
      {open && (
        <div className="menu">
          {state.stuck && (
            <div className="stuck" role="alert" data-testid="signin-stuck">
              <div>{stuckMessage(state.kind)}</div>
              <button className="btn-primary sm" data-testid="signin-retry" onClick={() => { setOpen(false); state.retry(); }}>Retry</button>
            </div>
          )}
          <div className="menu-head">Sign in to watch markets and request verdicts</div>
          {AVAILABLE.filter((k) => k !== "mera").map((k) => (
            <button key={k} className="menu-item" data-testid={`connect-${k}`} onClick={() => { setOpen(false); state.choose(k); }}>
              <b>Continue with {NAMES[k].name}</b><span>{NAMES[k].sub}</span>
            </button>
          ))}
          {AVAILABLE.includes("mera") && (<>
            <button className="menu-item" data-testid="connect-mera-create" onClick={() => { setOpen(false); state.choose("mera", "create"); }}>
              <b>Create a passkey account</b><span>{NAMES.mera.sub}. One prompt.</span>
            </button>
            <button className="menu-item" data-testid="connect-mera-get" onClick={() => { setOpen(false); state.choose("mera", "pick"); }}>
              <b>Sign in with my passkey</b><span>Same passkey, same account, on any device it syncs to</span>
            </button>
          </>)}
          {api?.error && <div className="menu-sub err">{api.error}</div>}
          <div className="menu-sub">Monad testnet only. Testnet MON has no value.</div>
        </div>
      )}
    </div>
  );
}


export function useWatchlist() {
  const [list, setList] = useState<string[]>(readWatchlist);
  useEffect(() => {
    const h = () => setList(readWatchlist());
    window.addEventListener(WATCH_EVENT, h);
    return () => window.removeEventListener(WATCH_EVENT, h);
  }, []);
  const toggle = (id: string) => { const l = readWatchlist(); writeWatchlist(l.includes(id) ? l.filter((x) => x !== id) : [id, ...l]); };
  return { list, toggle };
}

export type Watch = ReturnType<typeof useWatchlist>;

export function ProviderTag({ kind }: { kind: WalletKind }) {
  return <span className={`ptag ptag-${kind}`} data-testid="provider-tag">{NAMES[kind].name}</span>;
}

const fmtMon = (wei: bigint) => {
  const s = formatEther(wei);
  const [i, d = ""] = s.split(".");
  return d ? `${i}.${d.slice(0, 4).replace(/0+$/, "") || "0"}` : i;
};

function BalanceText({ api }: { api: WalletApi }) {
  if (api.balance === null) return <span className="muted">reading…</span>;
  return <span className={api.balance === 0n ? "err" : "okc"}>{fmtMon(api.balance)} MON</span>;
}

export function SessionText({ endsAt }: { endsAt: number | null }) {
  const [, force] = useState(0);
  useEffect(() => { const id = setInterval(() => force((x) => x + 1), 15_000); return () => clearInterval(id); }, []);
  if (!endsAt) return <div className="menu-sub" data-testid="mera-session">Signing locked. The next signature asks for your passkey once.</div>;
  const min = Math.max(0, Math.ceil((endsAt - Date.now()) / 60_000));
  return <div className="menu-sub okc" data-testid="mera-session">Signing session open: no prompts for about {min} min (10 min idle, 30 min max)</div>;
}

const errText = (e: unknown) => {
  const m = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message ?? "failed";
  if (/rejected|denied|cancel|closed/i.test(m)) return "Cancelled in the wallet.";
  if (/insufficient funds|exceeds the balance/i.test(m)) return "Your wallet needs testnet MON for gas. Use the faucet, then try again.";
  return m.split("\n")[0];
};

export interface Evidence { ok: boolean; sha?: string }

export function WalletActions({ wallet, payload, oc, watch, evidence, title }: { wallet: WalletApi | null; payload: SignedPayload; oc: OnchainResult | null; watch: Watch; evidence: Evidence; title: string }) {
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "ok" | "err"; msg?: string; hash?: string }>({ kind: "idle" });
  const [ack, setAck] = useState<{ kind: "idle" | "busy" | "ok" | "err"; msg?: string; rec?: AckRecord }>({ kind: "idle" });
  if (!AVAILABLE.length) return null;
  const id = String(payload.market_id);
  const watching = watch.list.includes(id);

  if (!wallet?.authenticated || !wallet.address) {
    return (
      <div className="actions-bar muted-bar">
        <span>Sign in to sign a wallet receipt for this check, watch this market, or record a validation request on Monad testnet. A passkey attestation needs no wallet at all.</span>
        <AttestButton payload={payload} oc={oc} evidence={evidence} title={title} />
      </div>
    );
  }
  const account = wallet.address;
  const canRequest = Boolean(oc && oc.claim && !oc.requested);
  const noGas = wallet.balance === 0n;

  const request = async () => {
    if (!oc?.claim) return;
    setStatus({ kind: "busy", msg: `Confirm in your wallet (${wallet.sendVia})…` });
    try {
      const args = [MONAD.validator, 0n, `pm:${id}`, oc.requestHash] as const;
      await client.simulateContract({ address: MONAD.contracts.PredgeAgentValidator, abi: VALIDATOR_ABI, functionName: "validationRequest", args, account });
      const data = encodeFunctionData({ abi: VALIDATOR_ABI, functionName: "validationRequest", args });
      const hash = await wallet.sendTx({ to: MONAD.contracts.PredgeAgentValidator, data });
      setStatus({ kind: "busy", msg: "Waiting for Monad…", hash });
      await client.waitForTransactionReceipt({ hash });
      setStatus({ kind: "ok", msg: `Request recorded on Monad testnet via ${wallet.sendVia}.`, hash });
      wallet.refreshBalance();
    } catch (e) {
      setStatus({ kind: "err", msg: errText(e) });
    }
  };

  const acknowledge = async () => {
    if (!evidence.ok || !evidence.sha) return;
    setAck({ kind: "busy", msg: `Confirm in your wallet (${wallet.signVia})…` });
    try {
      const message = buildReceipt({ marketId: id, riskLevel: String(payload.risk_level), contentSha256: evidence.sha, onchain: oc, checkedAt: payload.checked_at });
      const { signature, check } = await signReceipt(wallet.signTypedData, message, account);
      const rec: AckRecord = { message, signature, signer: account, recovered: check.recovered!, provider: wallet.kind, via: wallet.signVia, signedAt: new Date().toISOString(), title };
      saveAck(rec);
      window.dispatchEvent(new Event(ACKS_EVENT));
      setAck({ kind: "ok", rec });
    } catch (e) {
      setAck({ kind: "err", msg: errText(e) });
    }
  };

  return (
    <div className="actions-bar" data-testid="wallet-actions">
      <div className="actions-left">
        <span className="sm muted">
          <ProviderTag kind={wallet.kind} /> {wallet.walletLabel} · <span className="mono">{account.slice(0, 6)}…{account.slice(-4)}</span> · <BalanceText api={wallet} /> on Monad testnet
          {" "}<button className="linkish" onClick={wallet.refreshBalance} title="Read the balance again">refresh</button>
        </span>
      </div>
      <div className="actions-right">
        <button className="btn-primary sm" disabled={!evidence.ok || !evidence.sha || ack.kind === "busy"} onClick={acknowledge} data-testid="ack" title={evidence.ok ? "" : "Available once the evidence has verified"}>
          {ack.kind === "busy" ? "Signing…" : "Acknowledge risk"}
        </button>
        <AttestButton payload={payload} oc={oc} evidence={evidence} title={title} />
        <button className={`btn-ghost ${watching ? "on" : ""}`} onClick={() => watch.toggle(id)} data-testid="watch">{watching ? "Watching" : "Watch this market"}</button>
        {oc?.claim && (
          <button className="btn-ghost" disabled={!canRequest || status.kind === "busy"} onClick={request} title={canRequest ? "" : "A request for this market already exists on chain"} data-testid="request">
            {oc.requested ? "Already requested on chain" : "Request validation (testnet)"}
          </button>
        )}
      </div>
      {noGas && (
        <p className="sm full-row gas-note" data-testid="no-gas">
          This wallet has 0 testnet MON. Signing a receipt is free; a validation request needs gas. Get testnet MON at the <Ext href={MONAD.faucet}>Monad faucet</Ext> for <span className="mono">{account}</span> <Copy text={account} label="Copy address" />
        </p>
      )}
      {ack.kind === "idle" && evidence.ok && (
        <p className="sm muted full-row">Acknowledge risk signs an EIP-712 receipt (Predge Guard v1, chain {MONAD.chainId}) over this market, its risk level, the SHA-256 of the record verified above, the on-chain verdict and the requestHash. No gas, no transaction. Signed with {wallet.signVia}.</p>
      )}
      {ack.kind === "busy" && <p className="sm muted full-row">{ack.msg}</p>}
      {ack.kind === "err" && <p className="sm err full-row">{ack.msg}</p>}
      {ack.kind === "ok" && ack.rec && <ReceiptView rec={ack.rec} fresh />}
      {canRequest && status.kind === "idle" && (
        <p className="sm muted full-row">Request validation sends validationRequest to PredgeAgentValidator on Monad testnet from your wallet with {wallet.sendVia}, using the same claim the batch uses (requestHash <Hash value={oc!.requestHash} />). Gas is paid in testnet MON (<Ext href={MONAD.faucet}>faucet</Ext>). Predge's validator answers requests in batches; this page does not promise when.</p>
      )}
      {status.kind !== "idle" && (
        <p className={`sm full-row ${status.kind === "err" ? "err" : status.kind === "ok" ? "okc" : "muted"}`} data-testid="request-status">
          {status.msg} {status.hash && <Ext href={tx(status.hash)} className="mono">{status.hash.slice(0, 12)}… ↗</Ext>}
        </p>
      )}
    </div>
  );
}

function ReceiptView({ rec, fresh }: { rec: AckRecord; fresh?: boolean }) {
  const json = JSON.stringify({ domain: { name: "Predge Guard", version: "1", chainId: MONAD.chainId }, primaryType: "RiskAcknowledgement", message: rec.message, signature: rec.signature, signer: rec.signer }, null, 2);
  return (
    <div className={`receipt full-row ${fresh ? "receipt-fresh" : ""}`} data-testid="receipt">
      <div className="receipt-head">
        <span className="badge badge-ok">Signature verified in this browser</span>
        <span className="sm muted">signed with <ProviderTag kind={rec.provider} /> {rec.via}</span>
      </div>
      <div className="receipt-grid">
        <span>Recovered signer</span><span className="mono break" data-testid="receipt-recovered">{rec.recovered}</span>
        <span>Market</span><span>{rec.message.marketId}{rec.title ? ` · ${rec.title}` : ""}</span>
        <span>Risk level</span><span>{rec.message.riskLevel}</span>
        <span>On-chain verdict</span><span>{rec.message.onchainVerdict}</span>
        <span>contentHash</span><span className="mono break">{rec.message.contentHash}</span>
        <span>requestHash</span><span className="mono break">{rec.message.requestHash}</span>
        <span>checkedAt</span><span>{rec.message.checkedAt}</span>
        <span>Signature</span><span className="mono break sig" data-testid="receipt-signature">{rec.signature}</span>
      </div>
      <div className="menu-row">
        <Copy text={rec.signature} label="Copy signature" />
        <Copy text={json} label="Copy receipt JSON" />
      </div>
    </div>
  );
}

/** "My acknowledged checks": receipts kept in this browser only (localStorage). */
export function AckList({ onOpen }: { onOpen: (id: string) => void }) {
  const [list, setList] = useState<AckRecord[]>(loadAcks);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const h = () => setList(loadAcks());
    window.addEventListener(ACKS_EVENT, h);
    window.addEventListener("storage", h);
    return () => { window.removeEventListener(ACKS_EVENT, h); window.removeEventListener("storage", h); };
  }, []);
  if (!list.length) return null;
  return (
    <section className="section" id="acks" data-testid="ack-list">
      <div className="section-head"><span className="eyebrow">My acknowledged checks</span><h2>Receipts you signed</h2>
        <p className="lede">EIP-712 receipts signed with your Privy, Dynamic or Mera account after a check. Kept in this browser, and in your passkey vault once you seal it. Each one re-verifies when you open it.</p>
      </div>
      <div className="ack-list">
        {list.map((a) => (
          <div className="card ack-row" key={a.signature}>
            <div className="ack-top">
              <div>
                <b>Market {a.message.marketId}</b>{a.title ? <span className="muted"> · {a.title}</span> : null}
                <div className="sm muted">risk {a.message.riskLevel} · verdict {a.message.onchainVerdict} · signed {fmtDate(a.signedAt)} with <ProviderTag kind={a.provider} /> by <span className="mono">{a.signer.slice(0, 6)}…{a.signer.slice(-4)}</span></div>
              </div>
              <div className="menu-row">
                <button className="btn-ghost sm" onClick={() => setOpen(open === a.signature ? null : a.signature)}>{open === a.signature ? "Hide" : "Show"}</button>
                <button className="btn-ghost sm" onClick={() => onOpen(a.message.marketId)}>Check again</button>
                <button className="btn-ghost sm" onClick={() => setList(removeAck(a.signature as Hex))}>Remove</button>
              </div>
            </div>
            {open === a.signature && <StoredReceipt rec={a} />}
          </div>
        ))}
      </div>
    </section>
  );
}

function StoredReceipt({ rec }: { rec: AckRecord }) {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    verifyReceipt(rec.message, rec.signature, rec.signer).then((c) => { if (live) setOk(c.ok); });
    return () => { live = false; };
  }, [rec]);
  if (ok === false) return <p className="sm err">This stored receipt no longer verifies against its signer.</p>;
  if (ok === null) return <p className="sm muted">Verifying…</p>;
  return <ReceiptView rec={rec} />;
}
