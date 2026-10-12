import { useCallback, useEffect, useRef, useState } from "react";
import { lookupMarket, LookupError, parseMarketInput, type Lookup } from "./lib/api";
import { readCounts } from "./lib/chain";
import { addr, EXAMPLES, MONAD, REPO } from "./lib/constants";
import { DATA, byMarket } from "./lib/data";
import { Result } from "./components/Result";
import { Explore } from "./components/Explore";
import { ConnectButton, useWalletState, useWatchlist, WalletHost } from "./components/Wallet";
import { Ext, Shield } from "./components/ui";

const initialMarket = () => { try { return new URLSearchParams(location.search).get("m") ?? ""; } catch { return ""; } };

export default function App() {
  const wallet = useWalletState();
  const watch = useWatchlist();
  const [input, setInput] = useState(initialMarket());
  const [state, setState] = useState<{ kind: "idle" } | { kind: "loading"; id: string } | { kind: "error"; msg: string } | { kind: "ok"; lookup: Lookup }>({ kind: "idle" });
  const [counts, setCounts] = useState<{ requests: number; responses: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const run = useCallback(async (raw: string, scroll = true) => {
    const id = parseMarketInput(raw);
    if (!id) { setState({ kind: "error", msg: "Paste a Polymarket link, a market slug or a numeric market id." }); return; }
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setState({ kind: "loading", id });
    try { history.replaceState(null, "", `?m=${encodeURIComponent(id)}`); } catch { /* sandboxed */ }
    if (scroll) setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    try {
      const lookup = await lookupMarket(id, ac.signal);
      if (!ac.signal.aborted) setState({ kind: "ok", lookup });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setState({ kind: "error", msg: e instanceof LookupError ? e.message : `Lookup failed: ${(e as Error).message}` });
    }
  }, []);

  useEffect(() => { const m = initialMarket(); if (m) run(m, false); }, [run]);
  useEffect(() => { readCounts().then(setCounts).catch(() => setCounts(null)); }, []);

  const open = (id: string) => { setInput(id); run(id); };

  return (
    <div className="app">
      <WalletHost kind={wallet.kind} autoLogin={wallet.autoLogin} onChange={wallet.setApi} />
      <div className="bg-glow" aria-hidden />
      <header className="nav">
        <a className="brand" href="./"><Shield /> <span>Predge <b>Guard</b></span></a>
        <nav className="nav-links">
          <a href="#check">Check</a>
          <a href="#explore">Explore</a>
          <a href="#about">About</a>
          <Ext href={REPO}>GitHub</Ext>
        </nav>
        <ConnectButton state={wallet} />
      </header>

      <main>
        <section className="hero" id="check">
          <div className="eyebrow hero-eyebrow"><span className="dot ok" /> Settlement risk for prediction-market agents · live on Monad testnet</div>
          <h1>Know if a prediction-market outcome will hold <span className="hl">before your agent acts.</span></h1>
          <p className="hero-sub">Optimistic oracles get disputed, and disputed proposals often do not hold. Predge Guard shows the signed dispute history of any Polymarket market, Predge's verdict on Monad, and one answer: act or wait. Every check runs in your browser.</p>

          <form className="search" onSubmit={(e) => { e.preventDefault(); run(input); }} role="search">
            <svg className="search-icon" viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Polymarket link, market slug or market id" aria-label="Market" data-testid="search-input" spellCheck={false} autoComplete="off" />
            <button className="btn-primary" type="submit" data-testid="search-go" disabled={state.kind === "loading"}>{state.kind === "loading" ? "Checking…" : "Check market"}</button>
          </form>
          <div className="chips">
            <span className="chips-label">Try</span>
            {EXAMPLES.map((e) => (
              <button key={e.id} className="chip" onClick={() => open(e.id)} data-testid={`chip-${e.id}`}>
                <b>{e.id}</b> <span>{e.id === e.label ? (byMarket.get(e.id)?.title || e.note) : e.label}</span>
              </button>
            ))}
            {watch.list.filter((id) => !EXAMPLES.some((e) => e.id === id)).slice(0, 4).map((id) => (
              <button key={id} className="chip chip-watch" onClick={() => open(id)}><span className="dot ok" /> <b>{id}</b> <span>watching</span></button>
            ))}
          </div>

          <div className="stats">
            <Stat big="3,005" label="disputes on 2,666 Polymarket markets" sub="1 Jan to 2 Oct 2026" />
            <Stat big="33.5%" label="settled differently from the disputed proposal" sub="853 of 2,543 settled markets" tone="warn" />
            <Stat big={String(DATA.batch.verdicts)} label="verdicts on Monad testnet" sub={`${DATA.batch.transactions} tx in ${DATA.batch.chainSeconds} s of chain time`} tone="ok" />
            <Stat big="0.0255" unit="MON" label="per on-chain verdict" sub="x402: 0.001 USDC per paid call" />
          </div>
        </section>

        <div ref={resultRef} className="result-anchor">
          {state.kind === "loading" && <ResultSkeleton id={state.id} />}
          {state.kind === "error" && <div className="error-box" role="alert">{state.msg}</div>}
          {state.kind === "ok" && <Result key={state.lookup.payload.market_id + state.lookup.payload.issued_at} lookup={state.lookup} wallet={wallet.api} watch={watch} />}
        </div>

        <HowItWorks />
        <Explore onOpen={open} />

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
