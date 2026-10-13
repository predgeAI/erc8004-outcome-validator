import { useEffect, useMemo, useState } from "react";
import { DATA } from "../lib/data";
import { readSlashBond, type BondInfo } from "../lib/chain";
import { addr, MONAD, REPO, tx, mtx, maddr, MONAD_MAIN } from "../lib/constants";
import { Copy, Ext, fmtDate, Hash } from "./ui";

type Tab = "mainnet" | "verdicts" | "slash" | "x402" | "agents";

export function Explore({ onOpen }: { onOpen: (id: string) => void }) {
  const [tab, setTab] = useState<Tab>("mainnet");
  const tabs: { id: Tab; label: string; count?: string }[] = [
    { id: "mainnet", label: "Mainnet verdicts", count: String(DATA.mainnet.length) },
    { id: "verdicts", label: "Testnet archive", count: String(DATA.verdicts.length) },
    { id: "slash", label: "Slash demo (testnet)" },
    { id: "x402", label: "Paid calls (x402)", count: String(DATA.x402.length) },
    { id: "agents", label: "Use it from your agent" },
  ];
  return (
    <section className="section" id="explore">
      <div className="section-head">
        <span className="eyebrow">Explore</span>
        <h2>Live on Monad mainnet, and checkable</h2>
      </div>
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}>
            {t.label}{t.count && <span className="tab-count">{t.count}</span>}
          </button>
        ))}
      </div>
      <div className="tab-panel" key={tab}>
        {tab === "mainnet" && <Mainnet onOpen={onOpen} />}
        {tab === "verdicts" && <Verdicts onOpen={onOpen} />}
        {tab === "slash" && <Slash />}
        {tab === "x402" && <X402 />}
        {tab === "agents" && <Agents />}
      </div>
    </section>
  );
}

function Mainnet({ onOpen }: { onOpen: (id: string) => void }) {
  const rows = useMemo(() => [...DATA.mainnet].sort((a, b) => Number(Boolean(b.responseTx)) - Number(Boolean(a.responseTx))), []);
  const done = rows.filter((r) => r.responseTx).length;
  return (
    <div>
      <p className="lede">{done} verdicts and {rows.length - done} open requests on Monad mainnet (chain 143), on real Polymarket disputes. Open requests get their verdict when the vote ends.</p>
      <div className="table-wrap">
        <table className="vt" data-testid="mainnet-table">
          <thead><tr><th>Market</th><th>Disputed proposal</th><th>Final outcome</th><th>Score</th><th>Tx</th></tr></thead>
          <tbody>
            {rows.map((v) => {
              const h = v.responseTx ?? v.requestTx;
              return (
                <tr key={v.market_id} onClick={() => onOpen(v.market_id)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(v.market_id); }}>
                  <td className="vt-q"><span>{v.title || `market ${v.market_id}`}</span><span className="mono dim">{v.market_id}</span></td>
                  <td>{v.proposal}</td>
                  <td>{v.responseTx ? v.outcome : <span className="muted">vote pending</span>}</td>
                  <td>{v.score === null ? <span className="muted">-</span> : <span className={`score s${v.score}`}>{v.score}</span>}</td>
                  <td onClick={(e) => e.stopPropagation()}>{h ? <Hash value={h} href={mtx(h)} n={4} /> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="sm muted">Validator <Hash value={MONAD_MAIN.contracts.PredgeAgentValidator} href={maddr(MONAD_MAIN.contracts.PredgeAgentValidator)} />. Click a row to check it above.</p>
    </div>
  );
}

function Verdicts({ onOpen }: { onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<"all" | "0" | "100">("all");
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return DATA.verdicts.filter((v) => (f === "all" || String(v.score) === f) && (!s || v.title.toLowerCase().includes(s) || v.market_id.includes(s)));
  }, [q, f]);
  const zero = DATA.verdicts.filter((v) => v.score === 0).length;
  const b = DATA.batch;
  return (
    <div>
      <p className="lede"><b>Testnet archive.</b> On {fmtDate(b.ranAt).split(",")[0]}, Predge answered {b.verdicts} agent claims on an evenly spaced sample of disputed Polymarket markets. Each claim says "the final outcome equals the first disputed proposal". Predge answered 100 if it did and 0 if the market settled differently, each bound to a signed record. {b.transactions} transactions, {b.chainSeconds} s of chain time, {Number(b.costMON.perVerdict).toFixed(4)} MON per verdict.</p>
      <div className="table-tools">
        <input className="input sm-input" placeholder="Search by question or market id" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search verdicts" />
        <div className="seg" role="group" aria-label="Filter by verdict">
          <button className={f === "all" ? "on" : ""} onClick={() => setF("all")}>All {DATA.verdicts.length}</button>
          <button className={f === "0" ? "on" : ""} onClick={() => setF("0")} data-testid="filter-0">Verdict 0 · {zero}</button>
          <button className={f === "100" ? "on" : ""} onClick={() => setF("100")}>Verdict 100 · {DATA.verdicts.length - zero}</button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="vt" data-testid="verdicts-table">
          <thead><tr><th>Market</th><th>Disputed proposal</th><th>Final outcome</th><th>Verdict</th><th>Tx</th></tr></thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.market_id} onClick={() => onOpen(v.market_id)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(v.market_id); }}>
                <td className="vt-q"><span>{v.title || `market ${v.market_id}`}</span><span className="mono dim">{v.market_id}</span></td>
                <td>{v.proposal}</td>
                <td>{v.outcome}</td>
                <td><span className={`score s${v.score}`}>{v.score}</span></td>
                <td onClick={(e) => e.stopPropagation()}><Hash value={v.responseTx} href={tx(v.responseTx)} n={4} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="muted pad">No verdict matches.</p>}
      </div>
      <p className="sm muted">Click a row to check it above. The old board that re-verifies all {DATA.verdicts.length} at once is at <a href="board.html">board.html</a>.</p>
    </div>
  );
}

