// `mm predge check`: one market, end to end. Resolve -> signed Predge record -> Monad verdict -> decision.

import { RISK_ORDER, type RiskLevel } from "../../../sdk/src/index.js";
import type { FetchLike } from "./http.js";
import { type Market, resolveMarket } from "./market.js";
import { fetchPredgeRecord, type PredgeRecord, settlementFlags } from "./predge.js";
import { type ChainVerdict, type ClientFactory, readMainnetVerdict, readTestnetVerdict } from "./verdict.js";

export const RISK_LEVELS = Object.keys(RISK_ORDER) as RiskLevel[];
const POLYGONSCAN = "https://polygonscan.com/tx/";

export interface CheckOptions {
  /** highest risk level that still counts as safe; default "ok" (no dispute, no pending proposal issue) */
  maxRisk?: RiskLevel;
  skipChain?: boolean;
  fetch?: FetchLike;
  clients: ClientFactory;
}

export interface TimelineEvent { at: string; event: string; tx: string | null; url: string | null }

export interface CheckReport {
  input: string;
  market: { id: string; slug: string; question: string; conditionId: string; outcomes: string[]; closed: boolean; endDate: string | null };
  riskLevel: RiskLevel;
  recommendation: string;
  umaState: string;
  settlement: string;
  disputeCount: number;
  openDispute: boolean;
  sentToUmaVote: boolean;
  paused: boolean;
  disputedProposal: string | null;
  currentProposal: string | null;
  proposal: PredgeRecord["proposal"];
  finalOutcome: string | null;
  proposalVsOutcome: string;
  timeline: TimelineEvent[];
  record: { url: string; kid: string; checkedAt: string; issuedAt: string; signature: boolean; pinnedKey: boolean; contentHash: boolean | null; conditionIdMatches: boolean };
  verdicts: ChainVerdict[];
  verdictNote: string | null;
  safeToAct: boolean;
  maxRisk: RiskLevel;
  reason: string;
}

/** "caution: disputed twice, ..." -> "disputed twice, ..." */
const why = (rec: string) => rec.replace(/^(resolved|ok|watch|caution):\s*/, "").replace(/\.\s*$/, "");

export function decide(rec: PredgeRecord, market: Market, verdicts: ChainVerdict[], maxRisk: RiskLevel): { safe: boolean; reason: string } {
  const r = rec.risk;
  if (market.conditionId && r.conditionId.toLowerCase() !== market.conditionId.toLowerCase()) {
    return { safe: false, reason: `the signed record is for condition ${r.conditionId}, not this market (${market.conditionId})` };
  }
  const broken = verdicts.find((v) => v.found && (!v.bound || !v.validatorMatches || v.scoreConsistent === false));
  if (broken) return { safe: false, reason: `the ${broken.network} verdict is not bound to verifiable signed evidence (${broken.problems.join("; ")})` };
  if (r.paused) return { safe: false, reason: "the market is paused by the resolution adapter" };
  if (RISK_ORDER[r.riskLevel] > RISK_ORDER[maxRisk]) return { safe: false, reason: `${why(r.recommendation)} (risk ${r.riskLevel}, above the ${maxRisk} limit)` };
  const v = verdicts.find((x) => x.found && x.bound);
  return { safe: true, reason: `${why(r.recommendation)} (risk ${r.riskLevel}, within the ${maxRisk} limit)${v ? `; the ${v.network} verdict is bound to the signed record` : ""}` };
}

export async function check(input: string, opts: CheckOptions): Promise<CheckReport> {
  return (await checkFull(input, opts)).report;
}

