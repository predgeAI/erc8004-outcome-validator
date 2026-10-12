import { PREDGE_API, KEYS_URL, PINNED_KID, PINNED_KEY } from "./constants";
import { byMarket } from "./data";
import type { SignedRecord } from "./verify";

export interface Dispute { disputed_at: string; disputed_proposal: string | null; tx: string }

/** Everything here is parsed from the signed bytes, never from the unsigned part of the response. */
export interface SignedPayload {
  market_id: string;
  uma_question_id: string;
  condition_id: string;
  risk_level: "resolved" | "ok" | "watch" | "caution" | string;
  recommendation: string;
  resolved_on_chain: boolean;
  onchain_resolution: { outcome: string } | null;
  uma_state: string;
  dispute_count: string;
  open_dispute: boolean;
  sent_to_uma_vote: boolean;
  paused: boolean;
  current_proposal: string | null;
  disputes: Dispute[];
  bulletin_board_count: string;
  latest_bulletin_board_update: { kind: string; posted_at: string; poster: string } | null;
  checked_at: string;
  issued_at: string;
}

export interface Lookup {
  source: "live" | "bundled";
  /** why the bundled copy is shown, when it is */
  fallbackReason?: string;
  record: SignedRecord;
  payload: SignedPayload;
  /** unsigned market info from the API (question, slug, end date); display only */
  market: { question?: string; slug?: string; end_date?: string } | null;
}

/** Accept a Polymarket link, a market slug or a numeric market id. */
export function parseMarketInput(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s) || /polymarket\.com/i.test(s)) {
    try {
      const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
      const parts = u.pathname.split("/").filter(Boolean);
      s = parts[parts.length - 1] ?? "";
    } catch { return null; }
  }
  s = s.toLowerCase();
  if (/^\d{1,12}$/.test(s) || /^[a-z0-9][a-z0-9-]{1,200}$/.test(s) || /^0x[0-9a-f]{64}$/.test(s)) return s;
  return null;
}

function fromBundle(id: string, reason: string): Lookup | null {
  const v = byMarket.get(id);
  if (!v) return null;
  return { source: "bundled", fallbackReason: reason, record: v.record, payload: JSON.parse(v.record.canonical), market: v.title ? { question: v.title } : null };
}

export class LookupError extends Error {}

export async function lookupMarket(id: string, signal?: AbortSignal): Promise<Lookup> {
  let res: Response;
  try {
    res = await fetch(`${PREDGE_API}/v1/settlement-risk/${encodeURIComponent(id)}`, { signal, headers: { accept: "application/json" } });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    const b = fromBundle(id, "The live API could not be reached from this browser");
    if (b) return b;
    throw new LookupError("The live API could not be reached, and this market is not in the bundled set of 145.");
  }
  if (!res.ok) {
    let msg = `The API answered ${res.status}.`;
    try { const j = await res.json(); if (j?.error) msg = String(j.error.message ?? j.error); } catch { /* keep status */ }
    const b = res.status >= 500 || res.status === 429 ? fromBundle(id, `The live API answered ${res.status}`) : null;
    if (b) return b;
    throw new LookupError(res.status === 404 ? "No Polymarket market found for that link, slug or id." : msg);
  }
  const body = await res.json();
  const rec = body?.attestation;
  if (!rec?.canonical) throw new LookupError("The response carried no signed record.");
  const record: SignedRecord = { public_key: rec.public_key, signature: rec.signature, canonical: rec.canonical, content_hash: rec.content_hash, kid: rec.kid };
  return { source: "live", record, payload: JSON.parse(rec.canonical), market: body.market ?? null };
}

export interface KeyCheck { ok: boolean; kid: string; servedBy: "well-known" | "pinned" }

/** The signing key must be Predge's pinned key and, when reachable, listed active in the published key file. */
export async function checkKey(rec: SignedRecord): Promise<KeyCheck> {
  const kid = rec.public_key.slice(0, 16);
  const pinned = kid === PINNED_KID && rec.public_key === PINNED_KEY;
  try {
    const r = await fetch(KEYS_URL);
    const j = await r.json();
    const k = (j.keys ?? []).find((x: { kid: string }) => x.kid === kid);
    return { ok: pinned && Boolean(k && k.public_key === rec.public_key && k.role === "attestation"), kid, servedBy: "well-known" };
  } catch {
    return { ok: pinned, kid, servedBy: "pinned" };
  }
}