const SLASH_STEPS: Record<string, { title: string; body: string; tone?: string }> = {
  "1": { title: "Client escrows a job", body: "The test: deliver Predge's signed record for market 2169995. The validator is the evaluator." },
  "2": { title: "Validator bonds 0.01 MON", body: "It commits to the hash of the honest record before anything is delivered." },
  "3": { title: "Provider delivers a tampered copy", body: "The outcome is changed to Yes. The hash no longer matches the commitment.", tone: "warn" },
  "4": { title: "Validator says 100 anyway", body: "A dishonest verdict, recorded on chain behind the bond.", tone: "warn" },
  "5": { title: "Anyone challenges", body: "A third party calls challenge() with no arguments to forge. The contract compares the hashes itself.", tone: "ok" },
};

function Slash() {
  const s = DATA.slash;
  const [live, setLive] = useState<BondInfo | null | "err">(null);
  useEffect(() => { readSlashBond().then(setLive).catch(() => setLive("err")); }, []);
  const steps = s.receipts.filter((r) => /^[1-5] /.test(r.step));
  const deploy = s.receipts.find((r) => r.step.startsWith("0 "));
  return (
    <div className="slash">
      <p className="lede"><b>Testnet demo.</b> A verdict with money behind it. If a bonded verdict contradicts what the provider committed on chain, anyone can slash the bond within the dispute window ({s.disputeWindowSeconds / 3600} h, counted from the verdict). Run on {fmtDate(s.ranAt)} with four separate keys.</p>
      <ol className="story">
        {steps.map((r, i) => {
          const k = r.step[0];
          const m = SLASH_STEPS[k];
          return (
            <li key={r.tx} className={`story-step tone-${m?.tone ?? "plain"}`} style={{ animationDelay: `${i * 90}ms` }}>
              <span className="story-n">{k}</span>
              <div>
                <div className="story-title">{m?.title ?? r.step}</div>
                <div className="story-body">{m?.body}</div>
                <div className="story-tx"><Hash value={r.tx} href={tx(r.tx)} /> · block {r.block}</div>
              </div>
            </li>
          );
        })}
        <li className="story-step tone-ok final">
          <span className="story-n">✓</span>
          <div>
            <div className="story-title">Bond slashed to the challenger</div>
            <div className="story-body">{s.result.slashedBond} MON moved to <Hash value={s.parties.challenger} href={addr(s.parties.challenger)} /> in the same transaction.</div>
          </div>
        </li>
      </ol>
      <div className="live-box" data-testid="slash-live">
        <span className="chain-pill"><span className="dot" />live read</span>
        {live === null && <span className="muted">reading the bond on Monad…</span>}
        {live === "err" && <span className="muted">could not read Monad right now</span>}
        {live && live !== "err" && (
          <span>Bond <Hash value={live.contract} href={addr(live.contract)} /> · slashCount <b>{live.slashCount}</b> · stake {live.closed ? "closed" : "open"} · <b>{live.bondMON} MON</b> left · recorded score {live.score}</span>
        )}
      </div>
      {deploy && <p className="sm muted">Demo bond instance deployed in <Ext href={tx(deploy.tx)} className="mono">{deploy.tx.slice(0, 10)}…</Ext>, Sourcify exact match. Production bond: <Hash value={MONAD.contracts.PredgeValidatorBond} href={addr(MONAD.contracts.PredgeValidatorBond)} />.</p>}
    </div>
  );
}

