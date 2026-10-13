import { useEffect, useRef, useState } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { INTENTS_BACKEND, MONAD_MAINNET, ORIGINS, monadUsdc, requestQuote, submitDeposit, swapStatus, type Quote, type StatusResp } from "../lib/intents";
import type { WalletApi } from "../wallet/config";
import { CheckRow, Copy, Ext, type CheckState } from "./ui";

const LS = "predge.fund.deposit";
interface Pending { depositAddress: string; recipient: Address; from: string; amountIn: string; out: string; deadline?: string }
const load = (): Pending | null => { try { return JSON.parse(localStorage.getItem(LS) || "null"); } catch { return null; } };
const save = (p: Pending | null) => { try { if (p) localStorage.setItem(LS, JSON.stringify(p)); else localStorage.removeItem(LS); } catch { /* storage blocked */ } };

const ORDER = ["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS"];

/** Fund a Predge agent on Monad mainnet from any chain, then spend the USDC on an x402-paid check. */
export function Fund({ wallet }: { wallet: WalletApi | null }) {
  const [recipient, setRecipient] = useState("");
  const [from, setFrom] = useState("base");
  const [amount, setAmount] = useState("2");
  const [refund, setRefund] = useState("");
  const [busy, setBusy] = useState<"" | "quote" | "deposit">("");
  const [err, setErr] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [pending, setPending] = useState<Pending | null>(load());
  const [track, setTrack] = useState("");
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [bal, setBal] = useState<string | null>(null);
  const [txHash, setTxHash] = useState("");
  const timer = useRef<number | null>(null);

  useEffect(() => { if (!recipient && wallet?.address) setRecipient(wallet.address); }, [wallet?.address, recipient]);
  const evm = ORIGINS.find((o) => o.id === from)?.evm ?? true;
  const refundTo = refund || (evm ? recipient : "");
  const recipientOk = isAddress(recipient);

  const ask = async (dry: boolean) => {
    setErr("");
    if (!recipientOk) { setErr("Enter the Monad address that should receive the USDC."); return; }
    if (!refundTo) { setErr("Enter a refund address on the origin chain."); return; }
    if (!(Number(amount) > 0)) { setErr("Enter an amount."); return; }
    setBusy(dry ? "quote" : "deposit");
    try {
      const r = await requestQuote({ from, amount, recipient: getAddress(recipient), refundTo, dry });
      setQuote(r.quote);
      if (!dry) {
        if (!r.quote.depositAddress) throw new Error("No deposit address came back.");
        const p = { depositAddress: r.quote.depositAddress, recipient: getAddress(recipient), from, amountIn: r.quote.amountInFormatted, out: r.quote.amountOutFormatted, deadline: r.quote.deadline };
        setPending(p); save(p); setStatus(null); setBal(null);
      }
    } catch (e) { setErr((e as Error).message); } finally { setBusy(""); }
  };

  // Poll the swap until it is terminal; then read the recipient's USDC on Monad.
  useEffect(() => {
    if (!pending) return;
    let stop = false;
    const tick = async () => {
      try {
        const s = await swapStatus(pending.depositAddress);
        if (stop) return;
        setStatus(s);
        if (s.status === "SUCCESS") { setBal(await monadUsdc(pending.recipient)); return; }
        if (s.status === "REFUNDED" || s.status === "FAILED") return;
      } catch (e) { if (!stop) setErr(`Status: ${(e as Error).message}`); }
      if (!stop) timer.current = window.setTimeout(tick, 5000);
    };
    tick();
    return () => { stop = true; if (timer.current) clearTimeout(timer.current); };
  }, [pending]);

  const startTracking = () => {
    const a = track.trim();
    if (!a) return;
    setErr("");
    swapStatus(a).then((s) => {
      const qr = (s as unknown as { quoteResponse?: { quoteRequest?: { recipient?: string }; quote?: Quote } }).quoteResponse;
      const rcp = qr?.quoteRequest?.recipient;
      const p: Pending = { depositAddress: a, recipient: (rcp && isAddress(rcp) ? getAddress(rcp) : (recipient as Address)), from: "?", amountIn: qr?.quote?.amountInFormatted ?? "?", out: qr?.quote?.amountOutFormatted ?? "?" };
      setPending(p); save(p); setStatus(s);
    }).catch((e) => setErr(`That deposit address is not known to the intents network: ${(e as Error).message}`));
  };

  const idx = status ? ORDER.indexOf(status.status) : -1;
  const st = (i: number): CheckState => {
    if (!status) return "idle";
    if (status.status === "REFUNDED" || status.status === "FAILED" || status.status === "INCOMPLETE_DEPOSIT") return i <= 1 ? "ok" : "fail";
    return idx > i || status.status === "SUCCESS" ? "ok" : idx === i ? "running" : "na";
  };
  const d = status?.swapDetails;
  const monadTx = d?.destinationChainTxHashes?.[0];
  const originTx = d?.originChainTxHashes?.[0];
  const origin = ORIGINS.find((o) => o.id === (pending?.from ?? from))?.label ?? pending?.from;

  return (
    <section className="section fund" id="fund">
      <div className="section-head">
        <span className="eyebrow">Fund from any chain</span>
        <h2>Pay for Predge on Monad with USDC from Base, Arbitrum, Solana or 20+ other chains</h2>
        <p className="muted">Your agent does not need a Monad balance or a bridge. Aurora Intents (powered by NEAR Intents) gives you a one-time deposit address on the chain you already use; solvers deliver native USDC on Monad mainnet to your agent in under a minute. That USDC then pays for Predge checks over x402, gasless: the agent never holds MON.</p>
      </div>

      <div className="fund-grid">
        <div className="card">
          <div className="card-top"><b>1. Quote</b><span className="chain-pill">via {INTENTS_BACKEND}</span></div>
          <label className="fund-l">Agent address on Monad (receives USDC)
            <input className="fund-i mono" value={recipient} onChange={(e) => setRecipient(e.target.value.trim())} placeholder="0x…" spellCheck={false} data-testid="fund-recipient" />
          </label>
          <div className="fund-row">
            <label className="fund-l">From
              <select className="fund-i" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="fund-from">
                {ORIGINS.map((o) => <option key={o.id} value={o.id}>USDC on {o.label}</option>)}
              </select>
            </label>
            <label className="fund-l">Amount (USDC)
              <input className="fund-i" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" data-testid="fund-amount" />
            </label>
          </div>
          <label className="fund-l">Refund address on {ORIGINS.find((o) => o.id === from)?.label} {evm && <span className="dim">(defaults to the agent address)</span>}
            <input className="fund-i mono" value={refund} onChange={(e) => setRefund(e.target.value.trim())} placeholder={evm ? recipient || "0x…" : "Solana address"} spellCheck={false} />
          </label>
          <div className="fund-actions">
            <button className="btn-ghost" onClick={() => ask(true)} disabled={!!busy} data-testid="fund-quote">{busy === "quote" ? "Quoting…" : "Get quote"}</button>
            <button className="btn-primary" onClick={() => ask(false)} disabled={!!busy || !quote} data-testid="fund-deposit">{busy === "deposit" ? "Requesting…" : "Get deposit address"}</button>
          </div>
          {quote && (
            <div className="fund-quote" data-testid="fund-quote-out">
              <div><span className="muted">You send</span> <b>{quote.amountInFormatted} USDC</b> <span className="muted">on {ORIGINS.find((o) => o.id === from)?.label}</span></div>
              <div><span className="muted">Agent receives</span> <b>{quote.amountOutFormatted} USDC</b> <span className="muted">on Monad (at least {(Number(quote.minAmountOut) / 1e6).toFixed(6)})</span></div>
              <div className="muted sm">About {quote.timeEstimate ?? "?"} s. A deposit address is issued only when you ask for one; nothing moves until you send.</div>
            </div>
          )}
          {err && <div className="error-box" role="alert">{err}</div>}
          <details className="fund-track">
            <summary className="muted sm">Track a deposit address made elsewhere (CLI: node aurora/fund.mjs deposit)</summary>
            <div className="fund-row"><input className="fund-i mono" value={track} onChange={(e) => setTrack(e.target.value)} placeholder="deposit address" spellCheck={false} /><button className="btn-ghost" onClick={startTracking}>Track</button></div>
          </details>
        </div>

        <div className="card">
          <div className="card-top"><b>2. Deposit and delivery</b>{pending && <button className="btn-ghost sm" onClick={() => { setPending(null); save(null); setStatus(null); setBal(null); }}>Clear</button>}</div>
          {!pending ? <p className="muted">Get a quote, then a deposit address. The status of the swap shows here.</p> : (
            <>
              <div className="fund-dep">
                <div className="muted sm">Send exactly <b>{pending.amountIn} USDC</b> on {origin} to</div>
                <div className="mono fund-addr" data-testid="fund-deposit-address">{pending.depositAddress}</div>
                <Copy text={pending.depositAddress} label="Copy deposit address" />
                {pending.deadline && <div className="dim sm">Quote valid until {new Date(pending.deadline).toLocaleString()}</div>}
              </div>
              <ul className="checks">
                <CheckRow state={st(0)} title={`Deposit on ${origin}`} detail={originTx ? <Ext href={originTx.explorerUrl || "#"} className="mono">{originTx.hash.slice(0, 12)}…</Ext> : "waiting for your transfer"} />
                <CheckRow state={st(1)} title="Solvers fill the intent" detail={status?.status === "PROCESSING" ? "processing" : status?.status ?? "…"} />
                <CheckRow state={st(2)} title="USDC delivered on Monad" testId="fund-delivered" detail={monadTx ? <Ext href={monadTx.explorerUrl || `${MONAD_MAINNET.explorer}/tx/${monadTx.hash}`} className="mono">{monadTx.hash.slice(0, 12)}…</Ext> : d?.refundReason ? `refunded: ${d.refundReason}` : "not yet"} />
                <CheckRow state={bal !== null ? "ok" : "na"} title="Agent balance on Monad" detail={bal !== null ? <><b>{bal} USDC</b> at <Ext href={`${MONAD_MAINNET.explorer}/address/${pending.recipient}`} className="mono">{pending.recipient.slice(0, 8)}…{pending.recipient.slice(-4)}</Ext></> : "read after delivery"} />
              </ul>
              {status?.status === "PENDING_DEPOSIT" && (
                <div className="fund-row">
                  <input className="fund-i mono" value={txHash} onChange={(e) => setTxHash(e.target.value.trim())} placeholder="origin tx hash (optional, speeds up detection)" spellCheck={false} />
                  <button className="btn-ghost" onClick={() => submitDeposit(pending.depositAddress, txHash).then(() => setErr("")).catch((e) => setErr((e as Error).message))} disabled={!txHash}>Submit</button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="card">
          <div className="card-top"><b>3. Use it on Monad</b></div>
          <p className="muted">The agent pays 0.001 USDC per Predge check over x402 on Monad mainnet (network eip155:143, Monad's facilitator settles the EIP-3009 transfer and pays the gas). It gets the ed25519-signed settlement-risk record and, where Predge has one, the verdict it wrote on chain, then decides act or wait.</p>
          <pre className="fund-pre">{`MONAD_NETWORK=mainnet PAY_TO=<treasury> node monad/x402/server.mjs
MONAD_NETWORK=mainnet node monad/x402/agent.mjs 5532382`}</pre>
          <p className="dim sm">{bal !== null && Number(bal) >= 0.001 ? `Funded: ${bal} USDC covers ${Math.floor(Number(bal) / 0.001)} checks.` : "Each check costs 0.001 USDC; 2 USDC covers about 1,990 checks."}</p>
        </div>
      </div>
    </section>
  );
}
