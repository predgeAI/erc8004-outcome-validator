import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AVAILABLE, type WalletApi, type WalletKind } from "../wallet/config";
import type { SignedPayload } from "../lib/api";
import { client, VALIDATOR_ABI, type OnchainResult } from "../lib/chain";
import { addr, MONAD, tx } from "../lib/constants";
import { Ext, Hash } from "./ui";

const PrivyHost = lazy(() => import("../wallet/PrivyHost"));
const DynamicHost = lazy(() => import("../wallet/DynamicHost"));

const KIND_KEY = "guard.wallet.kind";
const WATCH_KEY = "guard.watchlist";
const safeGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage blocked */ } };

/** Mounts only the provider the user picked, so neither SDK loads until it is needed. */
export function WalletHost({ kind, autoLogin, onChange }: { kind: WalletKind | null; autoLogin: boolean; onChange: (w: WalletApi | null) => void }) {
  if (!kind) return null;
  return (
    <Suspense fallback={null}>
      {kind === "privy" ? <PrivyHost onChange={onChange} autoLogin={autoLogin} /> : <DynamicHost onChange={onChange} autoLogin={autoLogin} />}
    </Suspense>
  );
}

export function useWalletState() {
  const saved = safeGet(KIND_KEY) as WalletKind | null;
  const [kind, setKind] = useState<WalletKind | null>(saved && AVAILABLE.includes(saved) ? saved : null);
  const [autoLogin, setAutoLogin] = useState(false);
  const [api, setApi] = useState<WalletApi | null>(null);
  const choose = (k: WalletKind) => {
    if (kind === k && api?.ready) { api.login(); return; }
    setApi(null); setAutoLogin(true); setKind(k); safeSet(KIND_KEY, k);
  };
  const disconnect = async () => {
    try { await api?.logout(); } catch { /* ignore */ }
    setApi(null); setKind(null); setAutoLogin(false); safeSet(KIND_KEY, null);
  };
  return { kind, autoLogin, api, setApi, choose, disconnect };
}

const NAMES: Record<WalletKind, { name: string; sub: string }> = {
  privy: { name: "Privy", sub: "Email or wallet, embedded wallet if you have none" },
  dynamic: { name: "Dynamic", sub: "Wallet or email via Dynamic" },
};

