// Serves the edaha.md website built from site/ (into build/) on this computer, to look at it before publishing.
// Run with `pnpm site:serve` (after `pnpm site:build`). Set PORT to use another port than 5181. Pages are served
// under the config's siteUrl path (e.g. /edaha.md/), as they link to it.
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { loadSiteConfig } from "@lvl99dotcom/edaha.md/generator/configFile";
import { baseUrlOf } from "@lvl99dotcom/edaha.md/generator/urls";
import { startSiteServer } from "./site-server.ts";

const root = resolve(import.meta.dirname, "../build");

if (!(await stat(root).catch(() => undefined))) {
  console.error(`${root} doesn't exist yet; build it with \`pnpm site:build\``);
  process.exit(1);
}

const { config } = await loadSiteConfig({
  siteDir: resolve(import.meta.dirname, ".."),
});
const baseUrl = config.siteUrl ? baseUrlOf(config.siteUrl) : "";

const server = await startSiteServer({
  root: () => root,
  port: 5181,
  baseUrl,
}).catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
console.log(
  `Serving ${root} at ${server.url}${baseUrl}/ (press Ctrl+C to stop)`,
);
