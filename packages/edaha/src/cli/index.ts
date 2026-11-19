import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildSite } from "../generator/build/index.ts";
import type { BuildOptions, BuildResult } from "../generator/build/index.ts";

/** The package with the article editor, which `edaha editor` loads when it is installed */
export const EDITOR_PACKAGE = "@lvl99dotcom/edaha-editor";

/** The editor's default port */
export const EDITOR_PORT = 5180;

/** What `edaha editor` passes to the editor package's `startEditor` */
export interface EditorOptions {
  /** The folder to look for a config file in */
  siteDir: string;
  /** The config file, if one was named */
  configFile?: string | undefined;
  /** The port to listen on */
  port: number;
}

/** A running editor, as the editor package's `startEditor` gives it */
export interface RunningEditor {
  /** The editor's address, e.g. "http://127.0.0.1:5180" */
  url: string;
  /** Stop the editor */
  close: () => Promise<void>;
}

/** Starts the article editor */
export type StartEditor = (options: EditorOptions) => Promise<RunningEditor>;

/** How to use the `edaha` command */
export const USAGE = `Usage: edaha <command> [options]

Commands:
  build    Build the site into the config file's outputDir (and copy it into publishDir, if set)
  editor   Run the local article editor (only reachable from this computer)

Options:
  -c, --config <file>  The config file (default: the first edahaconfig file found in --dir, then in the nearest
                       package.json's folder). The site folder is the config file's folder.
  --dir <folder>       The folder to look for a config file in (default: the current folder)
  --site-url <url>     build: the website's absolute URL for feeds (default: SITE_URL, then the config's siteUrl)
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
  /** Builds the site (default: buildSite) */
  build?: (options: BuildOptions) => Promise<BuildResult>;
  /** Starts the editor (default: the editor package's startEditor, see loadEditor) */
  editor?: StartEditor;
}

/**
 * Load `startEditor` from the editor package. Throws with how to install it if it isn't installed.
 *
 * @param importPackage - imports a package by name (replaceable for tests)
 * @example
 * const startEditor = await loadEditor();
 * await startEditor({ siteDir: "my-site", port: EDITOR_PORT });
 */
export const loadEditor = async (
  importPackage: (name: string) => Promise<unknown> = (name) => import(name),
): Promise<StartEditor> => {
  try {
    return (
      (await importPackage(EDITOR_PACKAGE)) as { startEditor: StartEditor }
    ).startEditor;
  } catch (error) {
    // Only when the editor package itself is missing, not one of its own dependencies
    if (
      (error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND" &&
      (error as Error).message.includes(`'${EDITOR_PACKAGE}'`)
    )
      throw new Error(
        `The article editor isn't installed. Install it next to edaha.md with \`npm add -D ${EDITOR_PACKAGE}\` (or pnpm/yarn).`,
        { cause: error },
      );
    throw error;
  }
};

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
  const configFile =
    values.config === undefined
      ? undefined
      : resolve(context.cwd, values.config);

  try {
    if (command === "build") {
      const result = await (context.build ?? buildSite)({
        siteDir,
        configFile,
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
      const editor = await (context.editor ?? (await loadEditor()))({
        siteDir,
        configFile,
        port: values.port === undefined ? EDITOR_PORT : parsePort(values.port),
      });
      context.log(
        `Article editor running at ${editor.url} (press Ctrl+C to stop)`,
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
      config: { type: "string", short: "c" },
      dir: { type: "string" },
      "site-url": { type: "string" },
      port: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
