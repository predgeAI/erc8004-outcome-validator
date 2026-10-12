// Shared helpers for the Predge Monad indexer.

/** Predge's validator / owner key on Monad testnet (monad/deployment.json). */
export const PREDGE_VALIDATOR = "0x9f0af03c5695b72903c03852f7dd4fe5a0d49fc9" as const;

export const GLOBAL = "global";

/** Known pay-per-call routes: keccak256(utf8(path)) -> path. */
const KNOWN_ROUTES: Record<string, string> = {
  "0x9af90b92aecf9fe5d4a7cf5cbf9a3967d89ffd6a87db4517ed27ece397c440fa": "/v1/settlement-risk",
  "0x3a82c38105c933e86f22a39e898fd8b56e6adb708059eb687b1e9701d716474e": "/v1/settlement-estimate",
  "0xb3ac8f7dfeac1258d9de9912e898abd1827fa9bf173e78507aae2d5050899295": "/v1/scout",
  "0xb2b310bdfdb3eff6a3315f47798fdca26f4d3fec9efbab9ef18fc0f632cc3906": "/v1/wallet-edge",
};

export const eventId = (e: { chainId: number; block: { number: number }; logIndex: number }) =>
  `${e.chainId}_${e.block.number}_${e.logIndex}`;

/** Market id from "pm:<id>" request URIs (batch) or ".../pm-<id>-..." pack URLs (smoke). */
export function parseMarketId(uri: string): string | undefined {
  const m = uri.match(/(?:^pm:|\/pm-)(\d+)/);
  return m ? m[1] : undefined;
}

/** Route label: a known keccak'd path, or the bytes32 read as right-padded ASCII. */
export function decodeRoute(route: string): string | undefined {
  const known = KNOWN_ROUTES[route.toLowerCase()];
  if (known) return known;
  const hex = route.replace(/^0x/, "").replace(/(00)+$/, "");
  if (!hex) return undefined;
  let out = "";
  for (let i = 0; i < hex.length; i += 2) {
    const c = parseInt(hex.slice(i, i + 2), 16);
    if (c < 0x20 || c > 0x7e) return undefined;
    out += String.fromCharCode(c);
  }
  return out;
}

export const emptyStats = (id: string) => ({
  id,
  totalRequests: 0,
  totalVerdicts: 0,
  score0: 0,
  score1to49: 0,
  score50to99: 0,
  score100: 0,
  sumScores: 0n,
  bondsCommitted: 0,
  bondsScored: 0,
  slashedCount: 0,
  reclaimedCount: 0,
  totalStakedWei: 0n,
  totalSlashedWei: 0n,
  totalReclaimedWei: 0n,
  jobsCreated: 0,
  jobsSubmitted: 0,
  jobsCompleted: 0,
  jobsRejected: 0,
  totalEscrowWei: 0n,
  receipts: 0,
  totalPaidWei: 0n,
  lastBlock: 0,
  lastTimestamp: 0,
});

export type Stats = ReturnType<typeof emptyStats>;

/** Load-modify-store a VerdictStats row. */
export async function bumpStats(
  context: any,
  id: string,
  block: number,
  timestamp: number,
  f: (s: Stats) => Partial<Stats>,
) {
  const cur: Stats = (await context.VerdictStats.get(id)) ?? emptyStats(id);
  context.VerdictStats.set({
    ...cur,
    ...f(cur),
    lastBlock: Math.max(cur.lastBlock, block),
    lastTimestamp: Math.max(cur.lastTimestamp, timestamp),
  });
}

export function bucketDelta(s: Stats, score: number): Partial<Stats> {
  if (score === 0) return { score0: s.score0 + 1 };
  if (score === 100) return { score100: s.score100 + 1 };
  if (score < 50) return { score1to49: s.score1to49 + 1 };
  return { score50to99: s.score50to99 + 1 };
}
