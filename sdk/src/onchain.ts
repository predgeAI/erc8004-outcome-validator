import { readFile } from "node:fs/promises";
import { ethers } from "ethers";
import { BOARD_DATA_URL, MONAD_TESTNET, VALIDATION_STATUS_ABI } from "./constants.js";
import { canonicalJson, type SignedRecord, verifyRecord } from "./verify.js";
import { checkMarketId, getSettlementRisk, type FetchOptions } from "./risk.js";

/** The claim an agent records before Predge answers (monad/batch/run-batch.mjs). */
export interface SettlementClaim {
  kind: "predge-settlement-claim-v1";
  platform: "polymarket";
  market_id: string;
  uma_question_id: string;
  claim: "final on-chain outcome equals the first disputed proposal";
  proposal: string;
}

export function claimFromPayload(p: Record<string, any>): SettlementClaim {
  const proposal = p?.disputes?.[0]?.disputed_proposal;
  if (!proposal) throw new Error(`market ${p?.market_id} has no disputed proposal, so no Predge verdict exists for it`);
  return { kind: "predge-settlement-claim-v1", platform: "polymarket", market_id: String(p.market_id), uma_question_id: String(p.uma_question_id), claim: "final on-chain outcome equals the first disputed proposal", proposal: String(proposal) };
}

/** requestHash = keccak256(canonical JSON of the claim). */
export function requestHashOf(claim: SettlementClaim): string {
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalJson(claim)));
}

/** responseHash = keccak256(the exact signed bytes the verdict is bound to). */
export function responseHashOf(rec: Pick<SignedRecord, "canonical">): string {
  return ethers.keccak256(ethers.toUtf8Bytes(rec.canonical));
}

export interface BoundEntry { market_id: string; requestHash: string; responseHash?: string; responseTx?: string; record: SignedRecord }

/** A source of bound records: a board-data.json URL or file path, or entries already in memory. */
export type BoundSource = string | BoundEntry[];

const boardCache = new Map<string, Promise<BoundEntry[]>>();
export async function loadBoundEntries(source: BoundSource = BOARD_DATA_URL, fetchImpl: typeof fetch = fetch): Promise<BoundEntry[]> {
  if (Array.isArray(source)) return source;
  if (!boardCache.has(source)) {
    boardCache.set(source, (async () => {
      const text = /^https?:\/\//.test(source) ? await (await fetchImpl(source)).text() : await readFile(source, "utf8");
      const data = JSON.parse(text);
      return (data.verdicts ?? []).filter((v: any) => v?.record?.canonical) as BoundEntry[];
    })().catch((e) => { boardCache.delete(source); throw e; }));
  }
  return boardCache.get(source)!;
}

export interface OnchainOptions extends FetchOptions {
  rpcUrl?: string;
  /** PredgeAgentValidator (default) or any contract with the ERC-8004 getValidationStatus view */
  contract?: string;
  /** validator address the verdict must come from; default Predge's Monad testnet validator */
  expectedValidator?: string;
  /** the signed record the verdict should be bound to, if the caller already has it */
  boundRecord?: SignedRecord;
  /** where to look up the bound record otherwise; default the verdict board data file */
  boundSource?: BoundSource;
  provider?: ethers.Provider;
}

export interface OnchainVerdict {
  found: boolean;
  chainId: number;
  contract: string;
  requestHash: string;
  validator: string | null;
  /** 0..100 */
  score: number | null;
  responseHash: string | null;
  tag: string | null;
  lastUpdate: number | null;
  /** responseHash == keccak256(signed bytes) and those bytes verify against the pinned key */
  bound: boolean;
  /** for a settlement claim: the score agrees with the bound record (100 iff outcome == proposal) */
  scoreConsistent: boolean | null;
  validatorMatches: boolean;
  claim: SettlementClaim | null;
  boundRecord: SignedRecord | null;
  responseTx: string | null;
  explorerUrl: string | null;
  problems: string[];
}

const ZERO = ethers.ZeroAddress;
const isHash = (s: string) => /^0x[0-9a-fA-F]{64}$/.test(s);

/**
 * Read Predge's verdict for a market (or a requestHash) from PredgeAgentValidator on Monad testnet and
 * confirm that its responseHash equals keccak256 of a signed record that verifies against the pinned key.
 */
