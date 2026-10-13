import type { Address } from "viem";

export const PREDGE_API = "https://api.predge.io";
export const KEYS_URL = `${PREDGE_API}/.well-known/predge-keys.json`;

/** Pinned ed25519 attestation key (kid = first 16 hex chars of the raw key). */
export const PINNED_KID = "13fa3d18a369e6c7";
export const PINNED_KEY = "13fa3d18a369e6c71bf941563ba47822b30182273d5106a0e8fb61c5016352d9";

export const MONAD = {
  chainId: 10143,
  name: "Monad Testnet",
  rpc: "https://testnet-rpc.monad.xyz",
  explorer: "https://testnet.monadvision.com",
  faucet: "https://faucet.monad.xyz",
  validator: "0x9F0Af03C5695b72903c03852f7Dd4Fe5A0d49Fc9" as Address,
  contracts: {
    PredgeAgentValidator: "0x884764736dBe1FD36291bDd3Afd50A75465F6e8A" as Address,
    AgentJob: "0x34F1ef2f39Bfdd6c10Fcaa02f5B257A5dB2e93E9" as Address,
    PredgeValidatorBond: "0x0fE4D5fF3f4392bEC36c8003079E31102a403E84" as Address,
    PredgeSettlement: "0xf4EE0Af65804D5754E59316b3DBB53D5c3AeeeF9" as Address,
  },
} as const;

/** Monad mainnet: Predge verdicts on live and recently settled disputes (monad/mainnet/live-verdicts.mjs). */
export const MONAD_MAIN = {
  chainId: 143,
  name: "Monad",
  rpc: "https://rpc.monad.xyz",
  explorer: "https://monadvision.com",
  validator: "0x9F0Af03C5695b72903c03852f7Dd4Fe5A0d49Fc9" as Address,
  contracts: {
    PredgeAgentValidator: "0xf4EE0Af65804D5754E59316b3DBB53D5c3AeeeF9" as Address,
    PredgeValidatorBond: "0xd7bC19f836a92561b368eFf34667c32cAe4E7111" as Address,
    AgentJob: "0x64668df7917A84a26d53Fff7883DD998258D6987" as Address,
    PredgeSettlement: "0xb4540AD38FE0bCd08578664151689d4E9dd67F35" as Address,
  },
  records: "https://raw.githubusercontent.com/predgeAI/erc8004-outcome-validator/main/monad/mainnet/records",
} as const;

export const REPO = "https://github.com/predgeAI/erc8004-outcome-validator";
export const POLYGONSCAN = "https://polygonscan.com";

export const tx = (h: string) => `${MONAD.explorer}/tx/${h}`;
export const mtx = (h: string) => `${MONAD_MAIN.explorer}/tx/${h}`;
export const maddr = (a: string) => `${MONAD_MAIN.explorer}/address/${a}`;
export const addr = (a: string) => `${MONAD.explorer}/address/${a}`;
export const polyTx = (h: string) => `${POLYGONSCAN}/tx/${h}`;
export const short = (h: string, n = 6) => (h && h.length > 2 * n + 2 ? `${h.slice(0, n + 2)}…${h.slice(-4)}` : h);

export const EXAMPLES = [
  { id: "1137824", label: "Montana vs Idaho O/U 151.5", note: "settled differently from the disputed proposal" },
  { id: "2169995", label: "Disputed twice, used in the slash demo", note: "disputed twice, used in the slash demo" },
];