export async function checkFull(input: string, opts: CheckOptions): Promise<{ report: CheckReport; market: Market }> {
  const maxRisk = opts.maxRisk ?? "ok";
  if (!(maxRisk in RISK_ORDER)) throw new Error(`--max-risk must be one of ${RISK_LEVELS.join(", ")}`);
  const market = await resolveMarket(input, { fetch: opts.fetch });
  const rec = await fetchPredgeRecord(market.marketId, { fetch: opts.fetch });
  const r = rec.risk;

  const verdicts: ChainVerdict[] = [];
  let verdictNote: string | null = null;
  if (opts.skipChain) verdictNote = "chain read skipped (--no-chain)";
  else {
    const reads = await Promise.allSettled([readMainnetVerdict(r.marketId, opts.clients, { fetch: opts.fetch }), readTestnetVerdict(rec.signed, opts.clients, { fetch: opts.fetch })]);
    for (const x of reads) {
      if (x.status === "fulfilled" && x.value) verdicts.push(x.value);
      else if (x.status === "rejected") verdictNote = `chain read failed: ${(x.reason as Error).message.split("\n")[0]}`;
    }
    // Mainnet first: when Monad mainnet has this market, an empty testnet read is noise.
    if (verdicts.some((v) => v.chainId === 143)) for (let i = verdicts.length - 1; i >= 0; i--) if (verdicts[i].chainId !== 143 && !verdicts[i].found) verdicts.splice(i, 1);
    if (!r.disputes[0]?.disputed_proposal && !verdicts.length) verdictNote = "no disputed proposal, so Predge has no claim to score on chain for this market";
    else if (verdicts.length && !verdicts.some((v) => v.found)) verdictNote = "no verdict on chain yet for this market's claim";
  }

  const disputedProposal = r.disputes[0]?.disputed_proposal ?? null;
  const flags = settlementFlags(rec);
  let proposalVsOutcome = "no proposal has been disputed";
  if (disputedProposal && r.resolvedOnChain) proposalVsOutcome = r.outcome === disputedProposal ? `disputed proposal ${disputedProposal} stood: final outcome ${r.outcome}` : `disputed proposal ${disputedProposal} was overturned: final outcome ${r.outcome}`;
  else if (disputedProposal && rec.currentProposal) proposalVsOutcome = `disputed proposal ${disputedProposal}, current proposal ${rec.currentProposal} (not final)`;
  else if (disputedProposal) proposalVsOutcome = `disputed proposal ${disputedProposal}, no final outcome yet`;
  else if (r.resolvedOnChain) proposalVsOutcome = `final outcome ${r.outcome}, never disputed`;
  else if (rec.currentProposal) proposalVsOutcome = `proposal ${rec.currentProposal} pending, not final`;

  const timeline: TimelineEvent[] = r.disputes.map((d, i) => ({
    at: d.disputed_at,
    event: `dispute ${i + 1}${d.disputed_proposal ? ` of proposal ${d.disputed_proposal}` : ""}${i === 1 ? " (sends the outcome to a UMA vote)" : ""}`,
    tx: d.tx || null,
    url: d.tx ? `${POLYGONSCAN}${d.tx}` : null,
  }));
  if (rec.proposal) {
    const ends = rec.proposal.challengeWindowEnds;
    const open = ends ? Date.parse(ends) > Date.now() : null;
    timeline.push({ at: rec.proposal.proposedAt ?? r.checkedAt, event: `proposal ${rec.proposal.outcome}, not final${ends ? `; challenge window ${open ? "ends" : "ended"} ${ends}` : ""}`, tx: null, url: null });
  }
  if (r.resolvedOnChain) timeline.push({ at: r.checkedAt, event: `state at check time: resolved on chain, outcome ${r.outcome}`, tx: null, url: null });

  const d = decide(rec, market, verdicts, maxRisk);
  const report: CheckReport = {
    input,
    market: { id: r.marketId, slug: market.slug, question: market.question, conditionId: r.conditionId, outcomes: market.outcomes, closed: market.closed, endDate: market.endDate },
    riskLevel: r.riskLevel,
    recommendation: r.recommendation,
    umaState: r.umaState,
    settlement: flags.label,
    disputeCount: r.disputeCount,
    openDispute: r.openDispute,
    sentToUmaVote: r.sentToUmaVote,
    paused: r.paused,
    disputedProposal,
    currentProposal: rec.currentProposal,
    proposal: rec.proposal,
    finalOutcome: r.resolvedOnChain ? r.outcome : null,
    proposalVsOutcome,
    timeline,
    record: {
      url: rec.url, kid: rec.kid, checkedAt: r.checkedAt, issuedAt: r.issuedAt,
      signature: r.verified.signature, pinnedKey: r.verified.pinnedKey, contentHash: r.verified.contentHash,
      conditionIdMatches: !market.conditionId || r.conditionId.toLowerCase() === market.conditionId.toLowerCase(),
    },
    verdicts,
    verdictNote,
    safeToAct: d.safe,
    maxRisk,
    reason: d.reason,
  };
  return { report, market };
}

const short = (h: string) => (h.length > 14 ? `${h.slice(0, 10)}...${h.slice(-4)}` : h);

export function renderCheck(c: CheckReport): string {
  const L: string[] = [];
  L.push(`${c.market.question} (market ${c.market.id}, ${c.market.slug})`);
  L.push(`Risk:      ${c.riskLevel.toUpperCase()}  (UMA state ${c.umaState}; ${c.settlement})`);
  L.push(`Disputes:  ${c.disputeCount}${c.sentToUmaVote ? ", sent to UMA token-holder vote" : ""}${c.openDispute ? ", open" : ""}`);
  for (const t of c.timeline) L.push(`  ${t.at}  ${t.event}${t.tx ? `  ${t.url}` : ""}`);
  L.push(`Outcome:   ${c.proposalVsOutcome}`);
  L.push(`Record:    signed by Predge key ${c.record.kid}, signature ${c.record.signature ? "ok" : "BAD"}, pinned key ${c.record.pinnedKey ? "ok" : "BAD"}, content hash ${c.record.contentHash === null ? "n/a" : c.record.contentHash ? "ok" : "BAD"}, condition id ${c.record.conditionIdMatches ? "matches" : "MISMATCH"}; checked ${c.record.checkedAt}`);
  for (const v of c.verdicts) {
    if (!v.found) { L.push(`Verdict:   ${v.network}: ${v.pending ? "requested, pending until the dispute settles" : "none yet"} for requestHash ${short(v.requestHash)} (${v.explorerUrl})`); continue; }
    // Two claims are validated: settlement-risk-v1 asks "did the disputed proposal stand" (100 yes, 0 no);
    // resolved-outcome-vs-claim asks "does the signed record match the claim it was requested for" (100 yes).
    const meaning = v.tag === "predge:resolved-outcome-vs-claim"
      ? (v.score === 100 ? ", signed record verified (claim: record matches the request)" : "")
      : c.disputedProposal ? (v.score === 100 ? `, disputed proposal ${c.disputedProposal} stood` : v.score === 0 ? `, disputed proposal ${c.disputedProposal} did not stand` : "") : "";
    L.push(`Verdict:   ${v.network}: score ${v.score}${meaning} (tag ${v.tag}), ${v.bound ? "bound to the signed record" : "NOT bound"}, validator ${v.validatorMatches ? "is Predge" : "UNEXPECTED"}${v.scoreConsistent === false ? ", score INCONSISTENT" : ""}`);
    L.push(`           ${v.explorerUrl}`);
  }
  if (c.verdictNote && !c.verdicts.length) L.push(`Verdict:   ${c.verdictNote}`);
  L.push(`Safe to act: ${c.safeToAct ? "yes" : "no"}, because ${c.reason}`);
  return L.join("\n");
}
