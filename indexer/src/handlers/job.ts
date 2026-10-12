// AgentJob escrow lifecycle: JobCreated -> Submitted -> Completed | Rejected.
import { indexer } from "envio";
import { GLOBAL, bumpStats } from "../lib.js";

const fields = { transaction: ["hash"], block: ["timestamp"] } as const;
const jobKey = (addr: string, jobId: bigint) => `${addr}-${jobId}`;

indexer.onEvent({ contract: "AgentJob", event: "JobCreated", fields }, async ({ event, context }) => {
  const p = event.params;
  context.Job.set({
    id: jobKey(event.srcAddress, p.jobId),
    jobContract: event.srcAddress,
    jobId: p.jobId,
    client: p.client,
    evaluator: p.evaluator,
    provider: p.provider,
    escrowWei: p.escrow,
    specHash: p.specHash,
    deliverable: undefined,
    status: "open",
    reason: undefined,
    paidWei: undefined,
    refundedWei: undefined,
    createdAt: event.block.timestamp,
    submittedAt: undefined,
    closedAt: undefined,
    createTx: event.transaction.hash,
    submitTx: undefined,
    closeTx: undefined,
  });
  await bumpStats(context, GLOBAL, event.block.number, event.block.timestamp, (s) => ({
    jobsCreated: s.jobsCreated + 1,
    totalEscrowWei: s.totalEscrowWei + p.escrow,
  }));
});

indexer.onEvent({ contract: "AgentJob", event: "Submitted", fields }, async ({ event, context }) => {
  const p = event.params;
  const j = await context.Job.getOrThrow(jobKey(event.srcAddress, p.jobId));
  context.Job.set({
    ...j,
    deliverable: p.deliverable,
    status: "submitted",
    submittedAt: event.block.timestamp,
    submitTx: event.transaction.hash,
  });
  await bumpStats(context, GLOBAL, event.block.number, event.block.timestamp, (s) => ({
    jobsSubmitted: s.jobsSubmitted + 1,
  }));
});

indexer.onEvent({ contract: "AgentJob", event: "Completed", fields }, async ({ event, context }) => {
  const p = event.params;
  const j = await context.Job.getOrThrow(jobKey(event.srcAddress, p.jobId));
  context.Job.set({
    ...j,
    status: "completed",
    reason: p.reason,
    paidWei: p.paid,
    closedAt: event.block.timestamp,
    closeTx: event.transaction.hash,
  });
  await bumpStats(context, GLOBAL, event.block.number, event.block.timestamp, (s) => ({
    jobsCompleted: s.jobsCompleted + 1,
  }));
});

indexer.onEvent({ contract: "AgentJob", event: "Rejected", fields }, async ({ event, context }) => {
  const p = event.params;
  const j = await context.Job.getOrThrow(jobKey(event.srcAddress, p.jobId));
  context.Job.set({
    ...j,
    status: "rejected",
    reason: p.reason,
    refundedWei: p.refunded,
    closedAt: event.block.timestamp,
    closeTx: event.transaction.hash,
  });
  await bumpStats(context, GLOBAL, event.block.number, event.block.timestamp, (s) => ({
    jobsRejected: s.jobsRejected + 1,
  }));
});