export function ConnectButton({ state }: { state: ReturnType<typeof useWalletState> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  if (!AVAILABLE.length) return null;
  const { api } = state;
  if (api?.authenticated && api.address) {
    return (
      <div className="connect" ref={ref}>
        <button className="btn-ghost addr-btn" onClick={() => setOpen((o) => !o)} data-testid="wallet-address">
          <span className="dot ok" /> <span className="mono">{api.address.slice(0, 6)}…{api.address.slice(-4)}</span>
        </button>
        {open && (
          <div className="menu">
            <div className="menu-head">Signed in with {NAMES[api.kind].name}</div>
            <div className="menu-addr mono">{api.address}</div>
            <div className="menu-sub">{api.walletLabel} · Monad testnet (chain {MONAD.chainId})</div>
            <div className="menu-row">
              <Ext href={addr(api.address)} className="btn-ghost sm">MonadVision ↗</Ext>
              <Ext href={MONAD.faucet} className="btn-ghost sm">Testnet faucet ↗</Ext>
            </div>
            <button className="btn-ghost sm full" onClick={() => { setOpen(false); state.disconnect(); }}>Sign out</button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="connect" ref={ref}>
      <button className="btn-primary sm" onClick={() => setOpen((o) => !o)} data-testid="connect">{state.kind && !api?.ready ? "Loading…" : "Connect"}</button>
      {open && (
        <div className="menu">
          <div className="menu-head">Sign in to watch markets and request verdicts</div>
          {AVAILABLE.map((k) => (
            <button key={k} className="menu-item" data-testid={`connect-${k}`} onClick={() => { setOpen(false); state.choose(k); }}>
              <b>Continue with {NAMES[k].name}</b><span>{NAMES[k].sub}</span>
            </button>
          ))}
          <div className="menu-sub">Monad testnet only. Testnet MON has no value.</div>
        </div>
      )}
    </div>
  );
}

export function useWatchlist() {
  const read = (): string[] => { try { return JSON.parse(safeGet(WATCH_KEY) || "[]"); } catch { return []; } };
  const [list, setList] = useState<string[]>(read);
  const toggle = (id: string) => setList((l) => { const n = l.includes(id) ? l.filter((x) => x !== id) : [id, ...l].slice(0, 50); safeSet(WATCH_KEY, JSON.stringify(n)); return n; });
  return { list, toggle };
}

export type Watch = ReturnType<typeof useWatchlist>;

export function WalletActions({ wallet, payload, oc, watch }: { wallet: WalletApi | null; payload: SignedPayload; oc: OnchainResult | null; watch: Watch }) {
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "ok" | "err"; msg?: string; hash?: string }>({ kind: "idle" });
  if (!AVAILABLE.length) return null;
  const id = String(payload.market_id);
  const watching = watch.list.includes(id);

  if (!wallet?.authenticated || !wallet.address) {
    return (
      <div className="actions-bar muted-bar">
        <span>Sign in to watch this market or record a validation request on Monad testnet from your own wallet.</span>
      </div>
    );
  }
  const canRequest = Boolean(oc && oc.claim && !oc.requested);
  const request = async () => {
    if (!oc?.claim) return;
    setStatus({ kind: "busy", msg: "Confirm in your wallet…" });
    try {
      const wc = await wallet.getWalletClient();
      const account = wallet.address!;
      const args = [MONAD.validator, 0n, `pm:${id}`, oc.requestHash] as const;
      await client.simulateContract({ address: MONAD.contracts.PredgeAgentValidator, abi: VALIDATOR_ABI, functionName: "validationRequest", args, account });
      const hash = await wc.writeContract({ address: MONAD.contracts.PredgeAgentValidator, abi: VALIDATOR_ABI, functionName: "validationRequest", args, account, chain: wc.chain });
      setStatus({ kind: "busy", msg: "Waiting for Monad…", hash });
      await client.waitForTransactionReceipt({ hash });
      setStatus({ kind: "ok", msg: "Request recorded on Monad testnet.", hash });
    } catch (e) {
      const m = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message ?? "failed";
      setStatus({ kind: "err", msg: /insufficient funds|exceeds the balance/i.test(m) ? "Your wallet needs testnet MON for gas. Use the faucet, then try again." : m.split("\n")[0] });
    }
  };

  return (
    <div className="actions-bar" data-testid="wallet-actions">
      <div className="actions-left">
        <span className="sm muted">Signed in · <span className="mono">{wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}</span> on Monad testnet</span>
      </div>
      <div className="actions-right">
        <button className={`btn-ghost ${watching ? "on" : ""}`} onClick={() => watch.toggle(id)} data-testid="watch">{watching ? "Watching" : "Watch this market"}</button>
        {oc?.claim && (
          <button className="btn-ghost" disabled={!canRequest || status.kind === "busy"} onClick={request} title={canRequest ? "" : "A request for this market already exists on chain"} data-testid="request">
            {oc.requested ? "Already requested on chain" : "Request validation (testnet)"}
          </button>
        )}
      </div>
      {canRequest && status.kind === "idle" && (
        <p className="sm muted full-row">Sends validationRequest to PredgeAgentValidator on Monad testnet from your wallet, with the same claim the batch uses (requestHash <Hash value={oc!.requestHash} />). Gas is paid in testnet MON (<Ext href={MONAD.faucet}>faucet</Ext>). Predge's validator answers requests in batches; this page does not promise when.</p>
      )}
      {status.kind !== "idle" && (
        <p className={`sm full-row ${status.kind === "err" ? "err" : status.kind === "ok" ? "okc" : "muted"}`}>
          {status.msg} {status.hash && <Ext href={tx(status.hash)} className="mono">{status.hash.slice(0, 12)}… ↗</Ext>}
        </p>
      )}
    </div>
  );
}
