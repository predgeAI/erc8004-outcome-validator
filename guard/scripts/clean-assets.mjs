// The build writes into ../docs next to the old board, so only clear our own output first.
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const docs = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "docs");
rmSync(path.join(docs, "assets"), { recursive: true, force: true });
