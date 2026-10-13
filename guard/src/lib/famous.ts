import snap from "./famous.json";
import type { SignedRecord } from "./verify";

/** The four disputes shown on the first screen. Volumes are Polymarket lifetime volume (Gamma API), checked 13 Oct 2026. */
export interface Famous {
  id: string;
  question: string;
  traded: string;
  /** disputed answer and what the market finally settled on; null while the vote is open */
  disputed: string;
  final: string | null;
  live?: boolean;
}

export const FAMOUS: Famous[] = [
  { id: "2446852", question: "Will Ronaldo cry at the World Cup?", traded: "$89M", disputed: "NO", final: "YES" },
  { id: "1144023", question: "U.S. anti-cartel ground operation in Mexico by January 31?", traded: "$30M", disputed: "NO", final: "YES" },
  { id: "2241873", question: "Iran closes its airspace by May 24?", traded: "$15M", disputed: "YES", final: "NO" },
  { id: "5219930", question: "Will Trump say “Ammunition” this week?", traded: "$0.3M", disputed: "NO", final: null, live: true },
];

export const DEFAULT_MARKET = FAMOUS[0]!.id;
export const famousById = new Map(FAMOUS.map((f) => [f.id, f]));

type Snap = Record<string, { record: SignedRecord; market: { question?: string; slug?: string; end_date?: string | null } }>;
export const SNAPSHOT = snap as unknown as Snap;
