#!/usr/bin/env node
// Run every queries/*.graphql against the indexer's GraphQL endpoint and print the results.
//   node tools/run-queries.mjs [endpoint]     (default http://localhost:8080/v1/graphql)
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "queries");
const endpoint = process.argv[2] || process.env.GRAPHQL_URL || "http://localhost:8080/v1/graphql";
const headers = { "content-type": "application/json" };
if (process.env.HASURA_ADMIN_SECRET) headers["x-hasura-admin-secret"] = process.env.HASURA_ADMIN_SECRET;

for (const f of readdirSync(dir).filter((f) => f.endsWith(".graphql")).sort()) {
  const query = readFileSync(path.join(dir, f), "utf8");
  const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ query }) });
  console.log(`### ${f}\n${JSON.stringify(await res.json(), null, 2)}\n`);
}
