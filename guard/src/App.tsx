import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { fromBundle, lookupMarket, LookupError, parseMarketInput, type Lookup } from "./lib/api";
import { readCounts } from "./lib/chain";
import { addr, EXAMPLES, MONAD, REPO } from "./lib/constants";
import { BATCH } from "./lib/batch";
import { DEFAULT_MARKET, FAMOUS, famousById } from "./lib/famous";
import { Result } from "./components/Result";
const Explore = lazy(() => import("./components/Explore").then((m) => ({ default: m.Explore })));
import { Fund } from "./components/Fund";
import { AckList, ConnectButton, useWalletState, useWatchlist, WalletHost } from "./components/Wallet";
import { Ext, Shield } from "./components/ui";
import { PasskeyKeys } from "./components/PasskeyKeys";
import { MERA_ONLY } from "./wallet/config";

const initialMarket = () => { try { return new URLSearchParams(location.search).get("m") || DEFAULT_MARKET; } catch { return DEFAULT_MARKET; } };
type View = { kind: "idle" } | { kind: "loading"; id: string } | { kind: "error"; msg: string } | { kind: "ok"; lookup: Lookup };
/** Famous disputes and the bundled batch show at once from the copy shipped with the page. */
const firstView = (): View => {
  const raw = initialMarket();
  const id = parseMarketInput(raw) ?? DEFAULT_MARKET;
  const b = famousById.has(id) ? fromBundle(id) : null;
  return b ? { kind: "ok", lookup: { ...b, instant: true } } : { kind: "loading", id };
};
const sameFacts = (a: Lookup, b: Lookup) => {
  const x = a.payload, y = b.payload;
  return x.risk_level === y.risk_level && x.dispute_count === y.dispute_count && x.open_dispute === y.open_dispute && x.uma_state === y.uma_state
    && x.onchain_resolution?.outcome === y.onchain_resolution?.outcome && x.disputes?.[0]?.disputed_proposal === y.disputes?.[0]?.disputed_proposal;
};

