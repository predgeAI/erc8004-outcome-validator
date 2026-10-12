import type { Hex, WalletClient } from "viem";
import type { SignTypedDataFn } from "./receipt";

// Public identifiers (not secrets). An empty env value hides that provider.
const env = import.meta.env as Record<string, string | undefined>;
export const PRIVY_APP_ID = env.VITE_PRIVY_APP_ID ?? "cmo7lfg0f000k0cl251pk1m2o";
export const DYNAMIC_ENV_ID = env.VITE_DYNAMIC_ENV_ID ?? "bf4fc614-b0ae-4976-874e-c470659d07f7";

export type WalletKind = "privy" | "dynamic";
export const AVAILABLE: WalletKind[] = [PRIVY_APP_ID ? "privy" : null, DYNAMIC_ENV_ID ? "dynamic" : null].filter(Boolean) as WalletKind[];

export interface WalletApi {
  kind: WalletKind;
  ready: boolean;
  authenticated: boolean;
  address: `0x${string}` | null;
  /** e.g. "embedded wallet" or "MetaMask" */
  walletLabel: string | null;
  login: () => void;
  logout: () => Promise<void>;
  /** a viem wallet client on Monad testnet (switches chain first) */
  getWalletClient: () => Promise<WalletClient>;
  error: string | null;
  /** true for a wallet the provider created for the user (Privy embedded, Dynamic embedded) */
  embedded: boolean;
  /** native balance on Monad testnet in wei, null while unknown */
  balance: bigint | null;
  refreshBalance: () => void;
  /** EIP-712 signing through the provider's own SDK API */
  signTypedData: SignTypedDataFn;
  /** the SDK call behind signTypedData, shown in the UI */
  signVia: string;
  /** sends a contract call on Monad testnet through the provider's own SDK API, returns the tx hash */
  sendTx: (tx: { to: `0x${string}`; data: Hex }) => Promise<Hex>;
  /** the SDK call behind sendTx, shown in the UI */
  sendVia: string;
  /** extra provider features (export key, create embedded wallet, profile) */
  extras: { id: string; label: string; run: () => void | Promise<void> }[];
}

export interface HostProps { onChange: (api: WalletApi) => void; autoLogin: boolean }
