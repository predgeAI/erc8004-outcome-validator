// ERC-8004 validation events, from Predge's own registry and from the ERC-8004 reference
// ValidationRegistry (filtered to Predge's validator).
import { indexer } from "envio";
import { GLOBAL, PREDGE_VALIDATOR, bucketDelta, bumpStats, eventId, parseMarketId } from "../lib.js";

type Registry = "PredgeAgentValidator" | "ERC8004ValidationRegistry";

const fields = { transaction: ["hash", "from"], block: ["timestamp"] } as const;

async function onRequest(registry: Registry, event: any, context: any) {
  const p = event.params;
  const block = event.block.number;
  const ts = event.block.timestamp;
  const requester = (event.transaction.from ?? "").toLowerCase();
  const marketId = parseMarketId(p.requestURI);
  const id = `${registry}-${p.requestHash}`;

  context.ValidationRequest.set({
    id,
    registry,
    registryAddress: event.srcAddress,
    requestHash: p.requestHash,
    validator: p.validatorAddress,
    agentId: p.agentId,
    requester,
    requestURI: p.requestURI,
    marketId,
    block,
    tx: event.transaction.hash,
    timestamp: ts,
  });

  for (const sid of [GLOBAL, registry]) {
    await bumpStats(context, sid, block, ts, (s) => ({ totalRequests: s.totalRequests + 1 }));
  }

  if (requester) {
    const a = await context.AgentStats.get(requester);
    context.AgentStats.set({
      id: requester,
      requests: (a?.requests ?? 0) + 1,
      verdictsReceived: a?.verdictsReceived ?? 0,
      score0: a?.score0 ?? 0,
      score100: a?.score100 ?? 0,
      scoreOther: a?.scoreOther ?? 0,
      sumScores: a?.sumScores ?? 0n,
      avgScoreX100: a?.avgScoreX100 ?? 0,
      firstSeenBlock: a?.firstSeenBlock ?? block,
      lastVerdictBlock: a?.lastVerdictBlock,
      lastVerdictAt: a?.lastVerdictAt,
    });
  }

  if (marketId) {
    const m = await context.MarketStats.get(marketId);
    context.MarketStats.set({
      id: marketId,
      requests: (m?.requests ?? 0) + 1,
      verdicts: m?.verdicts ?? 0,
      latestScore: m?.latestScore,
      latestVerdictTx: m?.latestVerdictTx,
      latestVerdictAt: m?.latestVerdictAt,
    });
  }
}

async function onResponse(registry: Registry, event: any, context: any) {
  const p = event.params;
  const block = event.block.number;
  const ts = event.block.timestamp;
  const score = Number(p.response);
  const requestId = `${registry}-${p.requestHash}`;
  const req = await context.ValidationRequest.get(requestId);
  const agent: string | undefined = req?.requester || undefined;
  const marketId: string | undefined = req?.marketId ?? parseMarketId(p.responseURI);

  context.Verdict.set({
    id: eventId(event),
    registry,
    registryAddress: event.srcAddress,
    requestHash: p.requestHash,
    request_id: req ? requestId : undefined,
    agentId: p.agentId,
    agent,
    validator: p.validatorAddress,
    score,
    responseURI: p.responseURI,
    responseHash: p.responseHash,
    tag: p.tag,
    marketId,
    leadTimeSeconds: req ? ts - req.timestamp : undefined,
    block,
    tx: event.transaction.hash,
    timestamp: ts,
  });

  for (const sid of [GLOBAL, registry]) {
    await bumpStats(context, sid, block, ts, (s) => ({
      totalVerdicts: s.totalVerdicts + 1,
      sumScores: s.sumScores + BigInt(score),
      ...bucketDelta(s, score),
    }));
  }

  if (agent) {
    const a = await context.AgentStats.get(agent);
    const verdictsReceived = (a?.verdictsReceived ?? 0) + 1;
    const sumScores = (a?.sumScores ?? 0n) + BigInt(score);
    context.AgentStats.set({
      id: agent,
      requests: a?.requests ?? 0,
      verdictsReceived,
      score0: (a?.score0 ?? 0) + (score === 0 ? 1 : 0),
      score100: (a?.score100 ?? 0) + (score === 100 ? 1 : 0),
      scoreOther: (a?.scoreOther ?? 0) + (score !== 0 && score !== 100 ? 1 : 0),
      sumScores,
      avgScoreX100: Number((sumScores * 100n) / BigInt(verdictsReceived)),
      firstSeenBlock: a?.firstSeenBlock ?? block,
      lastVerdictBlock: block,
      lastVerdictAt: ts,
    });
  }

  if (marketId) {
    const m = await context.MarketStats.get(marketId);
    context.MarketStats.set({
      id: marketId,
      requests: m?.requests ?? 0,
      verdicts: (m?.verdicts ?? 0) + 1,
      latestScore: score,
      latestVerdictTx: event.transaction.hash,
      latestVerdictAt: ts,
    });
  }
}

// Predge's own registry: every event is Predge's.
indexer.onEvent(
  { contract: "PredgeAgentValidator", event: "ValidationRequest", fields },
  async ({ event, context }) => onRequest("PredgeAgentValidator", event, context),
);
indexer.onEvent(
  { contract: "PredgeAgentValidator", event: "ValidationResponse", fields },
  async ({ event, context }) => onResponse("PredgeAgentValidator", event, context),
);
indexer.onEvent(
  { contract: "PredgeAgentValidator", event: "ValidatorUpdated" },
  async ({ event, context }) => {
    context.log.info(
      `PredgeAgentValidator validator ${event.params.previousValidator} -> ${event.params.newValidator}`,
    );
  },
);

// Shared ERC-8004 reference registry: only requests addressed to / answered by Predge's validator.
indexer.onEvent(
  {
    contract: "ERC8004ValidationRegistry",
    event: "ValidationRequest",
    fields,
    where: () => ({ params: [{ validatorAddress: PREDGE_VALIDATOR }] }),
  },
  async ({ event, context }) => onRequest("ERC8004ValidationRegistry", event, context),
);
indexer.onEvent(
  {
    contract: "ERC8004ValidationRegistry",
    event: "ValidationResponse",
    fields,
    where: () => ({ params: [{ validatorAddress: PREDGE_VALIDATOR }] }),
  },
  async ({ event, context }) => onResponse("ERC8004ValidationRegistry", event, context),
);
