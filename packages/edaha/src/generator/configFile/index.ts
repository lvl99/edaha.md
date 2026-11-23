import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse, parseDocument } from "yaml";
import { loadPlugins } from "../../embeds/index.ts";
import { resolveTheme } from "../../theme/index.ts";
import { parseConfig, type EdahaConfig } from "../config/index.ts";
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
  config: EdahaConfig;
  /** The folder of the theme the config's `theme` names, or undefined for edaha.md's default theme (THEME_DIR) */
  themeDir?: string | undefined;
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

/** Wrap an error so its message names the config file */
const fileError = (file: string, error: unknown) =>
  new Error(`${basename(file)}: ${(error as Error).message}`, {
    cause: error,
  });

/**
 * A site's config from a config file's settings: embed plugin packages named in `plugins` are loaded from the site
 * folder, the settings are validated, and the folder of the theme named in `theme` is found. Throws, naming the file,
 * if the settings can't be used.
 */
const siteConfigFrom = async (
  configFile: string,
  data: unknown,
): Promise<SiteConfig> => {
  const siteDir = dirname(configFile);
  if (data && typeof data === "object" && "plugins" in data)
    try {
      (data as { plugins: unknown }).plugins = await loadPlugins(
        data.plugins,
        siteDir,
      );
    } catch (error) {
      throw fileError(configFile, error);
    }
  const config = parseConfig(data, basename(configFile));
  const themeDir =
    config.theme === undefined
      ? undefined
      : await resolveTheme(config.theme, siteDir).catch((error: Error) => {
          throw fileError(configFile, error);
        });
  return { configFile, siteDir, config, themeDir };
};

/**
 * Find (or use the given) config file, read it and validate its settings. The site folder is the config file's folder.
 * Embed plugin packages named in `plugins` are loaded from it, and the folder of the theme named in `theme` is found.
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
  return siteConfigFrom(configFile, await readConfigFile(configFile));
};

/** Changes to a config file's top-level settings, by name: a value sets the setting, `undefined` removes it */
export type ConfigChanges = Readonly<Record<string, unknown>>;

/** A JSON file's indentation (its first indented line's), or two spaces */
const jsonIndent = (text: string): string =>
  /\n([ \t]+)\S/.exec(text)?.[1] ?? "  ";

/**
 * A config file's text with changes to its top-level settings: YAML keeps its comments and layout (see `parseDocument`),
 * JSON keeps its indentation. Throws for JavaScript files, which can't be changed safely.
 *
 * @example
 * changeConfigText("edahaconfig.yml", "# My site\nname: News\n", { name: "Notes" }); // "# My site\nname: Notes\n"
 */
export const changeConfigText = (
  file: string,
  text: string,
  changes: ConfigChanges,
): string => {
  const extension = extname(file).slice(1);
  const entries = Object.entries(changes);
  if (extension === "yml" || extension === "yaml") {
    const document = parseDocument(text);
    if (document.errors.length) throw document.errors[0] as Error;
    for (const [key, value] of entries)
      if (value === undefined) document.delete(key);
      else document.set(key, value);
    return document.toString();
  }
  if (extension === "json") {
    // Changed settings keep their places, and new ones go last
    const settings = Object.fromEntries(
      Object.entries({
        ...(JSON.parse(text) as Record<string, unknown>),
        ...changes,
      }).filter(([, value]) => value !== undefined),
    );
    return `${JSON.stringify(settings, null, jsonIndent(text))}\n`;
  }
  throw new Error(
    "only YAML and JSON config files can be changed; change a JavaScript config file yourself",
  );
};

/**
 * Change a config file's top-level settings, e.g. from an app's settings screen. YAML files keep their comments and
 * layout; JSON files keep their indentation; JavaScript files aren't changed. The changed settings are validated as
 * `loadSiteConfig` does before the file is written (to a temporary file, then renamed, so it's never half-written).
 * Gives the site's new config. Throws, naming the file, if it can't be changed or the changed settings can't be used,
 * leaving the file as it was.
 *
 * @example
 * await updateConfigFile("my-site/edahaconfig.yml", { name: "Notes", siteUrl: undefined });
 */
export const updateConfigFile = async (
  file: string,
  changes: ConfigChanges,
): Promise<SiteConfig> => {
  const configFile = resolve(file);
  let text: string;
  try {
    text = changeConfigText(
      configFile,
      await readFile(configFile, "utf8"),
      changes,
    );
  } catch (error) {
    throw fileError(configFile, error);
  }
  const extension = extname(configFile).slice(1);
  const site = await siteConfigFrom(
    configFile,
    extension === "json" ? JSON.parse(text) : parse(text),
  );
  const temporary = `${configFile}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, text);
    await rename(temporary, configFile);
  } catch (error) {
    // Removing it can fail too (e.g. it's a folder); the first problem is the one to tell
    await rm(temporary, { force: true }).catch(() => undefined);
    throw fileError(configFile, error);
  }
  return site;
};
