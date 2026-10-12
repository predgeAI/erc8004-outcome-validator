import { useEffect, useRef } from "react";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { monadTestnet } from "../lib/chain";
import { PRIVY_APP_ID, type HostProps } from "./config";

function Bridge({ onChange, autoLogin }: HostProps) {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const asked = useRef(false);
  const w = wallets[0];

  useEffect(() => {
    if (ready && autoLogin && !authenticated && !asked.current) { asked.current = true; login(); }
  }, [ready, autoLogin, authenticated, login]);

  useEffect(() => {
    onChange({
      kind: "privy", ready, authenticated,
      address: (w?.address as `0x${string}`) ?? null,
      walletLabel: w ? (w.walletClientType === "privy" ? "Privy embedded wallet" : w.walletClientType) : null,
      login, logout,
      getWalletClient: async () => {
        if (!w) throw new Error("No wallet connected");
        await w.switchChain(monadTestnet.id);
        const provider = (await w.getEthereumProvider()) as EIP1193Provider;
        return createWalletClient({ account: w.address as `0x${string}`, chain: monadTestnet, transport: custom(provider) });
      },
      error: null,
    });
  }, [ready, authenticated, w, login, logout, onChange]);
  return null;
}

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
      }}
    >
      <Bridge {...props} />
    </PrivyProvider>
  );
}
