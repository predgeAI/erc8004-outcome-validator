import { useCallback, useEffect, useRef, useState } from "react";
import { PrivyProvider, useExportWallet, usePrivy, useSendTransaction, useSignTypedData, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, type EIP1193Provider, type Hex } from "viem";
import { client, monadTestnet } from "../lib/chain";
import { PRIVY_APP_ID, type HostProps } from "./config";
import { receiptTypedDataJson, type ReceiptTypedData } from "./receipt";

function Bridge({ onChange, autoLogin }: HostProps) {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  // Privy APIs beyond login: typed-data signing, transactions and key export on the embedded wallet.
  const { signTypedData } = useSignTypedData();
  const { sendTransaction } = useSendTransaction();
  const { exportWallet } = useExportWallet();
  const asked = useRef(false);
  // Prefer the embedded wallet Privy created on login; fall back to a linked external wallet.
  const w = wallets.find((x) => x.walletClientType === "privy") ?? wallets[0];
  const embedded = w?.walletClientType === "privy";
  const [balance, setBalance] = useState<bigint | null>(null);
  const [tick, setTick] = useState(0);

  // Hook functions can change identity between renders; keep them in a ref so the bridge stays stable.
  const fns = useRef({ signTypedData, sendTransaction, exportWallet });
  fns.current = { signTypedData, sendTransaction, exportWallet };

  useEffect(() => {
    if (ready && autoLogin && !authenticated && !asked.current) { asked.current = true; login(); }
  }, [ready, autoLogin, authenticated, login]);

  // Balance read through the Privy wallet's own provider, with the public RPC as fallback.
  useEffect(() => {
    let live = true;
    setBalance(null);
    if (!w || !authenticated) return;
    (async () => {
      try {
        if (embedded) await w.switchChain(monadTestnet.id).catch(() => {});
        const p = (await w.getEthereumProvider()) as EIP1193Provider;
        const hex = (await p.request({ method: "eth_getBalance", params: [w.address as Hex, "latest"] })) as Hex;
        if (live) setBalance(BigInt(hex));
      } catch {
        const b = await client.getBalance({ address: w.address as Hex }).catch(() => null);
        if (live) setBalance(b);
      }
    })();
    return () => { live = false; };
  }, [w, embedded, authenticated, tick]);

  const refreshBalance = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const viemClient = async () => {
      if (!w) throw new Error("No wallet connected");
      await w.switchChain(monadTestnet.id);
      const provider = (await w.getEthereumProvider()) as EIP1193Provider;
      return createWalletClient({ account: w.address as `0x${string}`, chain: monadTestnet, transport: custom(provider) });
    };
    onChange({
      kind: "privy", ready, authenticated,
      address: (w?.address as `0x${string}`) ?? null,
      walletLabel: w ? (embedded ? "Privy embedded wallet" : w.walletClientType) : null,
      login, logout,
      getWalletClient: viemClient,
      error: null,
      embedded,
      balance,
      refreshBalance,
      signVia: embedded ? "Privy useSignTypedData()" : "viem signTypedData via the Privy wallet provider",
      signTypedData: async (td: ReceiptTypedData) => {
        if (!w) throw new Error("No wallet connected");
        if (!embedded) {
          const wc = await viemClient();
          return wc.signTypedData({ account: w.address as Hex, ...td });
        }
        const { signature } = await fns.current.signTypedData(receiptTypedDataJson(td.message), {
          address: w.address,
          uiOptions: { title: "Acknowledge settlement risk", description: `Signs a receipt for market ${td.message.marketId} on Monad testnet. No gas, no transaction.`, buttonText: "Sign receipt" },
        });
        return signature as Hex;
      },
      sendVia: embedded ? "Privy useSendTransaction()" : "viem sendTransaction via the Privy wallet provider",
      sendTx: async ({ to, data }) => {
        if (!w) throw new Error("No wallet connected");
        if (!embedded) {
          const wc = await viemClient();
          return wc.sendTransaction({ account: w.address as Hex, chain: monadTestnet, to, data });
        }
        const { hash } = await fns.current.sendTransaction(
          { to, data, chainId: monadTestnet.id },
          { address: w.address, uiOptions: { description: "Records a validation request for this market on Monad testnet. Gas is paid in testnet MON.", buttonText: "Send request" } },
        );
        return hash;
      },
      extras: embedded && w ? [{ id: "privy-export", label: "Export embedded wallet key", run: () => fns.current.exportWallet({ address: w.address }) }] : [],
    });
  }, [ready, authenticated, w, embedded, balance, refreshBalance, login, logout, onChange]);
  return null;
}

// Solana login is on for the shared Privy app (predge.io uses it). Guard is EVM only, so it passes an
// empty Solana connector list; without one Privy warns on every render.
const NO_SOLANA_WALLETS = { onMount: () => {}, onUnmount: () => {}, get: () => [] };

export default function PrivyHost(props: HostProps) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: { theme: "dark", accentColor: "#34d399", landingHeader: "Sign in to Predge Guard", walletChainType: "ethereum-only" },
        loginMethods: ["email", "wallet"],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
        externalWallets: { solana: { connectors: NO_SOLANA_WALLETS } },
      }}
    >
      <Bridge {...props} />
    </PrivyProvider>
  );
}
