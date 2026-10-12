// Read Predge's verdict for a market from Monad and check that it is bound to signed evidence:
// responseHash on chain == keccak256(signed record bytes), and those bytes verify against the
// pinned key. Read-only (eth_call). The chain client is the host's ctx.publicClient(chainId) when
// the CLI provides one, otherwise a plain viem client on Monad's public RPC.

import { createPublicClient, http, keccak256, toBytes, type Hex } from "viem";
import {
  BOARD_DATA_URL,
  claimFromPayload,
  loadBoundEntries,
  MONAD_TESTNET,
  PINNED_KEYS,
  requestHashOf,
  type SignedRecord,
  verifyRecord,
} from "../../../sdk/src/index.js";
import { type FetchLike, getJson } from "./http.js";

export const MONAD_MAINNET = Object.freeze({
  chainId: 143,
  rpcUrl: "https://rpc.monad.xyz",
  explorer: "https://monadvision.com",
  validationRegistry: "0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58",
});

/**
 * Verdicts on Monad mainnet's ERC-8004 ValidationRegistry (monad/mainnet/verdict-*.json). The
 * requestHash there commits to a claim that names the record URI, so it is listed, not derived.
 */
export const MAINNET_VERDICTS: Readonly<Record<string, { requestHash: Hex; recordUrl: string; responseTx: string }>> = Object.freeze({
  "1112268": {
    requestHash: "0x602f611a1fa9d37865d5f0802698a02c89eb5befd88683f7ef465fd57923ac79",
    recordUrl: "https://raw.githubusercontent.com/predgeAI/erc8004-outcome-validator/main/monad/mainnet/record-1112268.json",
    responseTx: "0xbd6ff81a066d99be913bfcace9a743a3701e2802297cab86a290d0bef9ccae28",
  },
});

const VALIDATION_STATUS_ABI = [
  {
    type: "function",
    name: "getValidationStatus",
    stateMutability: "view",
    inputs: [{ name: "requestHash", type: "bytes32" }],
    outputs: [
      { name: "validatorAddress", type: "address" },
      { name: "agentId", type: "uint256" },
      { name: "response", type: "uint8" },
      { name: "responseHash", type: "bytes32" },
      { name: "tag", type: "string" },
      { name: "lastUpdate", type: "uint256" },
    ],
  },
] as const;

/** The one method we need from a viem PublicClient. */
export interface ReadClient {
  readContract(args: { address: Hex; abi: typeof VALIDATION_STATUS_ABI; functionName: "getValidationStatus"; args: readonly [Hex] }): Promise<readonly [Hex, bigint, number, Hex, string, bigint]>;
}

/** Returns a client for a chain plus a label saying where it came from. */
export type ClientFactory = (chainId: number) => { client: ReadClient; via: string };

export function publicRpcFactory(): ClientFactory {
  return (chainId) => {
    const rpc = chainId === 143 ? MONAD_MAINNET.rpcUrl : MONAD_TESTNET.rpcUrl;
    return { client: createPublicClient({ transport: http(rpc, { timeout: 20_000 }) }) as unknown as ReadClient, via: rpc };
  };
}

export interface ChainVerdict {
  chainId: number;
  network: string;
  contract: string;
  requestHash: string;
  found: boolean;
  /** 0..100: 100 = the market settled as the disputed proposal, 0 = it did not */
  score: number | null;
  validator: string | null;
  validatorMatches: boolean;
  responseHash: string | null;
  tag: string | null;
  lastUpdate: string | null;
  bound: boolean;
  scoreConsistent: boolean | null;
  explorerUrl: string;
  via: string;
  problems: string[];
}

const ZERO = "0x0000000000000000000000000000000000000000";

async function readStatus(factory: ClientFactory, fallback: ClientFactory, chainId: number, contract: Hex, requestHash: Hex) {
  const call = (c: ReadClient) => c.readContract({ address: contract, abi: VALIDATION_STATUS_ABI, functionName: "getValidationStatus", args: [requestHash] });
  const first = factory(chainId);
  try {
    return { s: await call(first.client), via: first.via };
  } catch (e) {
    const fb = fallback(chainId);
    if (fb.via === first.via) throw e;
    return { s: await call(fb.client), via: `${fb.via} (host client failed: ${(e as Error).message.split("\n")[0].slice(0, 120)})` };
  }
}

