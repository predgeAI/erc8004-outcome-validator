import { useEffect, useState } from "react";
import { parseAbi } from "viem";
import type { SignedPayload } from "../lib/api";
import { client, type OnchainResult } from "../lib/chain";
import { mtx } from "../lib/constants";
import { ANDROID_RELEASE, EXPOSURE, isBtcThreshold, KURU, LIVE_DISPUTE, usd, X402_LAST } from "../lib/flow";
import type { WalletKind } from "../wallet/config";
import { AVAILABLE } from "../wallet/config";
import type { useWalletState } from "./Wallet";
import { Ext } from "./ui";
import { quoteNow } from "./Fund";

const BOOK_ABI = parseAbi(["function bestBidAsk() view returns (uint256, uint256)"]);
type Quote = { bid: number; ask: number; live: boolean; at: Date | null };

/** Reads the CHANGE/test-dollar book on Kuru; falls back to the quotes saved at listing time, clearly labelled. */
function useKuruQuote(on: boolean): Quote | null {
  const [q, setQ] = useState<Quote | null>(null);
  useEffect(() => {
    if (!on) return;
    let live = true;
    client.readContract({ address: KURU.book, abi: BOOK_ABI, functionName: "bestBidAsk" })
      .then(([b, a]) => { if (live) setQ({ bid: Number(b) / 1e18, ask: Number(a) / 1e18, live: true, at: new Date() }); })
      .catch(() => { if (live) setQ({ ...KURU.saved, live: false, at: null }); });
    return () => { live = false; };
  }, [on]);
  return q;
}

type Choice = "hedge" | "wait" | null;

