import raw from "../generated/data.json";
import type { SignedRecord } from "./verify";

export interface BatchVerdict {
  market_id: string;
  title: string;
  proposal: string;
  outcome: string;
  score: number;
  requestHash: `0x${string}`;
  responseHash: `0x${string}`;
  requestTx: string;
  responseTx: string;
  responseBlock: number;
  record: SignedRecord;
}

export interface X402Run {
  file: string; market: string; tx: string; block: number; amountUSDC: string; latencyMs: number;
  payer: string; payTo: string; gasPaidBy: string; recordSignatureOk: boolean;
  verdict: { response: number; responseTx: string; bound: boolean } | null;
  decision: string;
}

export interface BundleData {
  batch: { ranAt: string; verdicts: number; transactions: number; blocks: { span: number }; chainSeconds: number; costMON: { total: string; perVerdict: string } };
  verdicts: BatchVerdict[];
  slash: {
    ranAt: string; bond: `0x${string}`; market: string; requestHash: `0x${string}`; expected: string; delivered: string; tamperedOutcome: string;
    disputeWindowSeconds: number; parties: Record<string, string>; result: { slashedBond: string; recordedScore: number; slashCount: number; stakeClosed: boolean };
    record: SignedRecord & { url: string }; receipts: { step: string; from: string; tx: string; block: number }[];
  };
  x402: X402Run[];
  mainnet: MainnetEntry[];
}

/** A Monad mainnet request (and, once answered, the verdict with the record its responseHash is bound to). */
export interface MainnetEntry {
  market_id: string;
  requestHash: `0x${string}`;
  requestTx: string | null;
  responseTx: string | null;
  responseHash: `0x${string}` | null;
  score: number | null;
  record: SignedRecord | null;
}

export const DATA = raw as unknown as BundleData;
export const byMarket = new Map(DATA.verdicts.map((v) => [v.market_id, v]));
export const mainnetByMarket = new Map((DATA.mainnet ?? []).map((v) => [v.market_id, v]));
