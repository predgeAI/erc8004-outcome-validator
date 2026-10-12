// PredgeValidatorBond: stake behind a committed expected hash, score, then slash or reclaim.
import { indexer } from "envio";
import { GLOBAL, bumpStats } from "../lib.js";

const fields = { transaction: ["hash"], block: ["timestamp"] } as const;
const bondId = (addr: string, requestHash: string) => `${addr}-${requestHash}`;

indexer.onEvent({ contract: "PredgeValidatorBond", event: "Committed", fields }, async ({ event, context }) => {
  const p = event.params;
  // The bond contract only accepts a job whose specHash equals requestHash, so that is the link.
  const jobs = await context.Job.getWhere({ specHash: { _eq: p.requestHash } });
  const job = jobs.sort((a, b) => b.createdAt - a.createdAt)[0];

  context.Bond.set({
    id: bondId(event.srcAddress, p.requestHash),
    bondContract: event.srcAddress,
    requestHash: p.requestHash,
    expected: p.expected,
    stakeWei: p.bond,
    stakedAt: Number(p.stakedAt),
    job_id: job?.id,
    scored: false,
    score: undefined,
    scoredAt: undefined,
    status: "open",
    slashed: false,
    challenger: undefined,
    slashedWei: undefined,
    deliveredHash: undefined,
    recordedScoreAtSlash: undefined,
    reclaimed: false,
    commitTx: event.transaction.hash,
    scoreTx: undefined,
    closeTx: undefined,
    commitBlock: event.block.number,
    closeBlock: undefined,
  });
  await bumpStats(context, GLOBAL, event.block.number, event.block.timestamp, (s) => ({
    bondsCommitted: s.bondsCommitted + 1,
    totalStakedWei: s.totalStakedWei + p.bond,
  }));
});

indexer.onEvent({ contract: "PredgeValidatorBond", event: "Scored", fields }, async ({ event, context }) => {
  const p = event.params;
  const b = await context.Bond.getOrThrow(bondId(event.srcAddress, p.requestHash));
  context.Bond.set({
    ...b,
    scored: true,
    score: Number(p.score),
    scoredAt: Number(p.scoredAt),
    status: "scored",
    scoreTx: event.transaction.hash,
  });
  await bumpStats(context, GLOBAL, event.block.number, event.block.timestamp, (s) => ({
    bondsScored: s.bondsScored + 1,
  }));
});

indexer.onEvent({ contract: "PredgeValidatorBond", event: "Slashed", fields }, async ({ event, context }) => {
  const p = event.params;
  const b = await context.Bond.getOrThrow(bondId(event.srcAddress, p.requestHash));
  context.Bond.set({
    ...b,
    status: "slashed",
    slashed: true,
    challenger: p.challenger,
    slashedWei: p.bond,
    deliveredHash: p.deliveredHash,
    recordedScoreAtSlash: Number(p.recordedScore),
    closeTx: event.transaction.hash,
    closeBlock: event.block.number,
  });
  await bumpStats(context, GLOBAL, event.block.number, event.block.timestamp, (s) => ({
    slashedCount: s.slashedCount + 1,
    totalSlashedWei: s.totalSlashedWei + p.bond,
  }));
});

indexer.onEvent({ contract: "PredgeValidatorBond", event: "Reclaimed", fields }, async ({ event, context }) => {
  const p = event.params;
  const b = await context.Bond.getOrThrow(bondId(event.srcAddress, p.requestHash));
  context.Bond.set({
    ...b,
    status: "reclaimed",
    reclaimed: true,
    closeTx: event.transaction.hash,
    closeBlock: event.block.number,
  });
  await bumpStats(context, GLOBAL, event.block.number, event.block.timestamp, (s) => ({
    reclaimedCount: s.reclaimedCount + 1,
    totalReclaimedWei: s.totalReclaimedWei + p.bond,
  }));
});
