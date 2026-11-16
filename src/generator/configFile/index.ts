import { readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";
import { parseConfig, type BlogConfig } from "../config/index.ts";
import type { Logger } from "../types/index.ts";

/** Config file names (without extension), in the order they are looked for */
export const CONFIG_NAMES = [
  ".edahaconfigrc",
  ".edahaconfig",
  "edahaconfigrc",
  "edahaconfig",
  "edaha.config",
];

/** Config file extensions, in the order they are looked for */
export const CONFIG_EXTENSIONS = ["yml", "yaml", "json", "js", "cjs", "mjs"];

/** Every config file name, in the order they are looked for */
export const CONFIG_FILES = CONFIG_NAMES.flatMap((name) =>
  CONFIG_EXTENSIONS.map((extension) => `${name}.${extension}`),
);

/** A site's config file, its folder and its validated settings */
export interface SiteConfig {
  /** The config file's absolute path */
  configFile: string;
  /** The site folder: the config file's folder, which the paths in its settings are relative to */
  siteDir: string;
  /** The validated settings */
  config: BlogConfig;
}

/** Options for finding and reading a site's config file */
export interface SiteConfigOptions {
  /** The folder to look for a config file in, before the nearest package.json's folder. Default: the current folder */
  siteDir?: string | undefined;
  /** The config file to use instead of looking for one */
  configFile?: string | undefined;
  /** Where warnings go */
  logger?: Logger | undefined;
}

/** A file's modification time, or undefined if it isn't a file */
const fileTime = (path: string): Promise<number | undefined> =>
  stat(path).then(
    (stats) => (stats.isFile() ? stats.mtimeMs : undefined),
    () => undefined,
  );

/**
 * The folder of the nearest package.json, from a folder up to the file system's root, or undefined if there is none.
 *
 * @example
 * await packageDir("/projects/my-site/site"); // "/projects/my-site"
 */
export const packageDir = async (dir: string): Promise<string | undefined> => {
  for (let folder = resolve(dir); ; folder = dirname(folder)) {
    if ((await fileTime(join(folder, "package.json"))) !== undefined)
      return folder;
    if (dirname(folder) === folder) return undefined;
  }
};

/**
 * Find a site's config file: the first of CONFIG_FILES in a folder, then in the nearest package.json's folder. Warns
 * when a folder has more than one. Throws if there is none.
 *
 * @example
 * await findConfigFile("my-site"); // "/projects/my-site/edahaconfig.yml"
 */
export const findConfigFile = async (
  dir: string,
  logger?: Logger,
): Promise<string> => {
  const folders = [resolve(dir), await packageDir(dir)].filter(
    (folder, index, all): folder is string =>
      folder !== undefined && all.indexOf(folder) === index,
  );
  for (const folder of folders) {
    const times = await Promise.all(
      CONFIG_FILES.map((name) => fileTime(join(folder, name))),
    );
    const found = CONFIG_FILES.filter((_, i) => times[i] !== undefined);
    if (!found.length) continue;
    if (found.length > 1)
      logger?.warn(
        `${folder} has several config files (${found.join(", ")}); using ${found[0]}`,
      );
    return join(folder, found[0] as string);
  }
  throw new Error(
    `No config file found in ${folders.join(" or ")}. Add one named ${CONFIG_NAMES.join(", ")} ending in .${CONFIG_EXTENSIONS.join(", .")}, or name it with --config.`,
  );
};

/**
 * Read a config file's settings, by its extension: YAML (`.yml`, `.yaml`), JSON (`.json`), or JavaScript (`.js`, `.cjs`,
 * `.mjs`) whose default export is the settings object. A changed JavaScript file is imported again. Throws, naming the
 * file, if it can't be read.
 *
 * @example
 * await readConfigFile("my-site/edaha.config.mjs"); // { name: "My site", ... }
 */
export const readConfigFile = async (file: string): Promise<unknown> => {
  const path = resolve(file);
  const extension = extname(path).slice(1);
  try {
    const time = await fileTime(path);
    if (time === undefined) throw new Error("file not found");
    if (extension === "yml" || extension === "yaml")
      return parse(await readFile(path, "utf8")) as unknown;
    if (extension === "json")
      return JSON.parse(await readFile(path, "utf8")) as unknown;
    if (CONFIG_EXTENSIONS.includes(extension)) {
      // The modification time makes a changed file a new module, rather than the one imported before
      const url = `${pathToFileURL(path).href}?mtime=${time}`;
      return ((await import(url)) as { default?: unknown }).default;
    }
    throw new Error(
      `config files must end in .${CONFIG_EXTENSIONS.join(", .")}`,
    );
  } catch (error) {
    throw new Error(`${basename(path)}: ${(error as Error).message}`, {
      cause: error,
    });
  }
};

/**
 * Find (or use the given) config file, read it and validate its settings. The site folder is the config file's folder.
 *
 * @example
 * const { siteDir, config } = await loadSiteConfig({ siteDir: "my-site" });
 */
export const loadSiteConfig = async (
  options: SiteConfigOptions = {},
): Promise<SiteConfig> => {
  const configFile = options.configFile
    ? resolve(options.configFile)
    : await findConfigFile(options.siteDir ?? ".", options.logger);
  return {
    configFile,
    siteDir: dirname(configFile),
    config: parseConfig(await readConfigFile(configFile), basename(configFile)),
  };
};