const FUND_TX = "0xece785a6188c7c53aa27268b89e84b34a040296eb79a3a19bd443ab8daaa7caf";

function X402() {
  return (
    <div>
      <p className="lede">An agent pays 0.001 USDC per call through Monad's x402 facilitator (mainnet; the older runs are testnet) (x402 v2, scheme exact). It gets the signed record plus Predge's on-chain verdict and checks both before acting. The agent holds no MON; the facilitator pays gas.</p>
      <div className="runs">
        {[...DATA.x402].sort((a, b) => Number(b.network === "mainnet") - Number(a.network === "mainnet")).map((r) => (
          <div className="run" key={r.file}>
            <div className="run-top"><span className="eyebrow">market {r.market} · {r.network}</span><span className="badge badge-ok">{r.amountUSDC} USDC</span></div>
            <div className="run-big">{(r.latencyMs / 1000).toFixed(1)} s<span> end to end</span></div>
            <ul className="run-list">
              <li>Signature checked: {r.recordSignatureOk ? "yes" : "no"}</li>
              <li>{r.verdict ? <>On-chain verdict {r.verdict.response}, bound to the signed record</> : "Record only (before the verdict was attached)"}</li>
              <li className="mono dim">{r.decision}</li>
            </ul>
            <div className="run-tx">Settlement <Hash value={r.tx} href={r.network === "mainnet" ? mtx(r.tx) : tx(r.tx)} /> · block {r.block}</div>
            {r.network === "mainnet" && <div className="run-tx">Funded from Base via Aurora Intents · delivery <Hash value={FUND_TX} href={mtx(FUND_TX)} /></div>}
          </div>
        ))}
      </div>
    </div>
  );
}

const SDK_SNIPPET = `import { isSafeToAct } from "@predge/settlement-risk";

const d = await isSafeToAct("1137824", { outcome: "Over" });
if (!d.safe) throw new Error(d.reason);
// act: risk resolved within resolved, final outcome Over; on-chain verdict 0 bound to the signed record`;

const MCP_SNIPPET = `{
  "mcpServers": {
    "predge": { "command": "node", "args": ["mcp/server.mjs"] }
  }
}
// tools: settlement_risk, onchain_verdict, is_safe_to_act`;

const CURL_SNIPPET = `curl https://api.predge.io/v1/settlement-risk/1137824
# free, ed25519-signed; verify against
# https://api.predge.io/.well-known/predge-keys.json`;

function Agents() {
  const [t, setT] = useState<"sdk" | "mcp" | "http">("sdk");
  const code = t === "sdk" ? SDK_SNIPPET : t === "mcp" ? MCP_SNIPPET : CURL_SNIPPET;
  return (
    <div className="agents">
      <div>
        <p className="lede">One call before your agent acts. The SDK fetches the signed record, verifies it offline, reads the verdict from Monad, and returns yes or no with a reason it can log. The same check runs on this page.</p>
        <ul className="bullets">
          <li><b>TypeScript SDK</b> <span className="mono">@predge/settlement-risk</span>, in the repo</li>
          <li><b>MCP server</b> for agent frameworks that speak MCP</li>
          <li><b>HTTP</b>: free signed records, or pay per call with x402</li>
        </ul>
        <Ext href={REPO} className="btn-ghost">View the repo ↗</Ext>
      </div>
      <div className="code">
        <div className="code-tabs">
          {(["sdk", "mcp", "http"] as const).map((k) => <button key={k} className={t === k ? "on" : ""} onClick={() => setT(k)}>{k === "sdk" ? "SDK" : k === "mcp" ? "MCP" : "HTTP"}</button>)}
          <span className="grow" />
          <Copy text={code} />
        </div>
        <pre><code>{code}</code></pre>
      </div>
    </div>
  );
}
