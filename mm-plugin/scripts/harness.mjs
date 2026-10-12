// Run the command handlers' core without the mm CLI (same code the commands call), against live data.
//   node scripts/harness.mjs check <market> [--max-risk ok] [--json]
//   node scripts/harness.mjs scan <address> [--json]
//   node scripts/harness.mjs guard <market> --side YES --size 10 [--price 0.5] [--json]
import * as core from "../dist/core.js";

const [cmd, target, ...rest] = process.argv.slice(2);
const flag = (n) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : undefined; };
const json = rest.includes("--json");
const clients = core.publicRpcFactory();
const out = (data, text) => console.log(json ? JSON.stringify({ ok: true, data }, null, 2) : text);

try {
  if (cmd === "check") {
    const r = await core.check(target, { maxRisk: flag("max-risk") ?? "ok", clients });
    out(r, core.renderCheck(r));
  } else if (cmd === "scan") {
    const r = await core.scan(target, { max: Number(flag("max") ?? 200) });
    out(r, core.renderScan(r));
  } else if (cmd === "guard") {
    const r = await core.guard(target, { side: flag("side"), size: Number(flag("size")), price: flag("price") ? Number(flag("price")) : undefined, action: flag("action") ?? "buy", maxRisk: flag("max-risk") ?? "ok", clients });
    out(r, core.renderGuard(r));
    if (!r.allowed) process.exitCode = 2;
  } else {
    console.error("usage: harness.mjs check|scan|guard <target> [flags]");
    process.exitCode = 64;
  }
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exitCode = 1;
}
