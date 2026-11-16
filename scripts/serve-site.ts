// Serves the edaha.md website built from site/ (site/build) on this computer, to look at it before publishing.
// Run with `pnpm site:serve` (after `pnpm site:build`). Set PORT to use another port than 5181.
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { startSiteServer } from "./site-server.ts";

const root = resolve(import.meta.dirname, "../site/build");

if (!(await stat(root).catch(() => undefined))) {
  console.error(`${root} doesn't exist yet; build it with \`pnpm site:build\``);
  process.exit(1);
}

const server = await startSiteServer({ root: () => root });
console.log(`Serving ${root} at ${server.url} (press Ctrl+C to stop)`);
