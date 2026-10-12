// ERC-8004 reference IdentityRegistry: agent registrations made by Predge's owner key.
import { indexer } from "envio";
import { PREDGE_VALIDATOR } from "../lib.js";

indexer.onEvent(
  {
    contract: "ERC8004IdentityRegistry",
    event: "Registered",
    fields: { transaction: ["hash"], block: ["timestamp"] },
    where: () => ({ params: [{ owner: PREDGE_VALIDATOR }] }),
  },
  async ({ event, context }) => {
    const p = event.params;
    context.AgentIdentity.set({
      id: p.agentId.toString(),
      agentId: p.agentId,
      owner: p.owner,
      agentURI: p.agentURI,
      block: event.block.number,
      tx: event.transaction.hash,
      timestamp: event.block.timestamp,
    });
  },
);
