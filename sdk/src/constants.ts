// Network and key constants. They mirror monad/deployment.json and
// https://api.predge.io/.well-known/predge-keys.json; test/offline.test.mjs checks that they still match.

export const PREDGE_API = "https://api.predge.io";

/** Pinned ed25519 attestation keys, kid -> raw 32-byte public key (hex). kid = first 16 hex chars. */
export const PINNED_KEYS: Readonly<Record<string, string>> = Object.freeze({
  "13fa3d18a369e6c7": "13fa3d18a369e6c71bf941563ba47822b30182273d5106a0e8fb61c5016352d9",
});

export const MONAD_TESTNET = Object.freeze({
  chainId: 10143,
  caip2: "eip155:10143",
  rpcUrl: "https://testnet-rpc.monad.xyz",
  explorer: "https://testnet.monadvision.com",
  /** Predge validator key that writes verdicts. */
  validator: "0x9F0Af03C5695b72903c03852f7Dd4Fe5A0d49Fc9",
  contracts: Object.freeze({
    PredgeAgentValidator: "0x884764736dBe1FD36291bDd3Afd50A75465F6e8A",
    AgentJob: "0x34F1ef2f39Bfdd6c10Fcaa02f5B257A5dB2e93E9",
    PredgeValidatorBond: "0x0fE4D5fF3f4392bEC36c8003079E31102a403E84",
    PredgeSettlement: "0xf4EE0Af65804D5754E59316b3DBB53D5c3AeeeF9",
    /** ERC-8004 ValidationRegistry reference deployment (not listed as canonical for Monad testnet). */
    ValidationRegistry: "0x8004Cb1BF31DAf7788923b405b754f57acEB4272",
  }),
  usdc: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
  x402Facilitator: "https://x402-facilitator.molandak.org",
});

/**
 * Where bound records for on-chain verdicts can be looked up. The data file of the verdict board
 * (built by monad/board/). It is not trusted: every record from it is checked against the pinned
 * key and against responseHash on chain.
 */
export const BOARD_DATA_URL = "https://predgeai.github.io/erc8004-outcome-validator/board-data.json";

export const VALIDATION_STATUS_ABI = [
  "function getValidationStatus(bytes32) view returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string tag, uint256 lastUpdate)",
] as const;
