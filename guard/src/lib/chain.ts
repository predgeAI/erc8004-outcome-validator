import { createPublicClient, defineChain, http, parseAbi, type Hex } from "viem";
import { MONAD, MONAD_MAIN, PINNED_KEY as MONAD_PINNED } from "./constants";
import { canonicalJson, keccakOf, verifyEd25519, type SignedRecord } from "./verify";
import { formatEther } from "viem";
const bundle = () => import("./data");
import type { SignedPayload } from "./api";

export const monadTestnet = defineChain({
  id: MONAD.chainId,
  name: MONAD.name,
  nativeCurrency: { name: "Testnet MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [MONAD.rpc] } },
  blockExplorers: { default: { name: "MonadVision", url: MONAD.explorer } },
  testnet: true,
});

export const client = createPublicClient({ chain: monadTestnet, transport: http(MONAD.rpc, { batch: false, retryCount: 2 }) });

export const monadMainnet = defineChain({
  id: MONAD_MAIN.chainId,
  name: MONAD_MAIN.name,
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [MONAD_MAIN.rpc] } },
  blockExplorers: { default: { name: "MonadVision", url: MONAD_MAIN.explorer } },
});
export const mainnetClient = createPublicClient({ chain: monadMainnet, transport: http(MONAD_MAIN.rpc, { batch: false, retryCount: 2 }) });

export type Network = "mainnet" | "testnet";
/** Explorer, contract and validator of the network a verdict was read from. */
export const NET = {
  mainnet: { label: "Monad mainnet", explorer: MONAD_MAIN.explorer, validatorContract: MONAD_MAIN.contracts.PredgeAgentValidator, validator: MONAD_MAIN.validator, bond: MONAD_MAIN.contracts.PredgeValidatorBond, client: mainnetClient },
  testnet: { label: "Monad testnet", explorer: MONAD.explorer, validatorContract: MONAD.contracts.PredgeAgentValidator, validator: MONAD.validator, bond: MONAD.contracts.PredgeValidatorBond, client },
} as const;
export const netTx = (n: Network, h: string) => `${NET[n].explorer}/tx/${h}`;
export const netAddr = (n: Network, a: string) => `${NET[n].explorer}/address/${a}`;

export const VALIDATOR_ABI = parseAbi([
  "function getValidationStatus(bytes32 requestHash) view returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string tag, uint256 lastUpdate)",
  "function isValidated(bytes32 requestHash) view returns (bool)",
  "function commitLeadTime(bytes32 requestHash) view returns (uint64)",
  "function responseCount() view returns (uint64)",
  "function requestCount() view returns (uint64)",
  "function validator() view returns (address)",
  "function validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash)",
]);

export const BOND_ABI = parseAbi([
  "function stakes(bytes32) view returns (bytes32 expected, uint96 bond, uint64 stakedAt, uint8 score, bool scored, bool closed, uint256 jobId, uint64 scoredAt)",
  "function slashCount() view returns (uint64)",
  "function disputeWindow() view returns (uint64)",
]);

/** The claim an agent records before Predge answers (same derivation as monad/batch/run-batch.mjs and the SDK). */
export function claimOf(p: Pick<SignedPayload, "market_id" | "uma_question_id" | "disputes">) {
  const proposal = p.disputes?.[0]?.disputed_proposal;
  if (!proposal) return null;
  return { kind: "predge-settlement-claim-v1", platform: "polymarket", market_id: String(p.market_id), uma_question_id: String(p.uma_question_id), claim: "final on-chain outcome equals the first disputed proposal", proposal: String(proposal) };
}
export const requestHashOf = (claim: object) => keccakOf(canonicalJson(claim));

