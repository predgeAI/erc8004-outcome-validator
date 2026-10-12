import { PREDGE_API } from "./constants.js";
import { PredgeVerificationError, type RecordChecks, type SignedRecord, verifyRecord } from "./verify.js";

export type RiskLevel = "resolved" | "ok" | "watch" | "caution";
/** Lower is safer. `resolved` means the on-chain resolution is final. */
export const RISK_ORDER: Readonly<Record<RiskLevel, number>> = { resolved: 0, ok: 1, watch: 2, caution: 3 };

export interface Dispute { disputed_at: string; disputed_proposal: string | null; tx: string }

export interface SettlementRisk {
  marketId: string;
  riskLevel: RiskLevel;
  recommendation: string;
  resolvedOnChain: boolean;
  /** final on-chain outcome, when resolved */
  outcome: string | null;
  umaState: string;
  disputeCount: number;
  openDispute: boolean;
  sentToUmaVote: boolean;
  paused: boolean;
  disputes: Dispute[];
  umaQuestionId: string;
  conditionId: string;
  checkedAt: string;
  issuedAt: string;
  /** every field above comes from the signed bytes, never from the unsigned part of the response */
  verified: RecordChecks;
  record: SignedRecord;
  source: string;
}

export interface FetchOptions {
  /** API base, default https://api.predge.io */
  baseUrl?: string;
  /** fetch implementation (e.g. an x402 paying fetch); default globalThis.fetch */
  fetch?: typeof fetch;
  pinnedKeys?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
}

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** Build the typed result from a signed record. Throws PredgeVerificationError if it does not verify. */
export function parseSettlementRisk(rec: SignedRecord, source = "record", pinnedKeys?: Readonly<Record<string, string>>): SettlementRisk {
  const v = verifyRecord(rec, pinnedKeys);
  if (!v.ok) throw new PredgeVerificationError(`signed record failed verification: ${JSON.stringify(v.checks)}`, v.checks);
  const p = v.payload as Record<string, any>;
  if (p.kind !== "settlement-risk") throw new PredgeVerificationError(`unexpected record kind ${p.kind}`, v.checks);
  const level = p.risk_level as RiskLevel;
  if (!(level in RISK_ORDER)) throw new PredgeVerificationError(`unknown risk_level ${level}`, v.checks);
  return {
    marketId: str(p.market_id),
    riskLevel: level,
    recommendation: str(p.recommendation),
    resolvedOnChain: p.resolved_on_chain === true,
    outcome: p.onchain_resolution?.outcome ?? null,
    umaState: str(p.uma_state),
    disputeCount: Number(p.dispute_count ?? 0),
    openDispute: p.open_dispute === true,
    sentToUmaVote: p.sent_to_uma_vote === true,
    paused: p.paused === true,
    disputes: Array.isArray(p.disputes) ? p.disputes : [],
    umaQuestionId: str(p.uma_question_id),
    conditionId: str(p.condition_id),
    checkedAt: str(p.checked_at),
    issuedAt: str(p.issued_at),
    verified: v.checks,
    record: rec,
    source,
  };
}

/** Pull the signed record out of an API body: api.predge.io uses `attestation`, the Monad x402 demo server `record`. */
export function extractRecord(body: any): SignedRecord {
  const rec = body?.attestation ?? body?.record ?? body;
  if (!rec || typeof rec.canonical !== "string") throw new PredgeVerificationError("response carries no signed record");
  return rec as SignedRecord;
}

export function checkMarketId(marketId: string | number): string {
  const id = String(marketId);
  if (!/^\d{1,12}$/.test(id)) throw new Error(`market id must be a Polymarket market id (digits), got ${JSON.stringify(id)}`);
  return id;
}

/**
 * Fetch https://api.predge.io/v1/settlement-risk/<marketId>, verify the ed25519 signature against the
 * pinned key and the sha256 content hash, and return the typed fields of the signed bytes.
 */
export async function getSettlementRisk(marketId: string | number, opts: FetchOptions = {}): Promise<SettlementRisk> {
  const id = checkMarketId(marketId);
  const url = `${(opts.baseUrl ?? PREDGE_API).replace(/\/$/, "")}/v1/settlement-risk/${id}`;
  const res = await (opts.fetch ?? fetch)(url, { headers: { accept: "application/json" }, signal: opts.signal });
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  const out = parseSettlementRisk(extractRecord(await res.json()), url, opts.pinnedKeys);
  if (out.marketId !== id) throw new PredgeVerificationError(`signed record is for market ${out.marketId}, asked for ${id}`, out.verified);
  return out;
}