export default function App() {
  const wallet = useWalletState();
  const watch = useWatchlist();
  const [input, setInput] = useState("");
  const [state, setState] = useState<View>(firstView);
  const [counts, setCounts] = useState<{ requests: number; responses: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const run = useCallback(async (raw: string, scroll = true) => {
    const id = parseMarketInput(raw);
    if (!id) { setState({ kind: "error", msg: "Paste a Polymarket link, a market slug or a numeric market id." }); return; }
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    const instant = famousById.has(id) ? fromBundle(id) : null;
    setState(instant ? { kind: "ok", lookup: { ...instant, instant: true } } : { kind: "loading", id });
    try { history.replaceState(null, "", `?m=${encodeURIComponent(id)}`); } catch { /* sandboxed */ }
    if (scroll) setTimeout(() => { const r = resultRef.current?.getBoundingClientRect(); if (r && (r.top > window.innerHeight * 0.7 || r.top < 0)) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 50);
    try {
      const lookup = await lookupMarket(id, ac.signal);
      if (ac.signal.aborted) return;
      // Keep the instant copy on screen when the live record says the same thing, so nothing flickers.
      setState((cur) => (instant && cur.kind === "ok" && cur.lookup.instant && lookup.source === "live" && sameFacts(cur.lookup, lookup) ? cur : { kind: "ok", lookup }));
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      if (instant) { setState({ kind: "ok", lookup: { ...instant, fallbackReason: "The live API could not be reached" } }); return; }
      setState({ kind: "error", msg: e instanceof LookupError ? e.message : `Lookup failed: ${(e as Error).message}` });
    }
  }, []);

  useEffect(() => { run(initialMarket(), false); }, [run]);
  useEffect(() => { readCounts().then(setCounts).catch(() => setCounts(null)); }, []);

  const open = (id: string) => { setInput(""); run(id); };

  return (
    <div className="app">
      <WalletHost kind={wallet.kind} autoLogin={wallet.autoLogin} enabled={wallet.enabled} nonce={wallet.nonce} onChange={wallet.setApi} onFail={wallet.fail} />
      <div className="bg-glow" aria-hidden />
      <header className="nav">
        <a className="brand" href="./"><Shield /> <span>Predge <b>Guard</b></span></a>
        <nav className="nav-links">
          <a href="#check">Check</a>
          <a href="#keys">Passkey</a>
          <a href="#explore">Explore</a>
          <a href="#fund">Fund</a>
          <a href="#about">About</a>
          <Ext href={REPO}>GitHub</Ext>
        </nav>
        <ConnectButton state={wallet} />
      </header>

      <main>
        <section className="hero" id="check">
          <h1>One in three disputed prediction-market answers <span className="hl">does not hold.</span> Predge tells you before you bet.</h1>
          {MERA_ONLY && (
            <div className="mera-banner" data-testid="mera-banner"><span className="ptag ptag-mera">Mera mode</span><span className="muted">Your passkey is the whole account: one prompt to sign in, no seed phrase, no extension, no server holding keys. Clear this browser or open it on another device and the same passkey brings everything back.</span></div>
          )}
          <p className="hero-sub">Markets that settled differently from the disputed answer traded at least <b>$299M</b> in 2026. Tap a famous dispute to see how it ended.</p>

          <div className="famous" role="group" aria-label="Famous disputes">
            {FAMOUS.map((f) => {
              const on = (state.kind === "ok" ? state.lookup.payload.market_id : state.kind === "loading" ? state.id : "") === f.id;
              return (
                <button key={f.id} className={`fcard ${on ? "on" : ""}`} aria-pressed={on} onClick={() => open(f.id)} data-testid={`famous-${f.id}`}>
                  <span className="fcard-top">
                    {f.live ? <span className="live-pill"><span className="live-dot" />LIVE</span> : <span className="fcard-traded">{f.traded} traded</span>}
                    {f.live && <span className="fcard-traded">{f.traded} so far</span>}
                  </span>
                  <span className="fcard-q">{f.question}</span>
                  <span className="fcard-flow"><i>{f.disputed}</i><b aria-hidden>→</b><em className={f.final ? "" : "pend"}>{f.final ?? "vote pending"}</em></span>
                </button>
              );
            })}
          </div>

          <form className="search search-slim" onSubmit={(e) => { e.preventDefault(); run(input); }} role="search">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="or paste any Polymarket link" aria-label="Market" data-testid="search-input" spellCheck={false} autoComplete="off" />
            <button className="btn-ghost sm" type="submit" data-testid="search-go" disabled={state.kind === "loading"}>{state.kind === "loading" ? "Checking…" : "Check"}</button>
          </form>
        </section>

        <div ref={resultRef} className="result-anchor">
          {state.kind === "loading" && <ResultSkeleton id={state.id} />}
          {state.kind === "error" && <div className="error-box" role="alert">{state.msg}</div>}
          {state.kind === "ok" && <Result key={state.lookup.payload.market_id + state.lookup.payload.issued_at} lookup={state.lookup} wallet={wallet.api} watch={watch} />}
        </div>

        <section className="hero-more">
          <div className="stats">
            <Stat big="3,005" label="disputes on 2,666 Polymarket markets" sub="1 Jan to 2 Oct 2026" />
            <Stat big="33.5%" label="settled differently from the disputed proposal" sub="853 of 2,543 settled markets" tone="warn" />
            <Stat big={String(BATCH.verdicts)} label="verdicts on Monad testnet" sub={`${BATCH.transactions} tx in ${BATCH.chainSeconds} s of chain time`} tone="ok" />
            <Stat big="0.0255" unit="MON" label="per on-chain verdict" sub="x402: 0.001 USDC per paid call" />
          </div>
          <div className="chips">
            <span className="chips-label">More</span>
            {EXAMPLES.map((e) => (
              <button key={e.id} className="chip" onClick={() => open(e.id)} data-testid={`chip-${e.id}`}>
                <b>{e.id}</b> <span>{e.label}</span>
              </button>
            ))}
            {watch.list.filter((id) => !EXAMPLES.some((e) => e.id === id)).slice(0, 4).map((id) => (
              <button key={id} className="chip chip-watch" onClick={() => open(id)}><span className="dot ok" /> <b>{id}</b> <span>watching</span></button>
            ))}
          </div>
        </section>

        <AckList onOpen={open} />
        <PasskeyKeys wallet={wallet.api} onOpen={open} />
        <HowItWorks />
        <Suspense fallback={<section className="section" id="explore" style={{ minHeight: 320 }} />}><Explore onOpen={open} /></Suspense>
        <Fund wallet={wallet.api} />

        <section className="section about" id="about">
          <div className="section-head"><span className="eyebrow">About</span><h2>Built for agents that settle against outcomes</h2></div>
          <div className="about-grid">
            <div>
              <p>Predge reads UMA's Optimistic Oracle and Polymarket's UMA adapter on Polygon and publishes a per-market record of disputes, bulletin-board updates and the on-chain resolution, signed with ed25519. On Monad, Predge answers an agent's claim with a 0 to 100 verdict whose responseHash is the keccak256 of that signed record, and can put a slashable bond behind it.</p>
              <p>Who it is for: builders of trading agents, signal bots and protocols that act on or settle against prediction-market outcomes.</p>
            </div>
            <div className="honest">
              <div className="honest-row"><span>Status</span><b>Monad testnet; testnet MON has no value</b></div>
              <div className="honest-row"><span>Revenue</span><b>$0, no paying customers yet</b></div>
              <div className="honest-row"><span>Trust boundary</span><b>Signatures are checked off chain; the chain enforces request before verdict, written once</b></div>
              <div className="honest-row"><span>Not advice</span><b>Records are Predge's reading of public chain facts</b></div>
              <div className="honest-row"><span>Live on chain</span><b>{counts ? `${counts.requests} requests, ${counts.responses} verdicts on the validator` : "reading…"}</b></div>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-grid">
          <div>
            <a className="brand" href="./"><Shield /> <span>Predge <b>Guard</b></span></a>
            <p className="muted sm">Settlement risk for agents that act on prediction-market outcomes.</p>
            <p className="sm"><a href="mailto:hello@predge.io">hello@predge.io</a></p>
          </div>
          <div>
            <div className="footer-h">Contracts on Monad testnet <span className="muted">(Sourcify verified)</span></div>
            {Object.entries(MONAD.contracts).map(([k, v]) => (
              <div className="footer-c" key={k}><span>{k}</span><Ext href={addr(v)} className="mono">{v.slice(0, 8)}…{v.slice(-4)}</Ext></div>
            ))}
          </div>
          <div>
            <div className="footer-h">Resources</div>
            <div className="footer-l"><Ext href={REPO}>Repository</Ext></div>
            <div className="footer-l"><Ext href={`${REPO}#readme`}>Docs</Ext></div>
            <div className="footer-l"><Ext href="https://api.predge.io/.well-known/predge-keys.json">Signing keys</Ext></div>
            <div className="footer-l"><a href="board.html">Verdict board</a></div>
            <div className="footer-l"><Ext href={MONAD.faucet}>Monad testnet faucet</Ext></div>
          </div>
        </div>
        <p className="footer-fine">Testnet only. Testnet MON has no value. Revenue $0, no paying customers yet. Nothing here is financial advice.</p>
      </footer>
    </div>
  );
}

function Stat({ big, unit, label, sub, tone }: { big: string; unit?: string; label: string; sub: string; tone?: "ok" | "warn" }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ""}`}>
      <div className="stat-big">{big}{unit && <span className="stat-unit"> {unit}</span>}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

function ResultSkeleton({ id }: { id: string }) {
  return (
    <section className="result">
      <div className="decision decision-pending"><div className="decision-q">Is it safe to act?</div><div className="decision-head muted">Fetching the signed record for {id}…</div></div>
      <div className="result-grid"><div className="card skel" /><div className="stack"><div className="card skel short" /><div className="card skel short" /></div></div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "1", t: "Signed evidence", b: "A per-market record of disputes and the on-chain resolution on Polygon, signed with ed25519 and free to fetch." },
    { n: "2", t: "A verdict on Monad", b: "Predge answers the agent's claim with 0 to 100. The responseHash is keccak256 of the signed record, written once." },
    { n: "3", t: "Money behind it", b: "A bond can back the verdict. If it contradicts the provider's on-chain commitment, anyone can slash it." },
  ];
  return (
    <section className="section how">
      <div className="how-grid">
        {steps.map((s) => (
          <div className="how-step" key={s.n}><span className="how-n">{s.n}</span><div className="how-t">{s.t}</div><p>{s.b}</p></div>
        ))}
      </div>
    </section>
  );
}
