import { isAddressEqual, recoverTypedDataAddress, verifyTypedData, type Address, type Hex } from "viem";

/**
 * "Acknowledge risk" receipt: an EIP-712 message the signed-in user signs after a market check.
 * One definition, used by every wallet provider (Privy and Dynamic), pinned to Monad testnet.
 */
export const RECEIPT_CHAIN_ID = 10143;

export const RECEIPT_DOMAIN = { name: "Predge Guard", version: "1", chainId: RECEIPT_CHAIN_ID } as const;

export const RECEIPT_TYPES = {
  RiskAcknowledgement: [
    { name: "marketId", type: "string" },
    { name: "riskLevel", type: "string" },
    { name: "contentHash", type: "bytes32" },
    { name: "onchainVerdict", type: "string" },
    { name: "requestHash", type: "bytes32" },
    { name: "checkedAt", type: "string" },
  ],
} as const;

export const RECEIPT_PRIMARY_TYPE = "RiskAcknowledgement" as const;

/** EIP712Domain for wallets that want the domain type spelled out (Privy's signTypedData does). */
export const EIP712_DOMAIN_TYPE = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
] as const;

export interface ReceiptMessage {
  marketId: string;
  riskLevel: string;
  /** SHA-256 of the canonical signed record that was verified in the browser */
  contentHash: Hex;
  /** "100", "0", "requested" (no answer yet) or "none" */
  onchainVerdict: string;
  /** keccak256 of the canonical claim; zero when the market has no disputed proposal */
  requestHash: Hex;
  /** checked_at from the signed record */
  checkedAt: string;
}

export interface ReceiptTypedData {
  domain: typeof RECEIPT_DOMAIN;
  types: typeof RECEIPT_TYPES;
  primaryType: typeof RECEIPT_PRIMARY_TYPE;
  message: ReceiptMessage;
}

export const ZERO32 = `0x${"0".repeat(64)}` as Hex;

const as32 = (h: string | null | undefined): Hex => {
  if (!h) return ZERO32;
  const s = h.startsWith("0x") ? h.slice(2) : h;
  if (!/^[0-9a-fA-F]{64}$/.test(s)) throw new Error(`Not a 32-byte hex value: ${h}`);
  return `0x${s.toLowerCase()}` as Hex;
};

export interface ReceiptInput {
  marketId: string | number;
  riskLevel: string;
  /** sha256 of the verified record, hex with or without 0x */
  contentSha256: string;
  onchain: { found: boolean; requested: boolean; score: number | null; requestHash: string } | null;
  checkedAt: string;
}

export function buildReceipt(i: ReceiptInput): ReceiptMessage {
  const oc = i.onchain;
  const onchainVerdict = oc?.found && oc.score !== null ? String(oc.score) : oc?.requested ? "requested" : "none";
  return {
    marketId: String(i.marketId),
    riskLevel: String(i.riskLevel),
    contentHash: as32(i.contentSha256),
    onchainVerdict,
    requestHash: as32(oc?.requestHash ?? null),
    checkedAt: String(i.checkedAt),
  };
}

export function receiptTypedData(message: ReceiptMessage): ReceiptTypedData {
  return { domain: RECEIPT_DOMAIN, types: RECEIPT_TYPES, primaryType: RECEIPT_PRIMARY_TYPE, message };
}

/** Same payload as JSON for wallets that take eth_signTypedData_v4 style input (EIP712Domain included). */
export function receiptTypedDataJson(message: ReceiptMessage) {
  return {
    domain: { ...RECEIPT_DOMAIN },
    types: { EIP712Domain: [...EIP712_DOMAIN_TYPE], RiskAcknowledgement: [...RECEIPT_TYPES.RiskAcknowledgement] },
    primaryType: RECEIPT_PRIMARY_TYPE,
    message: { ...message },
  };
}

export interface ReceiptCheck { ok: boolean; recovered: Address | null; error?: string }

/** Checks the signature in the browser: recovers the signer and runs viem verifyTypedData against the expected address. */
export async function verifyReceipt(message: ReceiptMessage, signature: Hex, expected: Address): Promise<ReceiptCheck> {
  const td = receiptTypedData(message);
  try {
    const recovered = await recoverTypedDataAddress({ ...td, signature });
    const ok = await verifyTypedData({ ...td, address: expected, signature });
    return { ok: ok && isAddressEqual(recovered, expected), recovered };
  } catch (e) {
    return { ok: false, recovered: null, error: (e as Error).message.split("\n")[0] };
  }
}

export type SignTypedDataFn = (td: ReceiptTypedData) => Promise<Hex>;

export interface AckRecord {
  message: ReceiptMessage;
  signature: Hex;
  signer: Address;
  recovered: Address;
  provider: "privy" | "dynamic" | "mera";
  /** the SDK call that produced the signature, shown in the UI */
  via: string;
  signedAt: string;
  title?: string;
}

/** Signs with the given provider function, then verifies locally before returning anything. */
export async function signReceipt(sign: SignTypedDataFn, message: ReceiptMessage, signer: Address): Promise<{ signature: Hex; check: ReceiptCheck }> {
  const signature = await sign(receiptTypedData(message));
  const check = await verifyReceipt(message, signature, signer);
  if (!check.ok) throw new Error(check.error ?? `Signature did not verify (recovered ${check.recovered ?? "nothing"})`);
  return { signature, check };
}

const ACK_KEY = "guard.acks.v1";

export function loadAcks(): AckRecord[] {
  try {
    const v = JSON.parse(localStorage.getItem(ACK_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export function saveAck(a: AckRecord): AckRecord[] {
  const list = [a, ...loadAcks().filter((x) => x.signature !== a.signature)].slice(0, 100);
  try { localStorage.setItem(ACK_KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
  return list;
}

export function removeAck(signature: Hex): AckRecord[] {
  const list = loadAcks().filter((x) => x.signature !== signature);
  try { localStorage.setItem(ACK_KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
  return list;
}

/** Replaces the stored list (null clears it). Used when the passkey vault is opened or locked. */
export function replaceAcks(list: AckRecord[] | null) {
  try { if (list === null) localStorage.removeItem(ACK_KEY); else localStorage.setItem(ACK_KEY, JSON.stringify(list.slice(0, 100))); } catch { /* storage blocked */ }
}
