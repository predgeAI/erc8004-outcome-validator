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
  { id: "2169995", question: "MicroStrategy sells any Bitcoin by May 31?", traded: "$376M", disputed: "NO", final: "NO" },
  { id: "2241873", question: "Iran closes its airspace by May 24?", traded: "$15M", disputed: "YES", final: "NO" },
  { id: "1144023", question: "U.S. anti-cartel ground operation in Mexico by January 31?", traded: "$30M", disputed: "NO", final: "YES" },
  { id: "5219930", question: "Will Trump say \u201cAmmunition\u201d this week?", traded: "$0.3M", disputed: "NO", final: null, live: true },
];

// Opens on a dispute where the answer did not hold (the headline claim); the $376M card sits first.
export const DEFAULT_MARKET = "2241873";
export const famousById = new Map(FAMOUS.map((f) => [f.id, f]));

type Snap = Record<string, { record: SignedRecord; market: { question?: string; slug?: string; end_date?: string | null } }>;
export const SNAPSHOT = snap as unknown as Snap;
