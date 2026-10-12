#!/usr/bin/env node
// Predge Settlement Risk MCP server (stdio). Three read-only tools an agent calls before it acts on a
// prediction-market outcome:
//   settlement_risk   signed Settlement Risk record from api.predge.io, verified against the pinned key
//   onchain_verdict   Predge's verdict on Monad testnet, checked: responseHash == keccak256(signed bytes)
//   is_safe_to_act    both combined into one yes or no with a reason
// Holds no key and sends no transaction. Env: PREDGE_API, MONAD_RPC_URL.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getSettlementRisk, getOnchainVerdict, isSafeToAct } from "@predge/settlement-risk";

const base = { baseUrl: process.env.PREDGE_API || undefined, rpcUrl: process.env.MONAD_RPC_URL || undefined };
const marketId = z.string().regex(/^\d{1,12}$/).describe("Polymarket market id (digits), e.g. 1137824");

const riskView = (r) => ({
  marketId: r.marketId, riskLevel: r.riskLevel, recommendation: r.recommendation, resolvedOnChain: r.resolvedOnChain,
  outcome: r.outcome, umaState: r.umaState, disputeCount: r.disputeCount, openDispute: r.openDispute, sentToUmaVote: r.sentToUmaVote,
  paused: r.paused, disputes: r.disputes, checkedAt: r.checkedAt, issuedAt: r.issuedAt, verified: r.verified, source: r.source,
  signedRecord: { public_key: r.record.public_key, kid: r.record.kid, signature: r.record.signature, content_hash: r.record.content_hash, canonical: r.record.canonical },
});
const verdictView = (v) => v && ({
  found: v.found, chainId: v.chainId, contract: v.contract, requestHash: v.requestHash, validator: v.validator, score: v.score,
  responseHash: v.responseHash, bound: v.bound, scoreConsistent: v.scoreConsistent, validatorMatches: v.validatorMatches,
  claim: v.claim, responseTx: v.responseTx, explorerUrl: v.explorerUrl, problems: v.problems,
});
const reply = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });
const fail = (e) => ({ isError: true, content: [{ type: "text", text: `error: ${e?.message ?? e}` }] });
const ro = { readOnlyHint: true, openWorldHint: true };

const server = new McpServer({ name: "predge-settlement-risk", version: "0.1.0" });

server.registerTool("settlement_risk", {
  title: "Predge settlement risk",
  description: "Signed Settlement Risk record for a Polymarket market: UMA dispute history, on-chain resolution, risk level (resolved < ok < watch < caution) and a one-line recommendation. The ed25519 signature is verified against Predge's pinned key and the sha256 content hash is checked before anything is returned.",
  inputSchema: { marketId },
  annotations: ro,
}, async ({ marketId }) => { try { return reply(riskView(await getSettlementRisk(marketId, base))); } catch (e) { return fail(e); } });

server.registerTool("onchain_verdict", {
  title: "Predge on-chain verdict (Monad testnet)",
  description: "Predge's 0..100 verdict on Monad testnet (PredgeAgentValidator, ERC-8004 style getValidationStatus) for a market id or a requestHash. bound=true means responseHash equals keccak256 of a signed Predge record that verifies against the pinned key. Score 100: the market settled as first proposed; 0: it settled differently from the disputed proposal.",
  inputSchema: { marketIdOrRequestHash: z.string().regex(/^(\d{1,12}|0x[0-9a-fA-F]{64})$/).describe("Polymarket market id or a 32-byte requestHash") },
  annotations: ro,
}, async ({ marketIdOrRequestHash }) => { try { return reply(verdictView(await getOnchainVerdict(marketIdOrRequestHash, base))); } catch (e) { return fail(e); } });

server.registerTool("is_safe_to_act", {
  title: "Is it safe to act on this market's outcome?",
  description: "Call before acting on a prediction-market outcome. Fetches and verifies the signed record, reads the on-chain verdict on Monad testnet if one exists, and returns safe true or false with a reason. Default maxRisk 'resolved': act only on a final on-chain outcome.",
  inputSchema: {
    marketId,
    maxRisk: z.enum(["resolved", "ok", "watch", "caution"]).optional().describe("highest risk level you accept; default resolved"),
    outcome: z.string().optional().describe("the outcome you are about to act on, e.g. Yes; must match if the market is resolved"),
    maxAgeSeconds: z.number().int().positive().optional().describe("refuse if the record was checked longer ago than this"),
    requireOnchainVerdict: z.boolean().optional().describe("refuse unless an on-chain verdict bound to signed evidence exists"),
  },
  annotations: ro,
}, async ({ marketId, ...o }) => {
  try {
    const d = await isSafeToAct(marketId, { ...base, ...o });
    return reply({ safe: d.safe, reason: d.reason, marketId: d.marketId, riskLevel: d.riskLevel, maxRisk: d.maxRisk, outcome: d.outcome, checks: d.checks, recommendation: d.risk?.recommendation ?? null, checkedAt: d.risk?.checkedAt ?? null, verdict: verdictView(d.verdict) });
  } catch (e) { return fail(e); }
});

await server.connect(new StdioServerTransport());
