import { useEffect, useMemo, useState } from "react";
import type { Lookup, SignedPayload } from "../lib/api";
import { checkKey } from "../lib/api";
import { readOnchain, type OnchainResult } from "../lib/chain";
import { addr, MONAD, polyTx, tx } from "../lib/constants";
import { decide, RISK_LABEL } from "../lib/decide";
import { roundTrips, sha256Hex, verifyEd25519 } from "../lib/verify";
import { CheckIcon, CheckRow, Ext, fmtDate, Hash, type CheckState } from "./ui";
import { famousById } from "../lib/famous";
import type { WalletApi } from "../wallet/config";
import { WalletActions, type Watch } from "./Wallet";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Ev { key: CheckState; sig: CheckState; hash: CheckState; fields: CheckState; engine?: string; kid?: string; keySrc?: string; sha?: string; published?: string }

export function Result({ lookup, wallet, watch }: { lookup: Lookup; wallet: WalletApi | null; watch: Watch }) {
  const p = lookup.payload;
  const [ev, setEv] = useState<Ev>({ key: "running", sig: "idle", hash: "idle", fields: "idle" });
  const [oc, setOc] = useState<OnchainResult | null | undefined>(undefined);
  const [ocErr, setOcErr] = useState<string | null>(null);
  const [ocStep, setOcStep] = useState(0);

  useEffect(() => {
    let live = true;
    setEv({ key: "running", sig: "idle", hash: "idle", fields: "idle" });
    setOc(undefined); setOcErr(null); setOcStep(0);
    const rec = lookup.record;
    (async () => {
      const t0 = Date.now();
      const k = await checkKey(rec);
      await sleep(Math.max(0, 450 - (Date.now() - t0)));
      if (!live) return;
      setEv((e) => ({ ...e, key: k.ok ? "ok" : "fail", kid: k.kid, keySrc: k.servedBy, sig: "running" }));
      const s = await verifyEd25519(rec);
      await sleep(420);
      if (!live) return;
      setEv((e) => ({ ...e, sig: s.ok ? "ok" : "fail", engine: s.engine, hash: "running" }));
      const sha = await sha256Hex(rec.canonical);
      await sleep(420);
      if (!live) return;
      const hashState: CheckState = rec.content_hash ? (rec.content_hash === sha ? "ok" : "fail") : "na";
      setEv((e) => ({ ...e, hash: hashState, sha, published: rec.content_hash, fields: "running" }));
      await sleep(360);
      if (!live) return;
      setEv((e) => ({ ...e, fields: roundTrips(rec.canonical) ? "ok" : "fail" }));
    })();
    (async () => {
      try {
        const r = await readOnchain(p);
        if (!live) return;
        setOc(r);
        for (let i = 1; i <= 4; i++) { await sleep(380); if (!live) return; setOcStep(i); }
      } catch (e) {
        if (live) { setOcErr((e as Error).message.split("\n")[0]); setOc(null); }
      }
    })();
    return () => { live = false; };
  }, [lookup, p]);

  const evidenceDone = [ev.key, ev.sig, ev.hash, ev.fields].every((s) => s === "ok" || s === "fail" || s === "na");
  const evidenceOk = ev.key === "ok" && ev.sig === "ok" && ev.hash !== "fail" && ev.fields === "ok";
  const decision = useMemo(() => (evidenceDone && oc !== undefined && (oc === null || ocStep >= 4) ? decide(p, evidenceOk, oc) : null), [evidenceDone, evidenceOk, oc, ocStep, p]);

  const title = lookup.market?.question || `Polymarket market ${p.market_id}`;
  const risk = RISK_LABEL[String(p.risk_level)] ?? { label: String(p.risk_level), tone: "warn" as const };
  const proposal = p.disputes?.[0]?.disputed_proposal ?? null;
  const outcome = p.onchain_resolution?.outcome ?? null;

  const n = p.disputes?.length ?? 0;
  const verdict = storyVerdict(p, evidenceDone && !evidenceOk);
  const fam = famousById.get(String(p.market_id));
  const verifyDone = evidenceDone;

  return (
    <section className="result" aria-live="polite">
      {lookup.source === "bundled" && lookup.fallbackReason && (
        <p className="fallback-note">{lookup.fallbackReason}. Showing the record signed on {fmtDate(p.issued_at)}, bundled with this page and verified the same way.</p>
      )}

      <div className={`story-card story-${verdict.tone}`}>
        <div className="card-top">
          <span className="eyebrow">Polymarket · market {p.market_id}{fam ? ` · ${fam.traded} traded` : ""}</span>
          <span className={`badge badge-${risk.tone}`}>Risk: {risk.label}</span>
        </div>
        <h2 className="market-title">{title}</h2>

        <ol className="flow" aria-label="How the answer changed">
          <li className="flow-step">
            <span className="flow-k">Proposed answer</span>
            <span className={`flow-v ${proposal && outcome && proposal !== outcome ? "struck" : ""}`}>{proposal ?? "none"}</span>
          </li>
          <li className="flow-arrow" aria-hidden>→</li>
          <li className="flow-step warn">
            <span className="flow-k">Disputed</span>
            <span className="flow-v">{n ? (n === 1 ? "once" : `${n} times`) : "never"}</span>
            {p.sent_to_uma_vote && <span className="flow-s">UMA vote</span>}
          </li>
          <li className="flow-arrow" aria-hidden>→</li>
          <li className={`flow-step ${outcome ? "fin" : "pend"}`}>
            <span className="flow-k">Final</span>
            <span className="flow-v">{outcome ?? "not yet"}</span>
          </li>
        </ol>

        <div className={`verdict-big verdict-${verdict.tone}`} data-testid="verdict-big">
          <div className="verdict-head">{verdict.head}</div>
          <div className="verdict-sub">{verdict.sub}</div>
        </div>

        <div className="proof-lines">
          <details className={`proof proof-${!verifyDone ? "run" : evidenceOk ? "ok" : "bad"}`} data-testid="verify-line">
            <summary>
              <CheckIcon state={!verifyDone ? "running" : evidenceOk ? "ok" : "fail"} />
              <span>{!verifyDone ? "Verifying on your device…" : evidenceOk ? "Verified on your device: signature, hash and signing key all match" : "Could not verify this record on your device"}</span>
              <span className="proof-more">details</span>
            </summary>
            <ul className="checks">
              <CheckRow testId="chk-key" state={ev.key} title="Signed by Predge's published key"
                detail={ev.kid ? <>kid <span className="mono">{ev.kid}</span>{ev.keySrc === "well-known" ? <> matches <Ext href="https://api.predge.io/.well-known/predge-keys.json">predge-keys.json</Ext> and the pinned key</> : " matches the pinned key"}</> : "Fetching the key registry"} />
              <CheckRow testId="chk-sig" state={ev.sig} title="Ed25519 signature is valid"
                detail={ev.engine ? <>over the exact record bytes, checked with {ev.engine}</> : "Waiting"} />
              <CheckRow testId="chk-hash" state={ev.hash} title="SHA-256 content hash matches"
                detail={ev.sha ? (ev.published ? <><span className="mono">{ev.sha.slice(0, 16)}…</span> equals the published content_hash</> : <>archived record carries no content_hash; computed <span className="mono">{ev.sha.slice(0, 16)}…</span></>) : "Waiting"} />
              <CheckRow testId="chk-fields" state={ev.fields} title="Everything on this page comes from the signed bytes" detail="Parsed and re-canonicalised: identical bytes" />
            </ul>
          </details>

          <details className="proof proof-chain" data-testid="chain-line">
            <summary>
              <span className="chain-pill"><span className="dot" />Monad</span>
              <span>{chainLine(oc, ocErr)}</span>
              {oc?.found && oc.responseTx ? <Ext href={tx(oc.responseTx)} className="proof-link">Explorer ↗</Ext> : <Ext href={addr(MONAD.contracts.PredgeAgentValidator)} className="proof-link">Validator ↗</Ext>}
              <span className="proof-more">details</span>
            </summary>
            <OnchainCard oc={oc} err={ocErr} step={ocStep} p={p} />
          </details>
        </div>
      </div>

      <details className="more-details">
        <summary>Dispute timeline and the agent decision</summary>
        <div className={`decision decision-${decision?.tone ?? "pending"}`} data-testid="decision">
          <div className="decision-q">Is it safe to act?</div>
          {decision ? (
            <>
              <div className="decision-head">{decision.headline}</div>
              <div className="decision-detail">{decision.detail}</div>
              <code className="decision-line mono">{decision.line}</code>
            </>
          ) : (
            <div className="decision-head muted">Checking evidence and the chain…</div>
          )}
        </div>
        <article className="card">
          <p className="rec">{p.recommendation}</p>
          <Timeline p={p} endDate={lookup.market?.end_date ?? undefined} />
        </article>
      </details>

      <WalletActions wallet={wallet} payload={p} oc={oc ?? null} watch={watch} evidence={{ ok: evidenceDone && evidenceOk, sha: ev.sha }} title={title} />
    </section>
  );
}

