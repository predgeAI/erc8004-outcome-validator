// For `mm plugins install file:<dir>`: the CLI links this directory into its data dir, and Node
// resolves the plugin's imports from here. `@metamask/agent-wallet/plugin` must then be the running
// CLI itself, not a second copy from devDependencies (a copy fails the PluginCommand instanceof
// check and crashes on browser globals). Replace node_modules/@metamask/agent-wallet with a symlink
// to the mm on PATH (or MM_CLI_ROOT).
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let cli = process.env.MM_CLI_ROOT;
if (!cli) {
  // `npm run` puts this package's node_modules/.bin first on PATH; skip that copy
  const bins = execFileSync(process.platform === "win32" ? "where" : "which", process.platform === "win32" ? ["mm"] : ["-a", "mm"], { encoding: "utf8" })
    .split("\n").map((s) => s.trim()).filter(Boolean)
    .map((b) => realpathSync(b)).filter((b) => !b.startsWith(path.join(root, "node_modules") + path.sep));
  if (!bins.length) throw new Error("no mm CLI found on PATH outside this package; install @metamask/agent-wallet globally or set MM_CLI_ROOT");
  let dir = path.dirname(bins[0]);
  while (dir !== path.dirname(dir) && !existsSync(path.join(dir, "package.json"))) dir = path.dirname(dir);
  cli = dir;
}
if (path.resolve(cli).startsWith(path.join(root, "node_modules"))) throw new Error(`refusing to link to the copy inside this package (${cli})`);
const pkg = JSON.parse(readFileSync(path.join(cli, "package.json"), "utf8"));
if (pkg.name !== "@metamask/agent-wallet") throw new Error(`${cli} is not @metamask/agent-wallet (found ${pkg.name})`);
const target = path.join(root, "node_modules", "@metamask", "agent-wallet");
mkdirSync(path.dirname(target), { recursive: true });
if (existsSync(target) || (() => { try { return lstatSync(target).isSymbolicLink(); } catch { return false; } })()) rmSync(target, { recursive: true, force: true });
symlinkSync(cli, target, "dir");
console.log(`linked ${path.relative(root, target)} -> ${cli} (mm ${pkg.version})`);
