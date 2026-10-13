import measured from "./monad-measured.json";

/**
 * Saved Nansen snapshots (nansen/cache/exposure-<id>.json, top 50 holders by shares, fetched 12 Oct 2026 ~21:10 UTC
 * and paid over x402). Only the dollar totals per side are shown; nothing here is re-fetched by the page.
 */
export interface Exposure { asOf: string; contested: string; other: string; contestedUsd: number; otherUsd: number; contestedHolders: number; otherHolders: number }
export const EXPOSURE: Record<string, Exposure> = {
  "5219930": { asOf: "2026-10-12T21:10:06Z", contested: "NO", other: "YES", contestedUsd: 91170, otherUsd: 36208, contestedHolders: 26, otherHolders: 24 },
  "1112268": { asOf: "2026-10-12T21:12:52Z", contested: "Over", other: "Under", contestedUsd: 1023, otherUsd: 2138, contestedHolders: 34, otherHolders: 16 },
  "1137824": { asOf: "2026-10-12T21:12:26Z", contested: "Under", other: "Over", contestedUsd: 6625, otherUsd: 6141, contestedHolders: 6, otherHolders: 0 },
  "4838803": { asOf: "2026-10-12T21:13:39Z", contested: "NO", other: "YES", contestedUsd: 11741, otherUsd: 3198, contestedHolders: 21, otherHolders: 29 },
  "5532382": { asOf: "2026-10-12T21:13:18Z", contested: "NO", other: "YES", contestedUsd: 302, otherUsd: 266, contestedHolders: 5, otherHolders: 6 },
};
export const LIVE_DISPUTE = "5219930";

/** The one listed dispute note (kuru/deployments/monad-testnet.json): CHANGE pays 1 test dollar if 5219930 does not settle NO. */
export const KURU = {
  market: "5219930",
  book: "0x6Ee28124848dAb2685Ff424b9DF0eAc43e9b30A8" as const,
  change: "0x65e05B95A4fc3eFFAf8881eb7A435f9c64d0319D" as const,
  hold: "0xBfD25f66f12d17820177DF63Bb66174eE16f2C04" as const,
  explorer: "https://testnet.monadvision.com",
  quoteTx: "0x479d0d75609abce73f8c5920857213dd9d6c6265c5dcdb3cc95557ed579a4d1a",
  saved: { bid: 0.18, ask: 0.25 },
};

/** Latest paid x402 check on Monad mainnet (monad/x402/runs, 13 Oct 2026). */
export const X402_LAST = { tx: "0x83de667bb4cdb8a7c338fd35a015d9b4071ea209eca0a1bbdd031250e0e55228", at: "2026-10-13T06:31:22Z", amount: "0.001", market: "5532382" };

/** Polymarket crypto price-threshold markets ("Bitcoin above $84,000 on October 14?") are what the Perpl hedger covers. */
export const isBtcThreshold = (q: string | undefined) => !!q && /\b(bitcoin|btc)\b/i.test(q) && /\b(above|below|over|under|reach|hit|dip)\b/i.test(q) && /\$?\d[\d,.]*\s?k?\b/i.test(q);

export const MEASURED = measured as {
  measuredAt: string; rpc: string; runs: string[]; markets: number; txs: number; verdicts: number; allSucceeded: boolean; gasPriceGwei: number;
  totalMON: number; monPerVerdict: number; monPerResponse: number;
  run1: { txs: number; seconds: number; blocks: number }; run2: { pairs: number; blocks: [number, number]; seconds: [number, number] };
  blockIntervalS: number; monUsd: number | null; monUsdAt: string | null; monUsdSource: string;
};

export const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Predge Settle Watch for Android, Monad edition: the same flow, with the hedges executed after a fingerprint. */
export const ANDROID_RELEASE = "https://github.com/predgeAI/predge-settle-watch/releases/tag/v0.6.1-monad";
