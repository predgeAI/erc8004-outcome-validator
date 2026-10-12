// PredgeSettlement: pay-per-call receipts (payForRoute) and owner withdrawals.
import { indexer } from "envio";
import { GLOBAL, bumpStats, decodeRoute, eventId } from "../lib.js";

const fields = { transaction: ["hash"], block: ["timestamp"] } as const;

indexer.onEvent({ contract: "PredgeSettlement", event: "Paid", fields }, async ({ event, context }) => {
  const p = event.params;
  context.Receipt.set({
    id: eventId(event),
    payer: p.payer,
    route: p.route,
    routeText: decodeRoute(p.route),
    amountWei: p.amount,
    paidAt: Number(p.timestamp),
    meta: p.meta,
    block: event.block.number,
    tx: event.transaction.hash,
  });
  await bumpStats(context, GLOBAL, event.block.number, event.block.timestamp, (s) => ({
    receipts: s.receipts + 1,
    totalPaidWei: s.totalPaidWei + p.amount,
  }));
});

indexer.onEvent({ contract: "PredgeSettlement", event: "Withdrawn", fields }, async ({ event, context }) => {
  context.SettlementWithdrawal.set({
    id: eventId(event),
    to: event.params.to,
    amountWei: event.params.amount,
    block: event.block.number,
    tx: event.transaction.hash,
    timestamp: event.block.timestamp,
  });
});