type Tone = "go" | "stop" | "wait";
/** The plain-words verdict, read only from the signed facts. */
function storyVerdict(p: SignedPayload, evidenceFailed: boolean): { tone: Tone; head: string; sub: string } {
  if (evidenceFailed) return { tone: "stop", head: "Do not trust this record", sub: "Its signature or hash did not verify in this browser." };
  const proposal = p.disputes?.[0]?.disputed_proposal ?? null;
  const outcome = p.onchain_resolution?.outcome ?? null;
  const n = p.disputes?.length ?? 0;
  if (p.resolved_on_chain && outcome) {
    if (!n) return { tone: "go", head: `Never disputed. Final: ${outcome}`, sub: "No one challenged the proposed answer." };
    if (proposal && proposal !== outcome) return { tone: "stop", head: "This answer did NOT hold", sub: `The disputed answer was ${proposal.toUpperCase()}. The market finally settled ${outcome.toUpperCase()}.` };
    if (proposal) return { tone: "go", head: "This answer held", sub: `Disputed, but the final answer is the same: ${outcome.toUpperCase()}.` };
    return { tone: "go", head: `Final: ${outcome}`, sub: "The outcome is final on chain." };
  }
  if (p.open_dispute || n) return { tone: "wait", head: "Still disputed: wait", sub: "There is no final answer yet. Acting now means betting on the vote." };
  return { tone: "wait", head: "Not final yet: wait", sub: "The market has no final on-chain answer." };
}

