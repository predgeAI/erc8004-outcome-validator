// Network settings from https://docs.perpl.xyz/resources/for-developers/networks-and-configuration
export const NETWORKS = {
  mainnet: {
    name: "mainnet",
    chainId: 143,
    apiUrl: "https://app.perpl.xyz/api",
    wsUrl: "wss://app.perpl.xyz",
    exchange: "0x34B6552d57a35a1D042CcAe1951BD1C370112a6F",
    markets: { BTC: 1, MON: 10, ETH: 20, SOL: 31, HYPE: 40, ZEC: 50 },
  },
  testnet: {
    name: "testnet",
    chainId: 10143,
    apiUrl: "https://testnet.perpl.xyz/api",
    wsUrl: "wss://testnet.perpl.xyz",
    exchange: "0x1964C32f0bE608E7D29302AFF5E61268E72080cc",
    markets: { BTC: 16, ETH: 32, SOL: 48, MON: 64, ZEC: 256 },
  },
};

export function network(name = "mainnet") {
  const n = NETWORKS[name];
  if (!n) throw new Error(`unknown network ${name}; use mainnet or testnet`);
  return {
    ...n,
    apiUrl: process.env.PERPL_API_URL || n.apiUrl,
    wsUrl: process.env.PERPL_WS_URL || n.wsUrl,
  };
}

/** Hedger defaults. Every one can be overridden per position or on the command line. */
export const DEFAULTS = {
  volLookbackHours: 48,
  volFloor: 0.2,            // annualised; never assume less
  pinZoneMinutes: 15,       // inside this window before observation the binary delta explodes: stay flat
  rebalanceBand: 0.25,      // trade only if the hedge is off target by more than 25% of target ...
  minTradeUsd: 50,          // ... and by more than this notional
  maxHedgeUsd: 25_000,      // hard cap on hedge notional per position
  maxSlippageBps: 30,       // IOC limit price = touch +/- this
  leverage: 3,              // sent as lv (hundredths) on every order
  hedgeRatio: 1,            // 1 = full delta hedge; 0.5 = hedge half the delta
  referenceToleranceBps: 15, // Perpl close within this of the threshold: too close to call from Perpl data
};