export async function getOnchainVerdict(marketIdOrRequestHash: string | number, opts: OnchainOptions = {}): Promise<OnchainVerdict> {
  const input = String(marketIdOrRequestHash);
  const contract = ethers.getAddress(opts.contract ?? MONAD_TESTNET.contracts.PredgeAgentValidator);
  const expectedValidator = ethers.getAddress(opts.expectedValidator ?? MONAD_TESTNET.validator);
  const provider = opts.provider ?? new ethers.JsonRpcProvider(opts.rpcUrl ?? MONAD_TESTNET.rpcUrl, undefined, { staticNetwork: ethers.Network.from(BigInt(MONAD_TESTNET.chainId)), batchMaxCount: 1 });
  const problems: string[] = [];

  // 1. requestHash and, if we can, the candidate bound record
  let entry: BoundEntry | undefined;
  let candidates: SignedRecord[] = opts.boundRecord ? [opts.boundRecord] : [];
  let claim: SettlementClaim | null = null;
  let requestHash: string;
  const lookup = async (pred: (e: BoundEntry) => boolean) => {
    try { return (await loadBoundEntries(opts.boundSource, opts.fetch)).find(pred); } catch (e) { problems.push(`bound record lookup failed: ${(e as Error).message}`); return undefined; }
  };
  if (isHash(input)) {
    requestHash = input.toLowerCase();
    if (!candidates.length) { entry = await lookup((e) => e.requestHash.toLowerCase() === requestHash); if (entry) candidates = [entry.record]; }
  } else {
    const id = checkMarketId(input);
    if (!candidates.length) { entry = await lookup((e) => e.market_id === id); if (entry) candidates = [entry.record]; }
    // the claim fields (market, UMA question, first disputed proposal) do not change once disputed,
    // so the live record gives the same requestHash when no bound record is at hand
    const src = candidates[0] ?? (await getSettlementRisk(id, opts)).record;
    claim = claimFromPayload(JSON.parse(src.canonical));
    requestHash = requestHashOf(claim);
  }

  // 2. chain read
  const c = new ethers.Contract(contract, VALIDATION_STATUS_ABI, provider);
  const s = await c.getValidationStatus(requestHash);
  const validator = s.validatorAddress as string;
  const base: OnchainVerdict = { found: false, chainId: MONAD_TESTNET.chainId, contract, requestHash, validator: null, score: null, responseHash: null, tag: null, lastUpdate: null, bound: false, scoreConsistent: null, validatorMatches: false, claim, boundRecord: null, responseTx: entry?.responseTx ?? null, explorerUrl: entry?.responseTx ? `${MONAD_TESTNET.explorer}/tx/${entry.responseTx}` : null, problems };
  if (validator === ZERO || Number(s.lastUpdate) === 0) { problems.push("no verdict on chain for this requestHash"); return base; }
  const out: OnchainVerdict = { ...base, found: true, validator, score: Number(s.response), responseHash: String(s.responseHash).toLowerCase(), tag: s.tag, lastUpdate: Number(s.lastUpdate) };
  out.validatorMatches = ethers.getAddress(validator) === expectedValidator;
  if (!out.validatorMatches) problems.push(`verdict written by ${validator}, expected ${expectedValidator}`);

  // 3. binding: responseHash == keccak256(signed bytes), and those bytes verify
  for (const rec of candidates) {
    if (responseHashOf(rec).toLowerCase() !== out.responseHash) continue;
    const v = verifyRecord(rec, opts.pinnedKeys);
    if (!v.ok) { problems.push(`bound record does not verify: ${JSON.stringify(v.checks)}`); continue; }
    out.bound = true;
    out.boundRecord = rec;
    const p = v.payload as Record<string, any>;
    if (!claim) { try { claim = claimFromPayload(p); out.claim = claim; } catch { /* not a settlement claim */ } }
    if (claim && requestHashOf(claim) === requestHash) {
      const outcome = p?.onchain_resolution?.outcome;
      out.scoreConsistent = outcome ? out.score === (outcome === claim.proposal ? 100 : 0) : null;
      if (out.scoreConsistent === false) problems.push(`score ${out.score} does not match the bound record (outcome ${outcome}, proposal ${claim.proposal})`);
    }
    break;
  }
  if (!out.bound) problems.push(candidates.length ? "responseHash does not equal keccak256 of the candidate signed record" : "no signed record found to check responseHash against");
  return out;
}