export function Flow({ p, title, oc, evidenceOk, verifying, walletState, onOpen }: {
  p: SignedPayload; title: string; oc: OnchainResult | null | undefined; evidenceOk: boolean; verifying: boolean;
  walletState: ReturnType<typeof useWalletState> | null; onOpen: (id: string) => void;
}) {
  const id = String(p.market_id);
  const outcome = p.onchain_resolution?.outcome ?? null;
  const proposal = p.disputes?.[0]?.disputed_proposal ?? null;
  const n = p.disputes?.length ?? 0;
  const final = Boolean(p.resolved_on_chain && outcome);
  const open = !final && (Boolean(p.open_dispute) || n > 0);
  const held = final && proposal && outcome ? proposal === outcome : null;
  const exp = EXPOSURE[id];
  const hasNote = id === KURU.market;
  const btc = isBtcThreshold(title);
  const [choice, setChoice] = useState<Choice>(null);
  const quote = useKuruQuote(choice === "hedge" && hasNote);
  useEffect(() => { setChoice(null); }, [id]);

  const api = walletState?.api ?? null;
  const signedIn = Boolean(api?.authenticated && api.address);
  const recorded = oc?.found && oc.responseTx ? { href: mtxOr(oc, oc.responseTx), label: "Recorded on Monad ↗" } : oc?.requested && oc.requestTx ? { href: mtxOr(oc, oc.requestTx), label: "Request recorded on Monad ↗" } : null;

  return (
    <section className="oneflow" data-testid="flow" aria-label="From check to action">
      <ol className="of-rail" aria-hidden>
        {["Check", "Who's exposed", "Act", "Pay", "Fund", "Sign in"].map((s, i) => <li key={s}><b>{i + 1}</b>{s}</li>)}
      </ol>
      <p className="of-android" data-testid="android-line">Also on Android: the same flow in Predge Settle Watch. <Ext href={ANDROID_RELEASE}>Get the app ↗</Ext></p>

      {/* 1. CHECK */}
      <Step n={1} title="Check" why="Is the answer you are about to bet on final, and did it hold?" testId="step-check">
        <div className="of-line">
          <span className={`of-pill ${verifying ? "" : evidenceOk ? "ok" : "bad"}`}>{verifying ? "Checking…" : evidenceOk ? "✓ Verified" : "Not verified"}</span>
          <span>{final ? (held === false ? `Settled ${outcome}. The disputed answer ${proposal} did not hold.` : held ? `Settled ${outcome}. The disputed answer held.` : `Settled ${outcome}.`) : open ? `Disputed ${n === 1 ? "once" : `${n} times`}${p.sent_to_uma_vote ? ", now in a vote" : ""}. No final answer yet.` : "Not final yet."}</span>
          {recorded && <Ext href={recorded.href} className="of-small">{recorded.label}</Ext>}
        </div>
      </Step>

      {/* 2. WHO IS EXPOSED */}
      <Step n={2} title="Who's exposed" why="Whose money rides on the disputed answer." tag="Nansen" testId="step-exposed">
        {exp ? (
          <>
            <Bars a={{ label: `on ${exp.contested} (disputed)`, v: exp.contestedUsd, n: exp.contestedHolders }} b={{ label: `on ${exp.other}`, v: exp.otherUsd, n: exp.otherHolders }} />
            <p className="of-note">Top 50 holders, money in. Saved Nansen snapshot as of {fmtUtc(exp.asOf)}.</p>
          </>
        ) : (
          <p className="of-muted">
            {final ? "Settled, so the money is already paid out. " : "No holder snapshot for this market yet. "}
            We saved who held what for the live dispute.{id !== LIVE_DISPUTE && <> <button className="linkish" onClick={() => onOpen(LIVE_DISPUTE)} data-testid="go-live">See Trump “Ammunition” →</button></>}
          </p>
        )}
      </Step>

      {/* 3. ACT */}
      <Step n={3} title="Act" why={open ? "Insure your position, or let your agent sit this one out." : "What an agent should do now."} testId="step-act">
        {open ? (
          <>
            <div className="of-choices" role="group" aria-label="Choose an action">
              <button className={`of-choice ${choice === "hedge" ? "on" : ""}`} onClick={() => setChoice("hedge")} data-testid="act-hedge"><b>Hedge</b><span>insure against the answer flipping</span></button>
              <button className={`of-choice ${choice === "wait" ? "on" : ""}`} onClick={() => setChoice("wait")} data-testid="act-wait"><b>Wait</b><span>don't bet until it's final</span></button>
            </div>
            {choice === "wait" && (
              <div className="of-out" data-testid="act-wait-out">
                <div className="of-refuse">Agent guard: <b>bet refused</b></div>
                <p>Reason: {n >= 2 ? "disputed twice, the answer goes to a vote" : "the answer is disputed"}; nothing is final yet. Your agent re-checks and acts once it settles.</p>
                <p className="of-note"><span className="of-tag">MetaMask</span> the same rule runs in the Predge plugin for the MetaMask agent CLI, which refuses to place the order.</p>
              </div>
            )}
            {choice === "hedge" && (
              <div className="of-out" data-testid="act-hedge-out">
                {hasNote ? (
                  <>
                    <div className="of-quote">
                      <div><span className="of-k">Insurance note</span><b>Pays $1 (test) if the final answer is not {proposal?.toUpperCase() ?? "the disputed one"}</b></div>
                      <div><span className="of-k">Price now</span><b data-testid="kuru-ask">{quote ? `$${quote.ask.toFixed(2)}` : "reading…"}</b><span className="of-sub">{quote ? `bid $${quote.bid.toFixed(2)}${quote.live ? " · read live just now" : " · saved quote"}` : ""}</span></div>
                    </div>
                    <p>{quote ? <>Cover $1,000: 1,000 notes at ${quote.ask.toFixed(2)} = <b>${Math.round(1000 * quote.ask)}</b>. If the vote flips the answer, the notes are built to pay $1,000 (test dollars).</> : "Reading the order book…"}</p>
                    <p className="of-note"><span className="of-tag">Kuru</span> listed on Kuru's order book with test dollars; built to settle from Polymarket's final answer (settlement so far only simulated). <Ext href={`${KURU.explorer}/address/${KURU.book}`}>Order book ↗</Ext> · Buying from this page is not wired yet.</p>
                  </>
                ) : btc ? (
                  <p data-testid="act-perpl"><span className="of-tag">Perpl</span><span className="of-tag">Agora AUSD</span> For a Bitcoin price market the risk is the price itself: hedge it with a BTC short on Perpl, margined in Agora's AUSD dollar. The Android app places it after a fingerprint (test network); our bot runs the same hedge in paper mode on Perpl's live prices. <Ext href={ANDROID_RELEASE}>Android app ↗</Ext> · <Ext href="https://github.com/predgeAI/erc8004-outcome-validator/tree/main/perpl">How it works ↗</Ext></p>
                ) : (
                  <p className="of-muted">There is no insurance note for this market yet. One is listed, with test dollars, for the Trump “Ammunition” dispute. <button className="linkish" onClick={() => onOpen(KURU.market)}>Open it →</button></p>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="of-out flat" data-testid="act-final">
            {final ? (
              <p>{held === false ? <>Anyone who acted on <b>{proposal}</b> lost. While it was disputed, the agent guard refused that bet; now the answer is final, so it allows acting on <b>{outcome}</b>.</> : <>The answer is final, so the agent guard allows acting on <b>{outcome}</b>. Nothing is left to hedge.</>}</p>
            ) : <p>Not final yet: the agent guard refuses to bet until it is.</p>}
            <p className="of-note"><span className="of-tag">MetaMask</span> same rule as the Predge plugin for the MetaMask agent CLI.{" "}
              <button className="linkish" onClick={() => onOpen(LIVE_DISPUTE)}>See a live dispute →</button></p>
          </div>
        )}
      </Step>

      {/* 4. PAY */}
      <Step n={4} title="Pay per check" why="Agents pay a tenth of a cent per check, no account, no subscription." tag="x402" testId="step-pay">
        <div className="of-line">
          <span className="of-pill ok">Paid 0.001 USDC</span>
          <span>Last paid check {fmtUtc(X402_LAST.at)}</span>
          <Ext href={mtx(X402_LAST.tx)} className="of-small">Recorded on Monad ↗</Ext>
        </div>
      </Step>

      {/* 5. FUND */}
      <Step n={5} title="Fund from any chain" why="No USDC on Monad? Top up from Base, Arbitrum, Solana and 20+ other chains." tag="Aurora" testId="step-fund">
        <button className="btn-ghost sm" onClick={quoteNow} data-testid="go-fund">Get a live quote ↓</button>
      </Step>

      {/* 6. SIGN IN */}
      <Step n={6} title="Sign in, no seed phrase" why="Email, an existing wallet, or just a passkey." testId="step-signin">
        {signedIn ? (
          <div className="of-line"><span className="of-pill ok">Signed in</span><span>Sign a receipt for this check or watch this market below.</span></div>
        ) : (
          <div className="of-signin">
            {walletState && AVAILABLE.filter((k) => k !== "mera").map((k: WalletKind) => (
              <button key={k} className="btn-ghost sm" onClick={() => walletState.choose(k)} data-testid={`flow-signin-${k}`}>{k === "privy" ? "Email (Privy)" : "Wallet (Dynamic)"}</button>
            ))}
            {walletState && AVAILABLE.includes("mera") ? (
              <button className="btn-ghost sm" onClick={() => walletState.choose("mera", "create")} data-testid="flow-signin-mera">Passkey (Mera)</button>
            ) : <a className="btn-ghost sm" href="mera.html" data-testid="flow-signin-mera">Passkey (Mera)</a>}
          </div>
        )}
      </Step>
    </section>
  );
}

function mtxOr(oc: OnchainResult, h: string) { return oc.network === "mainnet" ? mtx(h) : `https://testnet.monadvision.com/tx/${h}`; }
function fmtUtc(iso: string) { try { const d = new Date(iso); return `${d.getUTCDate()} ${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`; } catch { return iso; } }

function Step({ n, title, why, tag, testId, children }: { n: number; title: string; why: string; tag?: string; testId: string; children: React.ReactNode }) {
  return (
    <div className="of-step" data-testid={testId}>
      <span className="of-n">{n}</span>
      <div className="of-body">
        <div className="of-head"><h3>{title}</h3>{tag && <span className="of-tag">{tag}</span>}</div>
        <p className="of-why">{why}</p>
        {children}
      </div>
    </div>
  );
}

function Bars({ a, b }: { a: { label: string; v: number; n: number }; b: { label: string; v: number; n: number } }) {
  const max = Math.max(a.v, b.v, 1);
  return (
    <div className="of-bars" data-testid="exposure-bars">
      {[a, b].map((x, i) => (
        <div className="of-bar" key={i}>
          <span className="of-bar-v">{usd(x.v)}</span>
          <span className="of-bar-track"><span className={`of-bar-fill ${i ? "alt" : ""}`} style={{ width: `${Math.max(3, (x.v / max) * 100)}%` }} /></span>
          <span className="of-bar-l">{x.label} · {x.n} holders</span>
        </div>
      ))}
    </div>
  );
}

