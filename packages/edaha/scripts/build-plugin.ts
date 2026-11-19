// Builds an embed plugin package (run from its folder) into its dist/ with tsc. Needs @lvl99dotcom/edaha.md built
// first. Plugin packages run it with `pnpm build`.
import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { basename, resolve } from "node:path";

const root = process.cwd();
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
execFileSync("pnpm", ["exec", "tsc", "-p", "tsconfig.build.json"], {
  cwd: root,
  stdio: "inherit",
});
console.log(`Built ${basename(root)} into ${dist}`);
