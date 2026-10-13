// Any-chain deposits into Monad through Aurora Intents (powered by NEAR Intents).
// With VITE_AURORA_APP_KEY (a public app key from studio.aurora.dev) quotes go through the Aurora Intents API;
// without it, through the NEAR Intents 1Click API, the same solver network. Both are CORS-open.
// Status is read by deposit address from 1Click. Nothing here signs or sends anything.
import { createPublicClient, erc20Abi, formatUnits, http, parseUnits, type Address } from "viem";

const ONECLICK = "https://1click.chaindefuser.com/v0";
const AURORA = "https://intents-api.aurora.dev/api";
const APP_KEY = (import.meta.env.VITE_AURORA_APP_KEY as string | undefined) || "";
export const INTENTS_BACKEND = APP_KEY ? "Aurora Intents API" : "NEAR Intents 1Click API";

export const MONAD_MAINNET = {
  chainId: 143,
  rpc: "https://rpc.monad.xyz",
  explorer: "https://monadvision.com",
  usdc: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" as Address,
};

export interface IntentToken { assetId: string; decimals: number; blockchain: string; symbol: string; contractAddress?: string; price?: number }
export interface Quote {
  amountIn: string; amountInFormatted: string; amountOut: string; amountOutFormatted: string; minAmountOut: string;
  timeEstimate?: number; depositAddress?: string; deadline?: string;
}
export type SwapStatus = "PENDING_DEPOSIT" | "KNOWN_DEPOSIT_TX" | "PROCESSING" | "SUCCESS" | "INCOMPLETE_DEPOSIT" | "REFUNDED" | "FAILED";
export interface StatusResp {
  status: SwapStatus;
  updatedAt: string;
  swapDetails?: {
    amountInFormatted?: string; amountOutFormatted?: string; refundReason?: string;
    originChainTxHashes?: { hash: string; explorerUrl?: string }[];
    destinationChainTxHashes?: { hash: string; explorerUrl?: string }[];
  };
}

export const ORIGINS: { id: string; label: string; evm: boolean }[] = [
  { id: "base", label: "Base", evm: true },
  { id: "arb", label: "Arbitrum", evm: true },
  { id: "eth", label: "Ethereum", evm: true },
  { id: "op", label: "Optimism", evm: true },
  { id: "pol", label: "Polygon", evm: true },
  { id: "sol", label: "Solana", evm: false },
];

async function call<T>(method: "GET" | "POST", url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: { "content-type": "application/json", accept: "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { message?: string }).message || `HTTP ${r.status}`);
  return j as T;
}

let tokenCache: Promise<IntentToken[]> | null = null;
export function intentTokens(): Promise<IntentToken[]> {
  tokenCache ??= (APP_KEY ? call<{ tokens: IntentToken[] }>("GET", `${AURORA}/tokens/${APP_KEY}`).then((j) => j.tokens) : call<IntentToken[]>("GET", `${ONECLICK}/tokens`))
    .catch((e) => { tokenCache = null; throw e; });
  return tokenCache;
}

export async function requestQuote(p: { from: string; amount: string; recipient: Address; refundTo: string; dry: boolean; asset?: "USDC" | "MON" }) {
  const list = await intentTokens();
  const origin = list.find((t) => t.blockchain === p.from && t.symbol === "USDC");
  const dest = list.find((t) => t.blockchain === "monad" && t.symbol === (p.asset ?? "USDC"));
  if (!origin || !dest) throw new Error(`route USDC on ${p.from} to Monad is not listed right now`);
  const req = {
    dry: p.dry,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: origin.assetId,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: dest.assetId,
    amount: parseUnits(p.amount, origin.decimals).toString(),
    refundTo: p.refundTo,
    refundType: "ORIGIN_CHAIN",
    recipient: p.recipient,
    recipientType: "DESTINATION_CHAIN",
    deadline: new Date(Date.now() + 60 * 60_000).toISOString(),
    referral: "predge",
  };
  const res = await call<{ quote: Quote }>("POST", APP_KEY ? `${AURORA}/quote/${APP_KEY}` : `${ONECLICK}/quote`, req);
  return { quote: res.quote, origin, dest };
}

export const swapStatus = (depositAddress: string) =>
  call<StatusResp>("GET", `${ONECLICK}/status?depositAddress=${encodeURIComponent(depositAddress)}`);

export const submitDeposit = (depositAddress: string, txHash: string) =>
  call<{ status: string }>("POST", `${ONECLICK}/deposit/submit`, { depositAddress, txHash });

const monad = createPublicClient({ transport: http(MONAD_MAINNET.rpc) });
export async function monadUsdc(addr: Address): Promise<string> {
  const v = await monad.readContract({ address: MONAD_MAINNET.usdc, abi: erc20Abi, functionName: "balanceOf", args: [addr] });
  return formatUnits(v, 6);
}
