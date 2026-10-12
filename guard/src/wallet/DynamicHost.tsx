import { useEffect, useRef } from "react";
import { DynamicContextProvider, useDynamicContext, useIsLoggedIn } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors, isEthereumWallet } from "@dynamic-labs/ethereum";
import type { WalletClient } from "viem";
import { MONAD } from "../lib/constants";
import { DYNAMIC_ENV_ID, type HostProps } from "./config";

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
  const { primaryWallet, setShowAuthFlow, handleLogOut, sdkHasLoaded } = useDynamicContext();
  const loggedIn = useIsLoggedIn();
  const asked = useRef(false);

  useEffect(() => {
    if (sdkHasLoaded && autoLogin && !loggedIn && !asked.current) { asked.current = true; setShowAuthFlow(true); }
  }, [sdkHasLoaded, autoLogin, loggedIn, setShowAuthFlow]);

  useEffect(() => {
    onChange({
      kind: "dynamic", ready: sdkHasLoaded, authenticated: loggedIn,
      address: (primaryWallet?.address as `0x${string}`) ?? null,
      walletLabel: primaryWallet ? primaryWallet.connector?.name ?? "wallet" : null,
      login: () => setShowAuthFlow(true),
      logout: () => handleLogOut(),
      getWalletClient: async () => {
        if (!primaryWallet || !isEthereumWallet(primaryWallet)) throw new Error("No EVM wallet connected");
        if (primaryWallet.connector.supportsNetworkSwitching()) await primaryWallet.switchNetwork(MONAD.chainId);
        return (await primaryWallet.getWalletClient(String(MONAD.chainId))) as unknown as WalletClient;
      },
      error: null,
    });
  }, [sdkHasLoaded, loggedIn, primaryWallet, setShowAuthFlow, handleLogOut, onChange]);
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