export interface OnchainResult {
  /** where this verdict (or request) was read: mainnet first, testnet as the fallback */
  network: Network;
  /** the testnet request state, for the "Request validation (testnet)" action */
  testnetRequested: boolean;
  requestHash: Hex;
  claim: ReturnType<typeof claimOf>;
  requested: boolean;
  found: boolean;
  validator: string | null;
  validatorMatches: boolean;
  score: number | null;
  responseHash: Hex | null;
  tag: string | null;
  lastUpdate: number | null;
  leadTime: number | null;
  bound: SignedRecord | null;
  boundHash: Hex | null;
  hashMatches: boolean;
  boundSigOk: boolean;
  sameFacts: boolean | null;
  scoreConsistent: boolean | null;
  responseTx: string | null;
  requestTx: string | null;
  bond: BondInfo | null;
}

export interface BondInfo { contract: Hex; bondMON: string; scored: boolean; closed: boolean; score: number; slashCount: number; demo: boolean }

const fmtMON = (wei: bigint) => formatEther(wei);

const p_key = (r: SignedRecord) => (r.public_key === MONAD_PINNED ? r.public_key : "");

type Status = { requested: boolean; validated: boolean; validator: string; response: number; responseHash: Hex; tag: string; lastUpdate: number; lead: number };
async function readStatus(n: Network, requestHash: Hex): Promise<Status> {
  const { client: c, validatorContract: address } = NET[n];
  const [st, validated, lead] = await Promise.all([
    c.readContract({ address, abi: VALIDATOR_ABI, functionName: "getValidationStatus", args: [requestHash] }),
    c.readContract({ address, abi: VALIDATOR_ABI, functionName: "isValidated", args: [requestHash] }),
    c.readContract({ address, abi: VALIDATOR_ABI, functionName: "commitLeadTime", args: [requestHash] }),
  ]);
  const [validatorAddress, , response, responseHash, tag, lastUpdate] = st;
  return { requested: Number(lastUpdate) !== 0, validated, validator: validatorAddress, response: Number(response), responseHash, tag, lastUpdate: Number(lastUpdate), lead: Number(lead) };
}

/** The record a mainnet responseHash is bound to: bundled at build time, else the snapshot published in the repo. */
async function mainnetRecord(marketId: string, responseHash: Hex): Promise<SignedRecord | null> {
  const { mainnetByMarket } = await bundle();
  const b = mainnetByMarket.get(marketId)?.record;
  if (b && keccakOf(b.canonical).toLowerCase() === responseHash.toLowerCase()) return b;
  for (const f of [`${marketId}-settled.json`, `${marketId}.json`]) {
    const a = await fetch(`${MONAD_MAIN.records}/${f}`).then((r) => (r.ok ? r.json() : null)).then((j) => j?.attestation ?? null).catch(() => null);
    if (a?.canonical && keccakOf(a.canonical).toLowerCase() === responseHash.toLowerCase()) return { public_key: a.public_key, signature: a.signature, canonical: a.canonical };
  }
  return b ?? null;
}