function chainLine(oc: OnchainResult | null | undefined, err: string | null): string {
  if (oc === undefined) return "Reading Predge's verdict on Monad…";
  if (oc === null) return err ? "Could not read Monad right now" : "No claim to answer on chain for this market";
  if (!oc.found) return oc.requested ? "Verdict requested on Monad, not answered yet" : "No Predge verdict on Monad for this market yet";
  return `Monad verdict: ${oc.score}/100, ${oc.score === 0 ? "the disputed answer did not hold" : oc.score === 100 ? "the disputed answer held" : "partial"}`;
}

function Timeline({ p, endDate }: { p: SignedPayload; endDate?: string }) {
  const items: { t: string; label: string; body: React.ReactNode; tone?: string }[] = [];
  if (endDate) items.push({ t: endDate, label: "Market closed", body: "Scheduled end of trading" });
  p.disputes?.forEach((d, i) => items.push({
    t: d.disputed_at, label: `Dispute ${i + 1}`, tone: "warn",
    body: <>Proposal <b>{d.disputed_proposal ?? "unknown"}</b> was disputed on Polygon · <Ext href={polyTx(d.tx)} className="mono">{d.tx.slice(0, 10)}…</Ext></>,
  }));
  if (p.latest_bulletin_board_update) items.push({ t: p.latest_bulletin_board_update.posted_at, label: "Bulletin board", body: <>{p.latest_bulletin_board_update.kind} posted by the {p.latest_bulletin_board_update.poster.replace(/_/g, " ")} ({p.bulletin_board_count} in total)</> });
  items.push({ t: "", label: "UMA vote", body: p.sent_to_uma_vote ? "Sent to a UMA token-holder vote" : "Not sent to a UMA vote", tone: p.sent_to_uma_vote ? "warn" : undefined });
  items.push({ t: "", label: p.resolved_on_chain ? "Final outcome" : "Status", tone: p.resolved_on_chain ? "ok" : "warn",
    body: p.resolved_on_chain ? <>Resolved on chain: <b>{p.onchain_resolution?.outcome}</b> (UMA state {p.uma_state})</> : <>UMA state {p.uma_state}{p.open_dispute ? ", dispute open" : ""}</> });
  items.push({ t: p.checked_at, label: "Checked by Predge", body: "Live read of UMA and the Polymarket adapter on Polygon" });
  return (
    <ol className="timeline">
      {items.map((it, i) => (
        <li key={i} className={`tl tl-${it.tone ?? "plain"}`} style={{ animationDelay: `${i * 70}ms` }}>
          <span className="tl-dot" />
          <div className="tl-main">
            <div className="tl-head"><span className="tl-label">{it.label}</span>{it.t && <span className="tl-time">{fmtDate(it.t)}</span>}</div>
            <div className="tl-body">{it.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 34, c = 2 * Math.PI * r;
  const good = score >= 50;
  return (
    <div className={`ring ${good ? "ring-ok" : "ring-zero"}`} data-testid="onchain-score">
      <svg viewBox="0 0 80 80" width="80" height="80">
        <circle cx="40" cy="40" r={r} className="ring-bg" />
        <circle cx="40" cy="40" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(score, 2) / 100)} />
      </svg>
      <div className="ring-val"><b>{score}</b><span>/100</span></div>
    </div>
  );
}

function OnchainCard({ oc, err, step, p }: { oc: OnchainResult | null | undefined; err: string | null; step: number; p: SignedPayload }) {
  const head = <div className="card-top"><h3>On-chain verdict</h3><span className="chain-pill"><span className="dot" />Monad testnet</span></div>;
  if (oc === undefined) return <article className="card">{head}<ul className="checks"><CheckRow state="running" title="Reading PredgeAgentValidator" detail={<span className="mono">{MONAD.contracts.PredgeAgentValidator.slice(0, 10)}…</span>} /></ul></article>;
  if (oc === null) return <article className="card">{head}<p className="muted">{err ? `Could not read Monad testnet right now (${err}).` : p.disputes?.length ? "No disputed proposal in this record." : "This market was never disputed, so there is no claim for Predge to answer on chain."}</p></article>;
  if (!oc.found) return (
    <article className="card">{head}
      <p className="muted">{oc.requested ? "A validation request for this market is recorded on chain; Predge has not answered it yet." : "No Predge verdict on chain for this market yet. Verdicts exist for the 145 sampled markets; a signed-in user can request one below."}</p>
      <div className="kv"><span>requestHash</span><Hash value={oc.requestHash} n={8} /></div>
    </article>
  );
  const s = (i: number, ok: boolean | null): CheckState => (step < i ? (step === i - 1 ? "running" : "idle") : ok === null ? "na" : ok ? "ok" : "fail");
  return (
    <article className="card onchain">
      {head}
      <div className="onchain-top">
        <ScoreRing score={oc.score ?? 0} />
        <div>
          <div className="onchain-claim">Claim: <i>"final outcome equals the disputed proposal {oc.claim?.proposal}"</i></div>
          <div className="onchain-answer">{oc.score === 100 ? "Predge answered 100: it held." : oc.score === 0 ? "Predge answered 0: the market settled differently." : `Predge answered ${oc.score}.`}</div>
          {oc.responseTx && <div className="sm"><Ext href={tx(oc.responseTx)}>Verdict tx on MonadVision ↗</Ext>{oc.requestTx && <> · <Ext href={tx(oc.requestTx)}>request tx ↗</Ext></>}</div>}
        </div>
      </div>
      <ul className="checks">
        <CheckRow testId="oc-validator" state={s(1, oc.validatorMatches)} title="Written by Predge's validator" detail={<>{oc.validator && <Hash value={oc.validator} href={addr(oc.validator)} />}{oc.leadTime !== null && <> · request committed {oc.leadTime} s before the verdict</>}</>} />
        <CheckRow testId="oc-hash" state={s(2, oc.hashMatches && oc.boundSigOk)} title="responseHash == keccak256(signed record)"
          detail={oc.responseHash ? <><Hash value={oc.responseHash} n={8} /> {oc.hashMatches ? "=" : "≠"} {oc.boundHash ? <Hash value={oc.boundHash} n={8} /> : "no bound record at hand"}{oc.bound && <> · that record's ed25519 signature {oc.boundSigOk ? "verifies" : "does not verify"}</>}</> : null} />
        <CheckRow testId="oc-score" state={s(3, oc.scoreConsistent)} title="Score agrees with the signed facts" detail={<>outcome {p.onchain_resolution?.outcome ?? "?"} vs proposal {oc.claim?.proposal}: {oc.score === 100 ? "same, so 100" : "different, so 0"}</>} />
        <CheckRow testId="oc-bond" state={step < 4 ? (step === 3 ? "running" : "idle") : oc.bond ? "ok" : "na"} title={oc.bond ? (oc.bond.demo ? "Bond: slashed in the demo" : `Bond: ${oc.bond.bondMON} MON staked`) : "No bond behind this verdict"}
          detail={oc.bond ? <><Hash value={oc.bond.contract} href={addr(oc.bond.contract)} /> · slashCount {oc.bond.slashCount} · stake {oc.bond.closed ? "closed" : "open"} · {oc.bond.bondMON} MON left</> : <>Batch verdicts are unbonded. Bonds back verdicts sold under an escrowed job; see the slash demo below.</>} />
      </ul>
      {oc.bound && (
        <p className="sm muted">The verdict is bound to the record Predge signed on {fmtDate(JSON.parse(oc.bound.canonical).issued_at)}. {oc.sameFacts ? " The record checked above may be newer, so its bytes can differ, but it carries the same disputes and the same outcome." : oc.sameFacts === false ? " The facts in the record checked above differ from the bound record; treat with care." : ""}</p>
      )}
    </article>
  );
}
