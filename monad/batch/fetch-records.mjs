// Fetch the signed Predge Settlement Risk record for every market in monad/batch/markets.json.
//
//   node monad/batch/fetch-records.mjs            fetch missing records (free route, ~1 request/s)
//
// Each record comes from https://api.predge.io/v1/settlement-risk/<market_id>. It is checked
// offline before it is stored: ed25519 signature over `canonical`, and `payload` re-canonicalised
// must equal `canonical`. Records that fail, or that are not a settled market with a disputed
// proposal, are listed in records/_skipped.json and never get a verdict.
import crypto from "node:crypto";
import path from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API = process.env.PREDGE_API || "https://api.predge.io";
const OUT = path.join(HERE, "records");
mkdirSync(OUT, { recursive: true });

export const canon = (v) => (v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`);

export function verifyAttestation(a) {
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(a.public_key, "hex")]);
  const sigOk = crypto.verify(null, Buffer.from(a.canonical, "utf8"), crypto.createPublicKey({ key: spki, format: "der", type: "spki" }), Buffer.from(a.signature, "hex"));
  return sigOk && canon(a.payload) === a.canonical;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { markets } = JSON.parse(readFileSync(path.join(HERE, "markets.json"), "utf8"));
  const skippedFile = path.join(OUT, "_skipped.json");
  const skipped = existsSync(skippedFile) ? JSON.parse(readFileSync(skippedFile, "utf8")) : {};
  let fetched = 0;
  for (const m of markets) {
    const f = path.join(OUT, `${m.market_id}.json`);
    if (existsSync(f) || skipped[m.market_id]) continue;
    let res;
    for (let attempt = 0; attempt < 5; attempt++) {
      res = await fetch(`${API}/v1/settlement-risk/${m.market_id}`);
      if (res.status !== 429 && res.status < 500) break;
      await sleep(5000 * (attempt + 1));
    }
    await sleep(1100); // the route allows 60 requests per minute
    if (!res.ok) { skipped[m.market_id] = `HTTP ${res.status}`; continue; }
    const body = await res.json();
    const a = body.attestation;
    const p = a?.payload;
    let why = null;
    if (!a || !verifyAttestation(a)) why = "attestation failed offline verification";
    else if (p.uma_state !== "settled" || !p.resolved_on_chain || !p.onchain_resolution?.outcome) why = `not settled on chain (${p.uma_state})`;
    else if (!p.disputes?.length || !p.disputes[0].disputed_proposal) why = "no disputed proposal in record";
    if (why) { skipped[m.market_id] = why; continue; }
    writeFileSync(f, JSON.stringify({ url: `${API}/v1/settlement-risk/${m.market_id}`, attestation: { public_key: a.public_key, signature: a.signature, canonical: a.canonical } }) + "\n");
    fetched++;
    if (fetched % 25 === 0) console.log(`fetched ${fetched}`);
  }
  writeFileSync(skippedFile, JSON.stringify(skipped, null, 1) + "\n");
  console.log(`done: ${fetched} new, ${Object.keys(skipped).length} skipped`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
