// Pay per call with USDC on Monad testnet through Monad's x402 facilitator (x402 v2, scheme "exact"),
// the same client setup as monad/x402/agent.mjs. This module never reads or stores keys: the caller
// passes a viem account (or any x402 EVM signer) it already manages.
import { ethers } from "ethers";
import { MONAD_TESTNET } from "./constants.js";
import { responseHashOf } from "./onchain.js";
import { extractRecord, parseSettlementRisk, checkMarketId, type SettlementRisk } from "./risk.js";
import { verifyRecord, type SignedRecord } from "./verify.js";

/** Default resource server: the Monad x402 demo server (monad/x402/server.mjs) run locally. */
export const DEFAULT_X402_BASE = "http://localhost:4021";

export interface X402Quote { status: number; accepts: Array<{ scheme: string; network: string; asset: string; amount: string; payTo: string; maxTimeoutSeconds?: number }> }

/** The unpaid request: returns what the server asks for (HTTP 402 and its `accepts`). Pays nothing. */
export async function quoteSettlementRisk(marketId: string | number, baseUrl = DEFAULT_X402_BASE, fetchImpl: typeof fetch = fetch): Promise<X402Quote> {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/v1/settlement-risk/${checkMarketId(marketId)}`);
  const hdr = res.headers.get("payment-required");
  const req = hdr ? JSON.parse(Buffer.from(hdr, "base64").toString("utf8")) : {};
  return { status: res.status, accepts: req.accepts ?? [] };
}

/**
 * A fetch that pays x402 challenges on Monad testnet. `signer` is a viem LocalAccount (for example
 * privateKeyToAccount(...) from your own key store). Needs the optional deps @x402/fetch and @x402/evm.
 */
export async function createMonadPayingFetch(signer: unknown, baseFetch: typeof fetch = fetch): Promise<typeof fetch> {
  const [{ wrapFetchWithPayment, x402Client }, { ExactEvmScheme }] = await Promise.all([import("@x402/fetch"), import("@x402/evm/exact/client")]);
  const client = new x402Client();
  client.register(MONAD_TESTNET.caip2 as `${string}:${string}`, new ExactEvmScheme(signer as any));
  return wrapFetchWithPayment(baseFetch, client) as typeof fetch;
}

export interface PaidSettlementRisk {
  risk: SettlementRisk;
  /** decoded `payment-response` header (settlement tx on Monad) */
  settlement: Record<string, unknown>;
  /** the server's on-chain verdict, re-read on Monad and checked against the signed bytes it is bound to */
  onchainVerdict: null | { response: number; responseHash: string; responseTx?: string; bound: boolean };
}

/** Pay for one Settlement Risk call on Monad, then verify what was bought before returning it. */
export async function getSettlementRiskPaid(marketId: string | number, opts: { payingFetch: typeof fetch; baseUrl?: string; rpcUrl?: string; pinnedKeys?: Readonly<Record<string, string>> }): Promise<PaidSettlementRisk> {
  const id = checkMarketId(marketId);
  const url = `${(opts.baseUrl ?? DEFAULT_X402_BASE).replace(/\/$/, "")}/v1/settlement-risk/${id}`;
  const res = await opts.payingFetch(url);
  if (!res.ok) throw new Error(`paid GET ${url}: HTTP ${res.status}`);
  const hdr = res.headers.get("payment-response");
  const settlement = hdr ? JSON.parse(Buffer.from(hdr, "base64").toString("utf8")) : {};
  const body = await res.json();
  const risk = parseSettlementRisk(extractRecord(body), url, opts.pinnedKeys);
  let onchainVerdict: PaidSettlementRisk["onchainVerdict"] = null;
  const v = body.onchainVerdict;
  if (v) {
    // do not trust the server's copy of the chain: read responseHash from Monad ourselves
    const provider = new ethers.JsonRpcProvider(opts.rpcUrl ?? MONAD_TESTNET.rpcUrl, undefined, { staticNetwork: ethers.Network.from(BigInt(MONAD_TESTNET.chainId)) });
    const c = new ethers.Contract(MONAD_TESTNET.contracts.PredgeAgentValidator, ["function getValidationStatus(bytes32) view returns (address,uint256,uint8,bytes32,string,uint256)"], provider);
    const s = await c.getValidationStatus(v.requestHash);
    const rec = v.boundRecord as SignedRecord;
    const bound = verifyRecord(rec, opts.pinnedKeys).ok && responseHashOf(rec).toLowerCase() === String(s[3]).toLowerCase();
    onchainVerdict = { response: Number(s[2]), responseHash: String(s[3]), responseTx: v.responseTx, bound };
  }
  return { risk, settlement, onchainVerdict };
}
