// Builds the published package into dist/: the editor server's Node.js code and types with tsc, the editor page with
// Vite, and the editor for other apps' pages ("./client": its code with Vite, its types with tsc, and its styles).
// Needs @lvl99dotcom/edaha.md built first. Run with `pnpm build`.
import { execFileSync } from "node:child_process";
import { copyFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");

/** Run one of the workspace's tools, failing the build if it fails */
const run = (command: string, args: string[]) =>
  execFileSync(command, args, { cwd: root, stdio: "inherit" });

await rm(dist, { recursive: true, force: true });
run("pnpm", ["exec", "tsc", "-p", "tsconfig.build.json"]);
run("pnpm", ["exec", "vite", "build"]);
run("pnpm", ["exec", "vite", "build", "--config", "vite.client.config.ts"]);
run("pnpm", ["exec", "tsc", "-p", "tsconfig.client.json"]);
await copyFile(
  resolve(root, "src/client/style.css"),
  resolve(dist, "client-lib/style.css"),
);
console.log(`Built @lvl99dotcom/edaha-editor into ${dist}`);
