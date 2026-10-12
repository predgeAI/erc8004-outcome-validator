// Fetch a Predge settlement-risk record and verify it with @predge/settlement-risk (ed25519 against
// the pinned key, sha256 content hash, payload == canonical). Only the signed bytes are used.

import {
  extractRecord,
  parseSettlementRisk,
  PINNED_KEYS,
  PREDGE_API,
  type SettlementRisk,
  type SignedRecord,
} from "../../../sdk/src/index.js";
import { type FetchLike, getJson } from "./http.js";

export interface PredgeRecord {
  risk: SettlementRisk;
  /** the parsed signed bytes */
  signed: Record<string, any>;
  /** outcome of the current (pending, not yet final) proposal, from the signed bytes */
  currentProposal: string | null;
  proposal: { outcome: string; proposedAt: string | null; challengeWindowEnds: string | null } | null;
  url: string;
  /** unsigned context from the same response, for display only */
  context: { slug: string | null; question: string | null; endDate: string | null };
  kid: string;
}

export async function fetchPredgeRecord(market: string, opts: { fetch?: FetchLike; baseUrl?: string; timeoutMs?: number } = {}): Promise<PredgeRecord> {
  const url = `${(opts.baseUrl ?? PREDGE_API).replace(/\/$/, "")}/v1/settlement-risk/${encodeURIComponent(market)}`;
  const body = await getJson<any>(url, { fetch: opts.fetch, timeoutMs: opts.timeoutMs ?? 45_000 });
  const rec: SignedRecord = extractRecord(body);
  const risk = parseSettlementRisk(rec, url, PINNED_KEYS);
  const signed = JSON.parse(rec.canonical) as Record<string, any>;
  if (/^\d+$/.test(market) && risk.marketId !== market) throw new Error(`signed record is for market ${risk.marketId}, asked for ${market}`);
  const cp = signed.current_proposal;
  const proposal = cp == null ? null : typeof cp === "object"
    ? { outcome: String(cp.proposed_outcome ?? cp.outcome ?? ""), proposedAt: cp.proposed_at ?? null, challengeWindowEnds: cp.challenge_window_ends ?? null }
    : { outcome: String(cp), proposedAt: null, challengeWindowEnds: null };
  const kid = Object.entries(PINNED_KEYS).find(([, k]) => k.toLowerCase() === String(rec.public_key).toLowerCase())?.[0] ?? "unknown";
  return {
    risk,
    signed,
    currentProposal: proposal?.outcome ?? null,
    proposal,
    url,
    context: { slug: body?.market?.slug ?? null, question: body?.market?.question ?? null, endDate: body?.market?.end_date ?? null },
    kid,
  };
}

/** Disputed and not final, or proposed and not final. */
export function settlementFlags(r: PredgeRecord): { disputed: boolean; proposedNotFinal: boolean; final: boolean; label: string } {
  const final = r.risk.resolvedOnChain;
  const disputed = !final && (r.risk.disputeCount > 0 || r.risk.openDispute || r.risk.sentToUmaVote);
  const proposedNotFinal = !final && (r.currentProposal !== null || /propos/i.test(r.risk.umaState));
  let label = "no proposal yet";
  if (final) label = `final: ${r.risk.outcome}`;
  else if (r.risk.sentToUmaVote) label = "disputed twice, at UMA vote";
  else if (r.risk.openDispute) label = "dispute open";
  else if (disputed && proposedNotFinal) label = `disputed, new proposal ${r.currentProposal ?? ""} pending`.trim();
  else if (disputed) label = "disputed, waiting for a new proposal";
  else if (proposedNotFinal) label = `proposed ${r.currentProposal ?? ""}, not final`.replace(/\s+,/, ",");
  if (r.risk.paused) label += " (paused)";
  return { disputed, proposedNotFinal, final, label };
}
