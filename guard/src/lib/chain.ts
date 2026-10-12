import { createPublicClient, defineChain, http, parseAbi, type Hex } from "viem";
import { MONAD, PINNED_KEY as MONAD_PINNED } from "./constants";
import { canonicalJson, keccakOf, verifyEd25519, type SignedRecord } from "./verify";
import { formatEther } from "viem";
import { byMarket, DATA } from "./data";
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

export async function readOnchain(p: SignedPayload): Promise<OnchainResult | null> {
  const claim = claimOf(p);
  if (!claim) return null;
  const requestHash = requestHashOf(claim);
  const v = byMarket.get(String(p.market_id));
  const addr = MONAD.contracts.PredgeAgentValidator;
  const [st, validated, lead] = await Promise.all([
    client.readContract({ address: addr, abi: VALIDATOR_ABI, functionName: "getValidationStatus", args: [requestHash] }),
    client.readContract({ address: addr, abi: VALIDATOR_ABI, functionName: "isValidated", args: [requestHash] }),
    client.readContract({ address: addr, abi: VALIDATOR_ABI, functionName: "commitLeadTime", args: [requestHash] }),
  ]);
  const [validatorAddress, , response, responseHash, tag, lastUpdate] = st;
  const requested = Number(lastUpdate) !== 0;
  const out: OnchainResult = {
    requestHash, claim, requested, found: validated, validator: requested ? validatorAddress : null,
    validatorMatches: validatorAddress.toLowerCase() === MONAD.validator.toLowerCase(),
    score: validated ? Number(response) : null, responseHash: validated ? responseHash : null, tag: validated ? tag : null,
    lastUpdate: requested ? Number(lastUpdate) : null, leadTime: validated ? Number(lead) : null,
    bound: null, boundHash: null, hashMatches: false, boundSigOk: false, sameFacts: null, scoreConsistent: null,
    responseTx: v?.responseTx ?? null, requestTx: v?.requestTx ?? null, bond: null,
  };
  if (validated && v) {
    out.bound = v.record;
    out.boundHash = keccakOf(v.record.canonical);
    out.hashMatches = out.boundHash.toLowerCase() === responseHash.toLowerCase();
    const bp = JSON.parse(v.record.canonical) as SignedPayload;
    const outcome = bp.onchain_resolution?.outcome;
    out.scoreConsistent = outcome ? out.score === (outcome === claim.proposal ? 100 : 0) : null;
    out.boundSigOk = (await verifyEd25519(v.record)).ok && v.record.public_key === p_key(v.record);
    out.sameFacts = outcome === p.onchain_resolution?.outcome && canonicalJson(bp.disputes) === canonicalJson(p.disputes);
  }
  out.bond = await readBond(requestHash, String(p.market_id)).catch(() => null);
  return out;
}

async function readBond(requestHash: Hex, marketId: string): Promise<BondInfo | null> {
  // Production bond contract: is there a stake behind this exact request?
  const s = await client.readContract({ address: MONAD.contracts.PredgeValidatorBond, abi: BOND_ABI, functionName: "stakes", args: [requestHash] });
  if (s[1] > 0n || s[4] || s[5]) {
    const n = await client.readContract({ address: MONAD.contracts.PredgeValidatorBond, abi: BOND_ABI, functionName: "slashCount" });
    return { contract: MONAD.contracts.PredgeValidatorBond, bondMON: fmtMON(s[1]), scored: s[4], closed: s[5], score: s[3], slashCount: Number(n), demo: false };
  }
  if (marketId === DATA.slash.market) return readSlashBond();
  return null;
}

export async function readSlashBond(): Promise<BondInfo> {
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