function bind(out: ChainVerdict, s: readonly [Hex, bigint, number, Hex, string, bigint], records: SignedRecord[], expectedProposal: string | null) {
  const [validator, , response, responseHash, tag, lastUpdate] = s;
  if (validator.toLowerCase() === ZERO || lastUpdate === 0n) { out.problems.push("no verdict on chain for this requestHash"); return out; }
  out.found = true;
  out.validator = validator;
  out.score = Number(response);
  out.responseHash = responseHash.toLowerCase();
  out.tag = tag;
  out.lastUpdate = new Date(Number(lastUpdate) * 1000).toISOString();
  out.validatorMatches = validator.toLowerCase() === MONAD_TESTNET.validator.toLowerCase();
  if (!out.validatorMatches) out.problems.push(`verdict written by ${validator}, expected Predge validator ${MONAD_TESTNET.validator}`);
  for (const rec of records) {
    if (keccak256(toBytes(rec.canonical)).toLowerCase() !== out.responseHash) continue;
    const v = verifyRecord(rec, PINNED_KEYS);
    if (!v.ok) { out.problems.push(`bound record does not verify: ${JSON.stringify(v.checks)}`); continue; }
    out.bound = true;
    const outcome = (v.payload as any)?.onchain_resolution?.outcome;
    if (expectedProposal && outcome) {
      out.scoreConsistent = out.score === (outcome === expectedProposal ? 100 : 0);
      if (!out.scoreConsistent) out.problems.push(`score ${out.score} does not match the bound record (outcome ${outcome}, disputed proposal ${expectedProposal})`);
    }
    break;
  }
  if (!out.bound) out.problems.push(records.length ? "responseHash is not keccak256 of a signed record that verifies" : "no signed record found to check responseHash against");
  return out;
}

/**
 * Testnet: PredgeAgentValidator verdict on the claim "final outcome == first disputed proposal".
 * Exists only for disputed markets Predge has scored. Returns null when the market has no disputed
 * proposal (then there is no claim to score).
 */
export async function readTestnetVerdict(signed: Record<string, any>, factory: ClientFactory, opts: { fetch?: FetchLike; boardUrl?: string } = {}): Promise<ChainVerdict | null> {
  let claim;
  try { claim = claimFromPayload(signed); } catch { return null; }
  const requestHash = requestHashOf(claim) as Hex;
  const contract = MONAD_TESTNET.contracts.PredgeAgentValidator as Hex;
  const out: ChainVerdict = {
    chainId: MONAD_TESTNET.chainId, network: "Monad testnet", contract, requestHash, found: false, score: null, validator: null, validatorMatches: false,
    responseHash: null, tag: null, lastUpdate: null, bound: false, scoreConsistent: null,
    explorerUrl: `${MONAD_TESTNET.explorer}/address/${contract}`, via: "", problems: [],
  };
  const { s, via } = await readStatus(factory, publicRpcFactory(), MONAD_TESTNET.chainId, contract, requestHash);
  out.via = via;
  let records: SignedRecord[] = [];
  try {
    const entries = await loadBoundEntries(opts.boardUrl ?? BOARD_DATA_URL, opts.fetch ?? fetch);
    const hit = entries.find((e) => e.market_id === String(signed.market_id) || e.requestHash?.toLowerCase() === requestHash.toLowerCase());
    if (hit) { records = [hit.record]; if (hit.responseTx) out.explorerUrl = `${MONAD_TESTNET.explorer}/tx/${hit.responseTx}`; }
  } catch (e) {
    out.problems.push(`bound record lookup failed: ${(e as Error).message}`);
  }
  return bind(out, s, records, claim.proposal);
}

/** Mainnet: the ERC-8004 ValidationRegistry verdicts listed in MAINNET_VERDICTS. */
export async function readMainnetVerdict(marketId: string, factory: ClientFactory, opts: { fetch?: FetchLike } = {}): Promise<ChainVerdict | null> {
  const known = MAINNET_VERDICTS[marketId];
  if (!known) return null;
  const contract = MONAD_MAINNET.validationRegistry as Hex;
  const out: ChainVerdict = {
    chainId: MONAD_MAINNET.chainId, network: "Monad mainnet", contract, requestHash: known.requestHash, found: false, score: null, validator: null, validatorMatches: false,
    responseHash: null, tag: null, lastUpdate: null, bound: false, scoreConsistent: null,
    explorerUrl: `${MONAD_MAINNET.explorer}/tx/${known.responseTx}`, via: "", problems: [],
  };
  const { s, via } = await readStatus(factory, publicRpcFactory(), MONAD_MAINNET.chainId, contract, known.requestHash);
  out.via = via;
  let records: SignedRecord[] = [];
  try { records = [await getJson<SignedRecord>(known.recordUrl, { fetch: opts.fetch, timeoutMs: 20_000 })]; } catch (e) { out.problems.push(`record fetch failed: ${(e as Error).message}`); }
  return bind(out, s, records, null);
}
