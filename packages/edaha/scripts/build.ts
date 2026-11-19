// Builds the published package into dist/: the Node.js code and types with tsc. Run with `pnpm build`.
import { execFileSync } from "node:child_process";
import { chmod, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");

/** Run one of the workspace's tools, failing the build if it fails */
const run = (command: string, args: string[]) =>
  execFileSync(command, args, { cwd: root, stdio: "inherit" });

await rm(dist, { recursive: true, force: true });
run("pnpm", ["exec", "tsc", "-p", "tsconfig.build.json"]);
// The `edaha` command runs directly
await chmod(resolve(dist, "cli/bin.js"), 0o755);
console.log(`Built @lvl99dotcom/edaha.md into ${dist}`);
