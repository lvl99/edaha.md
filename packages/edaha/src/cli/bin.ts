#!/usr/bin/env node
// The `edaha` command: runs the CLI with this process's arguments and surroundings (see ./index.ts)
import { runCli } from "./index.ts";

process.exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  log: (message) => console.log(message),
  error: (message) => console.error(message),
});
