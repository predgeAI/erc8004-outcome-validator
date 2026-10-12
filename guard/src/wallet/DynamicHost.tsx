import { useCallback, useEffect, useRef, useState } from "react";
import { ChainEnum, DynamicContextProvider, useDynamicContext, useDynamicWaas, useIsLoggedIn, useUserWallets } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors, isEthereumWallet } from "@dynamic-labs/ethereum";
import { parseEther, type Hex, type WalletClient } from "viem";
import { MONAD } from "../lib/constants";
import { client, monadTestnet } from "../lib/chain";
import { DYNAMIC_ENV_ID, type HostProps } from "./config";
import type { ReceiptTypedData } from "./receipt";

const monadNetwork = {
  blockExplorerUrls: [MONAD.explorer],
  chainId: MONAD.chainId,
  chainName: MONAD.name,
  iconUrls: ["https://testnet.monadvision.com/favicon.ico"],
  name: MONAD.name,
  nativeCurrency: { decimals: 18, name: "Testnet MON", symbol: "MON", iconUrl: "https://testnet.monadvision.com/favicon.ico" },
  networkId: MONAD.chainId,
  rpcUrls: [MONAD.rpc],
  vanityName: "Monad Testnet",
};

function Bridge({ onChange, autoLogin }: HostProps) {
  const { primaryWallet, setShowAuthFlow, handleLogOut, sdkHasLoaded, setShowDynamicUserProfile } = useDynamicContext();
  const loggedIn = useIsLoggedIn();
  const userWallets = useUserWallets();
  const { dynamicWaasIsEnabled, createWalletAccount, getWaasWallets } = useDynamicWaas();
  const asked = useRef(false);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [tick, setTick] = useState(0);

  // Prefer the Dynamic embedded wallet when the user has one, else the primary (possibly external) wallet.
  const embeddedWallet = userWallets.find((x) => x.connector?.isEmbeddedWallet && isEthereumWallet(x));
  const wallet = embeddedWallet ?? primaryWallet;
  const embedded = Boolean(wallet?.connector?.isEmbeddedWallet);
  // Effects key on this id, not on the wallet object, so a re-created wallet object cannot loop the bridge.
  const walletId = wallet ? `${wallet.address}:${wallet.connector?.key}` : "";
  const hasEmbedded = Boolean(embeddedWallet);
  const walletRef = useRef(wallet);
  walletRef.current = wallet;

  const fns = useRef({ createWalletAccount, getWaasWallets, setShowDynamicUserProfile });
  fns.current = { createWalletAccount, getWaasWallets, setShowDynamicUserProfile };

  useEffect(() => {
    if (sdkHasLoaded && autoLogin && !loggedIn && !asked.current) { asked.current = true; setShowAuthFlow(true); }
  }, [sdkHasLoaded, autoLogin, loggedIn, setShowAuthFlow]);

  // Balance through Dynamic's wallet API (wallet.getBalance on Monad testnet), public RPC as fallback.
  useEffect(() => {
    let live = true;
    setBalance(null);
    const wallet = walletRef.current;
    if (!wallet || !loggedIn) return;
    (async () => {
      try {
        if (wallet.connector.supportsNetworkSwitching()) await wallet.switchNetwork(MONAD.chainId).catch(() => {});
        const b = await wallet.getBalance();
        if (b === undefined) throw new Error("no balance");
        if (live) setBalance(parseEther(b));
      } catch {
        const b = await client.getBalance({ address: wallet.address as Hex }).catch(() => null);
        if (live) setBalance(b);
      }
    })();
    return () => { live = false; };
  }, [walletId, loggedIn, tick]);

  const refreshBalance = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const wallet = walletRef.current;
    const walletClient = async () => {
      if (!wallet || !isEthereumWallet(wallet)) throw new Error("No EVM wallet connected");
      if (wallet.connector.supportsNetworkSwitching()) await wallet.switchNetwork(MONAD.chainId);
      return wallet.getWalletClient(String(MONAD.chainId));
    };
    const extras: { id: string; label: string; run: () => void | Promise<void> }[] = [];
    if (loggedIn && !hasEmbedded && dynamicWaasIsEnabled) {
      extras.push({ id: "dynamic-create", label: "Create Dynamic embedded wallet", run: async () => { await fns.current.createWalletAccount([ChainEnum.Evm]); } });
    }
    if (loggedIn) extras.push({ id: "dynamic-profile", label: "Open Dynamic wallet profile", run: () => fns.current.setShowDynamicUserProfile(true) });
    onChange({
      kind: "dynamic", ready: sdkHasLoaded, authenticated: loggedIn,
      address: (wallet?.address as `0x${string}`) ?? null,
      walletLabel: wallet ? (embedded ? "Dynamic embedded wallet" : wallet.connector?.name ?? "wallet") : null,
      login: () => setShowAuthFlow(true),
      logout: () => handleLogOut(),
      getWalletClient: async () => (await walletClient()) as unknown as WalletClient,
      error: null,
      embedded,
      balance,
      refreshBalance,
      signVia: "Dynamic wallet.getWalletClient().signTypedData()",
      signTypedData: async (td: ReceiptTypedData) => {
        const wc = await walletClient();
        return wc.signTypedData({ account: wc.account, domain: td.domain, types: td.types, primaryType: td.primaryType, message: td.message });
      },
      sendVia: "Dynamic wallet.getWalletClient().sendTransaction()",
      sendTx: async ({ to, data }) => {
        const wc = await walletClient();
        return wc.sendTransaction({ account: wc.account, chain: monadTestnet, to, data });
      },
      extras,
    });
  }, [sdkHasLoaded, loggedIn, walletId, embedded, hasEmbedded, dynamicWaasIsEnabled, balance, refreshBalance, setShowAuthFlow, handleLogOut, onChange]);
  return null;
}

export default function DynamicHost(props: HostProps) {
  return (
    <DynamicContextProvider
      theme="dark"
      settings={{
        environmentId: DYNAMIC_ENV_ID,
        appName: "Predge Guard",
        walletConnectors: [EthereumWalletConnectors],
        overrides: { evmNetworks: [monadNetwork] },
      }}
    >
      <Bridge {...props} />
    </DynamicContextProvider>
  );
}