export async function readOnchain(p: SignedPayload): Promise<OnchainResult | null> {
  const claim = claimOf(p);
  if (!claim) return null;
  const requestHash = requestHashOf(claim);
  const marketId = String(p.market_id);
  const { byMarket, mainnetByMarket } = await bundle();
  // Monad mainnet first; a failed mainnet read falls back to testnet instead of failing the line
  const [main, test] = await Promise.all([readStatus("mainnet", requestHash).catch(() => null), readStatus("testnet", requestHash).catch((e: Error) => e)]);
  const network: Network = main && (main.requested || main.validated) ? "mainnet" : "testnet";
  if (network === "testnet" && test instanceof Error) throw test;
  const s = network === "mainnet" ? main! : (test as Status);
  const net = NET[network];
  const mv = mainnetByMarket.get(marketId);
  const tv = byMarket.get(marketId);
  const txs = network === "mainnet"
    ? { responseTx: mv?.requestHash === requestHash ? mv.responseTx : null, requestTx: mv?.requestHash === requestHash ? mv.requestTx : null }
    : { responseTx: tv?.responseTx ?? null, requestTx: tv?.requestTx ?? null };
  const out: OnchainResult = {
    network, testnetRequested: !(test instanceof Error) && test.requested,
    requestHash, claim, requested: s.requested, found: s.validated, validator: s.requested ? s.validator : null,
    validatorMatches: s.validator.toLowerCase() === net.validator.toLowerCase(),
    score: s.validated ? s.response : null, responseHash: s.validated ? s.responseHash : null, tag: s.validated ? s.tag : null,
    lastUpdate: s.requested ? s.lastUpdate : null, leadTime: s.validated ? s.lead : null,
    bound: null, boundHash: null, hashMatches: false, boundSigOk: false, sameFacts: null, scoreConsistent: null,
    ...txs, bond: null,
  };
  const rec = s.validated ? (network === "mainnet" ? await mainnetRecord(marketId, s.responseHash) : tv?.record ?? null) : null;
  if (s.validated && rec) {
    out.bound = rec;
    out.boundHash = keccakOf(rec.canonical);
    out.hashMatches = out.boundHash.toLowerCase() === s.responseHash.toLowerCase();
    const bp = JSON.parse(rec.canonical) as SignedPayload;
    const outcome = bp.onchain_resolution?.outcome;
    out.scoreConsistent = outcome ? out.score === (outcome === claim.proposal ? 100 : 0) : null;
    out.boundSigOk = (await verifyEd25519(rec)).ok && rec.public_key === p_key(rec);
    out.sameFacts = outcome === p.onchain_resolution?.outcome && canonicalJson(bp.disputes) === canonicalJson(p.disputes);
  }
  out.bond = await (network === "mainnet" ? readMainnetBond(requestHash) : readBond(requestHash, marketId)).catch(() => null);
  return out;
}

async function readMainnetBond(requestHash: Hex): Promise<BondInfo | null> {
  const s = await mainnetClient.readContract({ address: MONAD_MAIN.contracts.PredgeValidatorBond, abi: BOND_ABI, functionName: "stakes", args: [requestHash] });
  if (!(s[1] > 0n || s[4] || s[5])) return null;
  const n = await mainnetClient.readContract({ address: MONAD_MAIN.contracts.PredgeValidatorBond, abi: BOND_ABI, functionName: "slashCount" });
  return { contract: MONAD_MAIN.contracts.PredgeValidatorBond, bondMON: fmtMON(s[1]), scored: s[4], closed: s[5], score: s[3], slashCount: Number(n), demo: false };
}

async function readBond(requestHash: Hex, marketId: string): Promise<BondInfo | null> {
  // Production bond contract: is there a stake behind this exact request?
  const s = await client.readContract({ address: MONAD.contracts.PredgeValidatorBond, abi: BOND_ABI, functionName: "stakes", args: [requestHash] });
  if (s[1] > 0n || s[4] || s[5]) {
    const n = await client.readContract({ address: MONAD.contracts.PredgeValidatorBond, abi: BOND_ABI, functionName: "slashCount" });
    return { contract: MONAD.contracts.PredgeValidatorBond, bondMON: fmtMON(s[1]), scored: s[4], closed: s[5], score: s[3], slashCount: Number(n), demo: false };
  }
  const { DATA } = await bundle();
  if (marketId === DATA.slash.market) return readSlashBond();
  return null;
}

export async function readSlashBond(): Promise<BondInfo> {
  const { DATA } = await bundle();
  const b = DATA.slash.bond;
  const [s, n] = await Promise.all([
    client.readContract({ address: b, abi: BOND_ABI, functionName: "stakes", args: [DATA.slash.requestHash] }),
    client.readContract({ address: b, abi: BOND_ABI, functionName: "slashCount" }),
  ]);
  return { contract: b, bondMON: fmtMON(s[1]), scored: s[4], closed: s[5], score: s[3], slashCount: Number(n), demo: true };
}

export async function readCounts() {
  const [req, res] = await Promise.all([
    client.readContract({ address: MONAD.contracts.PredgeAgentValidator, abi: VALIDATOR_ABI, functionName: "requestCount" }),
    client.readContract({ address: MONAD.contracts.PredgeAgentValidator, abi: VALIDATOR_ABI, functionName: "responseCount" }),
  ]);
  return { requests: Number(req), responses: Number(res) };
}
