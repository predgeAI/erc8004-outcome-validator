import { getOnchainVerdict, type OnchainOptions, type OnchainVerdict } from "./onchain.js";
import { getSettlementRisk, RISK_ORDER, type RiskLevel, type SettlementRisk } from "./risk.js";

export interface SafeToActOptions extends OnchainOptions {
  /** highest risk level the agent accepts; default "resolved" (act only on a final on-chain outcome) */
  maxRisk?: RiskLevel;
  /** the outcome the agent is about to act on; if set and the market is resolved, it must match */
  outcome?: string;
  /** refuse if the signed record was checked longer ago than this */
  maxAgeSeconds?: number;
  /** refuse if there is no on-chain verdict bound to signed evidence; default false */
  requireOnchainVerdict?: boolean;
  /** skip the chain read (faster; the decision then rests on the signed record only) */
  skipOnchain?: boolean;
  now?: () => number;
}

export interface SafeToActDecision {
  safe: boolean;
  /** one line an agent can log */
  reason: string;
  marketId: string;
  riskLevel: RiskLevel | null;
  maxRisk: RiskLevel;
  outcome: string | null;
  risk: SettlementRisk | null;
  verdict: OnchainVerdict | null;
  checks: Record<string, boolean>;
}

/** One call before acting: signed record + on-chain verdict, combined into a yes or no with a reason. */
export async function isSafeToAct(marketId: string | number, opts: SafeToActOptions = {}): Promise<SafeToActDecision> {
  const maxRisk: RiskLevel = opts.maxRisk ?? "resolved";
  if (!(maxRisk in RISK_ORDER)) throw new Error(`maxRisk must be one of ${Object.keys(RISK_ORDER).join(", ")}`);
  const id = String(marketId);
  const no = (reason: string, rest: Partial<SafeToActDecision> = {}): SafeToActDecision => ({ safe: false, reason, marketId: id, riskLevel: null, maxRisk, outcome: null, risk: null, verdict: null, checks: {}, ...rest });

  let risk: SettlementRisk;
  try { risk = await getSettlementRisk(id, opts); } catch (e) { return no(`refuse: evidence did not verify or could not be fetched (${(e as Error).message})`); }

  let verdict: OnchainVerdict | null = null;
  if (!opts.skipOnchain && risk.disputes[0]?.disputed_proposal) {
    try { verdict = await getOnchainVerdict(id, opts); } catch (e) { if (opts.requireOnchainVerdict) return no(`refuse: on-chain read failed (${(e as Error).message})`, { risk, riskLevel: risk.riskLevel, outcome: risk.outcome }); }
  }

  const now = (opts.now ?? Date.now)();
  const ageS = (now - Date.parse(risk.checkedAt)) / 1000;
  const checks: Record<string, boolean> = {
    recordVerified: true,
    riskWithinLimit: RISK_ORDER[risk.riskLevel] <= RISK_ORDER[maxRisk],
    outcomeMatches: !opts.outcome || !risk.resolvedOnChain || risk.outcome === opts.outcome,
    fresh: opts.maxAgeSeconds === undefined || ageS <= opts.maxAgeSeconds,
    verdictBoundIfPresent: !verdict?.found || (verdict.bound && verdict.validatorMatches && verdict.scoreConsistent !== false),
    verdictPresentIfRequired: !opts.requireOnchainVerdict || Boolean(verdict?.found && verdict.bound),
  };
  const ctx = { risk, verdict, checks, riskLevel: risk.riskLevel, outcome: risk.outcome };
  if (!checks.verdictBoundIfPresent) return no(`refuse: on-chain verdict is not bound to verifiable signed evidence (${verdict!.problems.join("; ")})`, ctx);
  if (!checks.verdictPresentIfRequired) return no("refuse: no on-chain verdict bound to signed evidence for this market", ctx);
  if (!checks.fresh) return no(`refuse: signed record checked ${Math.round(ageS)} s ago, limit ${opts.maxAgeSeconds} s`, ctx);
  if (!checks.outcomeMatches) return no(`refuse: on-chain outcome is ${risk.outcome}, not ${opts.outcome}`, ctx);
  if (!checks.riskWithinLimit) return no(`wait: risk ${risk.riskLevel} is above ${maxRisk}. ${risk.recommendation}`, ctx);
  const v = verdict?.found ? `; on-chain verdict ${verdict.score} bound to the signed record` : "";
  return { safe: true, reason: `act: risk ${risk.riskLevel} within ${maxRisk}${risk.resolvedOnChain ? `, final outcome ${risk.outcome}` : ""}${v}`, marketId: id, maxRisk, ...ctx };
}
