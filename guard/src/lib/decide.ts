import type { SignedPayload } from "./api";
import type { OnchainResult } from "./chain";

export interface Decision { safe: boolean; tone: "go" | "wait" | "stop"; headline: string; detail: string; line: string }

const RISK_ORDER: Record<string, number> = { resolved: 0, ok: 1, watch: 2, caution: 3 };

/**
 * Same rule as isSafeToAct() in the SDK with its defaults (maxRisk "resolved"): act only on a final
 * on-chain outcome, and refuse if an on-chain verdict exists but is not bound to verifiable signed evidence.
 */
export function decide(p: SignedPayload, evidenceOk: boolean, oc: OnchainResult | null | undefined): Decision {
  if (!evidenceOk) return { safe: false, tone: "stop", headline: "Do not act", detail: "The evidence did not verify in this browser.", line: "refuse: evidence did not verify" };
  if (oc?.found && !(oc.hashMatches && oc.validatorMatches && oc.scoreConsistent !== false)) {
    return { safe: false, tone: "stop", headline: "Do not act", detail: "The on-chain verdict is not bound to verifiable signed evidence.", line: "refuse: on-chain verdict is not bound to verifiable signed evidence" };
  }
  const level = String(p.risk_level);
  const within = (RISK_ORDER[level] ?? 99) <= RISK_ORDER.resolved;
  const outcome = p.onchain_resolution?.outcome ?? null;
  const proposal = p.disputes?.[0]?.disputed_proposal ?? null;
  if (!within) {
    return { safe: false, tone: "wait", headline: "Wait", detail: p.recommendation, line: `wait: risk ${level} is above resolved. ${p.recommendation}` };
  }
  const v = oc?.found ? `; on-chain verdict ${oc.score} bound to the signed record` : "";
  let detail = `The outcome ${outcome} is final on chain.`;
  if (proposal && outcome && proposal !== outcome) detail += ` The disputed proposal ${proposal} did not hold, so an agent acting on it would have been wrong.`;
  else if (proposal && outcome) detail += ` It matches the disputed proposal.`;
  return { safe: true, tone: "go", headline: outcome ? `Safe to act on ${outcome}` : "Safe to act", detail, line: `act: risk ${level} within resolved${outcome ? `, final outcome ${outcome}` : ""}${v}` };
}

export const RISK_LABEL: Record<string, { label: string; tone: "ok" | "warn" | "bad" }> = {
  resolved: { label: "Final", tone: "ok" },
  ok: { label: "Low", tone: "ok" },
  watch: { label: "Watch", tone: "warn" },
  caution: { label: "Caution", tone: "bad" },
};
