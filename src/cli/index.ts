import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildBlog } from "../generator/build/index.ts";
import {
  EDITOR_PORT,
  startEditor,
  type EditorServer,
  type EditorServerOptions,
} from "../editor/index.ts";
import type { BuildOptions, BuildResult } from "../generator/build/index.ts";

/** How to use the `edaha` command */
export const USAGE = `Usage: edaha <command> [options]

Commands:
  build    Build the site into config.yml's outputDir (and copy it into publishDir, if set)
  editor   Run the local article editor (only reachable from this computer)

Options:
  --dir <folder>       The site folder, which holds config.yml and articles/ (default: the current folder)
  --site-url <url>     build: the website's absolute URL for feeds (default: SITE_URL, then config.yml's siteUrl)
  --port <number>      editor: the port to listen on (default: ${EDITOR_PORT})
  -h, --help           Show this help
  -v, --version        Show edaha.md's version
`;

/** What the command line needs from its surroundings, so it can be tested */
export interface CliContext {
  /** The folder the command runs in */
  cwd: string;
  /** Environment variables */
  env: Record<string, string | undefined>;
  /** Where messages go */
  log: (message: string) => void;
  /** Where errors and warnings go */
  error: (message: string) => void;
  /** Builds the site (default: buildBlog) */
  build?: (options: BuildOptions) => Promise<BuildResult>;
  /** Starts the editor (default: startEditor) */
  editor?: (options: EditorServerOptions) => Promise<EditorServer>;
}

/**
 * edaha.md's version, from its package.json.
 *
 * @example
 * version(); // "0.1.0"
 */
export const version = (): string =>
  (
    JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { version: string }
  ).version;

/**
 * Read a port number from the command line.
 *
 * @example
 * parsePort("5180"); // 5180
 */
export const parsePort = (value: string): number => {
  const port = Number(value);
  if (!/^\d+$/.test(value) || port < 1 || port > 65535)
    throw new Error(`--port must be a number from 1 to 65535, got "${value}"`);
  return port;
};

/**
 * Run the `edaha` command with its arguments (without `node` and the script). Returns the exit code; for `editor`, it
 * returns once the editor is running.
 *
 * @example
 * await runCli(["build", "--dir", "my-site"], { cwd: process.cwd(), env: process.env, log: console.log, error: console.error });
 */
export const runCli = async (
  args: string[],
  context: CliContext,
): Promise<number> => {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(args);
  } catch (error) {
    context.error(`${(error as Error).message}\n\n${USAGE}`);
    return 1;
  }
  const { values, positionals } = parsed;
  if (values.version) {
    context.log(version());
    return 0;
  }
  const [command, ...rest] = positionals;
  if (values.help || !command) {
    context.log(USAGE);
    return values.help ? 0 : 1;
  }
  if (rest.length) {
    context.error(`Unexpected arguments: ${rest.join(" ")}\n\n${USAGE}`);
    return 1;
  }
  const siteDir = resolve(context.cwd, values.dir ?? ".");

  try {
    if (command === "build") {
      const result = await (context.build ?? buildBlog)({
        siteDir,
        siteUrl: values["site-url"] ?? context.env.SITE_URL,
        logger: { warn: context.error },
      });
      context.log(
        `Built ${result.articles.length} articles (${result.files.length} files) into ${result.outputDir}` +
          (result.publishDir
            ? ` and copied them into ${result.publishDir}`
            : ""),
      );
      return 0;
    }
    if (command === "editor") {
      const editor = await (context.editor ?? startEditor)({
        siteDir,
        port: values.port === undefined ? EDITOR_PORT : parsePort(values.port),
      });
      context.log(
        `Article editor for ${siteDir} running at ${editor.url} (press Ctrl+C to stop)`,
      );
      return 0;
    }
  } catch (error) {
    context.error((error as Error).message);
    return 1;
  }
  context.error(`Unknown command "${command}"\n\n${USAGE}`);
  return 1;
};

/** Parse the command line's options */
const parse = (args: string[]) =>
  parseArgs({
    args,
    allowPositionals: true,
    options: {
      dir: { type: "string" },
      "site-url": { type: "string" },
      port: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
