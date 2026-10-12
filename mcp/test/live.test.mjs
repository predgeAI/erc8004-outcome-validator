// Live, read-only: starts the MCP server over stdio, lists its tools and calls each one against
// api.predge.io and Monad testnet. No key, no transaction.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "server.mjs");
const MARKET = process.env.MARKET || "1137824";

test("MCP server: tools over stdio, live read-only", async () => {
  const client = new Client({ name: "predge-mcp-live-test", version: "0.1.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER] }));
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ["dispute_exposure", "is_safe_to_act", "onchain_verdict", "settlement_risk"]);
    const call = async (name, args) => {
      const r = await client.callTool({ name, arguments: args });
      assert.ok(!r.isError, r.content?.[0]?.text);
      return JSON.parse(r.content[0].text);
    };
    const risk = await call("settlement_risk", { marketId: MARKET });
    assert.equal(risk.verified.signature, true);
    assert.equal(risk.verified.pinnedKey, true);
    console.log(`  settlement_risk: ${risk.riskLevel}, outcome ${risk.outcome}`);
    const v = await call("onchain_verdict", { marketIdOrRequestHash: MARKET });
    assert.equal(v.bound, true);
    console.log(`  onchain_verdict: score ${v.score}, bound ${v.bound}, tx ${v.responseTx}`);
    const d = await call("is_safe_to_act", { marketId: MARKET, outcome: "Over" });
    assert.equal(d.safe, true);
    console.log(`  is_safe_to_act: ${d.reason}`);
    const x = await call("dispute_exposure", { marketId: "5219930" });
    assert.equal(x.cached, true);
    assert.ok(["hedge", "size down", "wait", "fine"].includes(x.decision));
    console.log(`  dispute_exposure: ${x.decision}: ${x.reason.slice(0, 80)}`);
    const miss = await call("dispute_exposure", { marketId: "1" });
    assert.equal(miss.cached, false);
    const bad = await client.callTool({ name: "settlement_risk", arguments: { marketId: "not-a-market" } });
    assert.ok(bad.isError);
  } finally {
    await client.close();
  }
});
