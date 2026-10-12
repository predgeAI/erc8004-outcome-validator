// Bundle each command (and the host-agnostic core) with esbuild. The SDK in ../sdk, viem and ethers
// are bundled in, so the installed plugin has no runtime dependencies. @metamask/agent-wallet stays
// external: it must resolve to the running mm CLI (see scripts/link-host.mjs).
import { build } from "esbuild";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
rmSync(path.join(root, "dist"), { recursive: true, force: true });

await build({
  absWorkingDir: root,
  entryPoints: {
    "commands/predge/check": "src/commands/predge/check.ts",
    "commands/predge/scan": "src/commands/predge/scan.ts",
    "commands/predge/guard": "src/commands/predge/guard.ts",
    core: "src/core/index.ts",
  },
  outdir: "dist",
  chunkNames: "chunks/[name]-[hash]",
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "node",
  target: "node22",
  external: ["@metamask/agent-wallet", "@metamask/agent-wallet/*"],
  // the SDK lives in ../sdk; let its imports (ethers) fall back to this package's node_modules
  nodePaths: [path.join(root, "node_modules")],
  // some bundled CommonJS (ethers' ws) calls require(); give ESM output a real one
  banner: { js: "import { createRequire as __predgeCreateRequire } from \"node:module\"; const require = __predgeCreateRequire(import.meta.url);" },
  legalComments: "none",
  logLevel: "info",
});
