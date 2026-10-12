// `mm predge scan`: a wallet's Polymarket positions (public Data API v2) checked against Predge
// records. Flags every position whose market is disputed or proposed-but-not-final.

import { type FetchLike, getJson, mapLimit } from "./http.js";
import { fetchPredgeRecord, settlementFlags } from "./predge.js";

export const DATA_API = "https://data-api.polymarket.com";

export interface Position {
  conditionId: string;
  slug: string;
  title: string;
  outcome: string;
  size: number;
  value: number;
  status: string;
  redeemable: boolean;
  endDate: string | null;
}

export interface ScannedPosition extends Position {
  marketId: string | null;
  riskLevel: string | null;
  settlement: string | null;
  disputeCount: number | null;
  flagged: boolean;
  flag: "disputed" | "proposed-not-final" | null;
  recommendation: string | null;
  error: string | null;
}

export interface ScanReport {
  address: string;
  source: string;
  positionsFetched: number;
  checked: number;
  flagged: ScannedPosition[];
  unchecked: ScannedPosition[];
  clear: ScannedPosition[];
  truncated: boolean;
  scannedAt: string;
}

export async function fetchPositions(address: string, opts: { fetch?: FetchLike; includeRedeemable?: boolean; max?: number } = {}): Promise<{ positions: Position[]; truncated: boolean }> {
  const out: Position[] = [];
  const max = opts.max ?? 500;
  let cursor: string | null = null;
  let pages = 0;
  let truncated = false;
  for (;;) {
    const page: any = await getJson<any>(`${DATA_API}/v2/positions?user=${address}&limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { fetch: opts.fetch, timeoutMs: 30_000 });
    const rows: any[] = Array.isArray(page?.data) ? page.data : Array.isArray(page) ? page : [];
    for (const p of rows) {
      if (!(Number(p.current_size) > 0)) continue;
      if (!opts.includeRedeemable && p.status !== "OPEN") continue;
      out.push({
        conditionId: String(p.condition_id).toLowerCase(), slug: String(p.slug ?? ""), title: String(p.title ?? ""), outcome: String(p.outcome ?? ""),
        size: Number(p.current_size), value: Number(p.current_value ?? 0), status: String(p.status ?? ""), redeemable: p.redeemable === true, endDate: p.end_date ?? null,
      });
    }
    cursor = page?.pagination?.next_cursor ?? null;
    if (!page?.pagination?.has_more || !cursor || !rows.length) break;
    if (++pages >= 10) { truncated = true; break; }
  }
  out.sort((a, b) => b.value - a.value);
  if (out.length > max) { truncated = true; out.length = max; }
  return { positions: out, truncated };
}

export async function scan(address: string, opts: { fetch?: FetchLike; includeRedeemable?: boolean; max?: number; concurrency?: number } = {}): Promise<ScanReport> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error(`--address must be a 0x Polymarket wallet (proxy wallet) address, got ${JSON.stringify(address)}`);
  const addr = address.toLowerCase();
  const { positions, truncated } = await fetchPositions(addr, opts);

  // one Predge call per market, not per position
  const byMarket = new Map<string, Position[]>();
  for (const p of positions) byMarket.set(p.conditionId, [...(byMarket.get(p.conditionId) ?? []), p]);
  const markets = [...byMarket.keys()];
  const results = await mapLimit(markets, opts.concurrency ?? 3, async (cid) => {
    const first = byMarket.get(cid)![0];
    try {
      const rec = await fetchPredgeRecord(first.slug || cid, { fetch: opts.fetch, timeoutMs: 45_000 });
      if (rec.risk.conditionId.toLowerCase() !== cid) throw new Error(`signed record is for condition ${rec.risk.conditionId}, position is in ${cid}`);
      return { cid, rec, error: null as string | null };
    } catch (e) {
      return { cid, rec: null, error: (e as Error).message.split("\n")[0].slice(0, 200) };
    }
  });

  const all: ScannedPosition[] = [];
  for (const { cid, rec, error } of results) {
    for (const p of byMarket.get(cid)!) {
      if (!rec) { all.push({ ...p, marketId: null, riskLevel: null, settlement: null, disputeCount: null, flagged: false, flag: null, recommendation: null, error }); continue; }
      const f = settlementFlags(rec);
      const flag = f.disputed ? "disputed" : f.proposedNotFinal ? "proposed-not-final" : null;
      all.push({ ...p, marketId: rec.risk.marketId, riskLevel: rec.risk.riskLevel, settlement: f.label, disputeCount: rec.risk.disputeCount, flagged: flag !== null, flag, recommendation: rec.risk.recommendation, error: null });
    }
  }
  return {
    address: addr,
    source: `${DATA_API}/v2/positions`,
    positionsFetched: positions.length,
    checked: all.filter((p) => !p.error).length,
    flagged: all.filter((p) => p.flagged).sort((a, b) => b.value - a.value),
    unchecked: all.filter((p) => p.error),
    clear: all.filter((p) => !p.flagged && !p.error),
    truncated,
    scannedAt: new Date().toISOString(),
  };
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export function renderScan(s: ScanReport): string {
  const L: string[] = [];
  L.push(`Wallet ${s.address}: ${s.positionsFetched} positions${s.truncated ? " (truncated, largest first)" : ""}, ${s.checked} checked against signed Predge records`);
  L.push(`Flagged: ${s.flagged.length}  (disputed or proposed but not final)`);
  for (const p of s.flagged) {
    L.push(`  [${p.flag}] ${p.riskLevel?.toUpperCase()}  ${p.title}  holds ${p.outcome} ${p.size.toFixed(2)} (${usd(p.value)})`);
    L.push(`      market ${p.marketId} ${p.slug}: ${p.settlement}; disputes ${p.disputeCount}`);
    L.push(`      ${p.recommendation}`);
  }
  if (s.unchecked.length) {
    L.push(`Not checked: ${s.unchecked.length} (no signed record, so unknown, not safe)`);
    for (const p of s.unchecked.slice(0, 10)) L.push(`  ${p.slug || p.conditionId}: ${p.error}`);
    if (s.unchecked.length > 10) L.push(`  ... ${s.unchecked.length - 10} more (see --json)`);
  }
  L.push(`Clear: ${s.clear.length} (no dispute and no pending proposal, or final)`);
  return L.join("\n");
}
