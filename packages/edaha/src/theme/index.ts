import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type { AuthorConfig } from "../generator/article/index.ts";

/**
 * edaha.md's default theme folder (the `@lvl99dotcom/edaha-theme-default` package), which holds `templates/` and
 * `static/`. A site's own `templates/` and `static/` override its files one by one.
 *
 * @example
 * join(THEME_DIR, "templates"); // ".../node_modules/@lvl99dotcom/edaha-theme-default/templates"
 */
export const THEME_DIR = dirname(
  fileURLToPath(
    import.meta.resolve("@lvl99dotcom/edaha-theme-default/package.json"),
  ),
);

/** The settings file of a theme that isn't a package: its name, description, version and authors */
export const THEME_FILE = "edahatheme.yml";

/** A theme's name, description, version and authors */
export interface ThemeInfo {
  /** The theme's name */
  name: string;
  /** Optional; what the theme is for */
  description?: string | undefined;
  /** Optional; the theme's version, e.g. "1.0.0" */
  version?: string | undefined;
  /** The theme's authors. Default: none */
  authors: AuthorConfig[];
  /**
   * Whether the theme is a package (it has a package.json, which its info is read from). Packages are installed, so
   * they shouldn't be edited: duplicate them instead.
   */
  isPackage: boolean;
}

/** The settings in a theme's settings file */
const THEME_KEYS = ["name", "description", "version", "authors"];

/** A version number such as "1.0.0" or "2.1.0-beta.1" */
const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/;

/** A package.json author: "Name <email> (url)", where the email and URL are optional */
const PACKAGE_AUTHOR = /^([^<(]*?)\s*(?:<([^>]*)>)?\s*(?:\(([^)]*)\))?\s*$/;

/** Whether a path is a folder */
const isFolder = (path: string): Promise<boolean> =>
  stat(path).then(
    (stats) => stats.isDirectory(),
    () => false,
  );

/**
 * Whether a `theme` setting is a folder path (it starts with "." or is absolute) rather than a package name.
 *
 * @example
 * isThemePath("../themes/my-theme"); // true
 * isThemePath("@my-org/edaha-theme-blog"); // false
 */
export const isThemePath = (theme: string): boolean =>
  theme.startsWith(".") || isAbsolute(theme);

/**
 * Find a theme's folder from a site's `theme` setting: a folder path, relative to the site folder (or absolute), or the
 * name of an installed package, found from the site folder. Throws if the folder or package can't be found.
 *
 * @example
 * await resolveTheme("../themes/my-theme", "/sites/blog"); // "/sites/themes/my-theme"
 * await resolveTheme("@lvl99dotcom/edaha-theme-default", "/sites/blog"); // ".../node_modules/@lvl99dotcom/edaha-theme-default"
 */
export const resolveTheme = async (
  theme: string,
  siteDir: string,
): Promise<string> => {
  if (isThemePath(theme)) {
    const folder = resolve(siteDir, theme);
    if (await isFolder(folder)) return folder;
    throw new Error(`theme folder "${theme}" not found at ${folder}`);
  }
  // Packages are found like Node.js finds them, without needing their `exports` to include package.json. Node.js's
  // own modules (e.g. "fs") have no folders to look in
  const folders = (
    createRequire(join(siteDir, "package.json")).resolve.paths(theme) ?? []
  ).map((modules) => join(modules, theme));
  for (const folder of folders) if (await isFolder(folder)) return folder;
  throw new Error(`theme package "${theme}" not found; is it installed?`);
};

/** Check a value is a non-empty string, or undefined/null, throwing an error naming the setting if not */
const optionalText = (value: unknown, what: string): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${what} must be a non-empty string`);
  return value.trim();
};

/**
 * Read a theme author: a name, or a map with a `name` and optionally an `email` and `url`.
 *
 * @param setting - the author's setting, for errors, e.g. "authors[0]"
 */
const parseThemeAuthor = (value: unknown, setting: string): AuthorConfig => {
  const what = `"${setting}"`;
  if (typeof value === "string") {
    const name = optionalText(value, what);
    if (name) return { name };
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const fields = value as Record<string, unknown>;
    const unknown = Object.keys(fields).filter(
      (key) => !["name", "email", "url"].includes(key),
    );
    if (unknown.length)
      throw new Error(`${what} has unknown settings: ${unknown.join(", ")}`);
    const name = optionalText(fields.name, `"${setting}.name"`);
    if (name)
      return {
        name,
        email: optionalText(fields.email, `"${setting}.email"`),
        url: optionalText(fields.url, `"${setting}.url"`),
      };
  }
  throw new Error(`${what} must be a name, or a map with a name`);
};

/**
 * Validate a theme settings file's settings (see THEME_FILE). Errors start with the source's name.
 *
 * @param source - the settings file's name, for errors
 *
 * @example
 * parseThemeInfo({ name: "Blog", version: "1.0.0", authors: ["Matt"] });
 * // { name: "Blog", description: undefined, version: "1.0.0", authors: [{ name: "Matt" }], isPackage: false }
 */
export const parseThemeInfo = (
  data: unknown,
  source: string = THEME_FILE,
): ThemeInfo => {
  try {
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("must be a map of settings");
    const fields = data as Record<string, unknown>;
    const unknown = Object.keys(fields).filter(
      (key) => !THEME_KEYS.includes(key),
    );
    if (unknown.length)
      throw new Error(
        `unknown theme settings ${unknown.map((key) => `"${key}"`).join(", ")}`,
      );
    const name = optionalText(fields.name, '"name"');
    if (!name) throw new Error('"name" must be a non-empty string');
    const version = optionalText(fields.version, '"version"');
    if (version !== undefined && !VERSION.test(version))
      throw new Error(`"version" must be a version such as "1.0.0"`);
    const authors = fields.authors ?? [];
    if (!Array.isArray(authors))
      throw new Error('"authors" must be a list of authors');
    return {
      name,
      description: optionalText(fields.description, '"description"'),
      version,
      authors: authors.map((author, i) =>
        parseThemeAuthor(author, `authors[${i}]`),
      ),
      isPackage: false,
    };
  } catch (error) {
    throw new Error(`${source}: ${(error as Error).message}`, { cause: error });
  }
};

/**
 * Read a package.json author or contributor: "Name <email> (url)" or a map with a `name`, `email` and `url`. Gives
 * undefined for anything else.
 *
 * @example
 * packageAuthor("Matt <matt@example.com> (https://example.com)");
 * // { name: "Matt", email: "matt@example.com", url: "https://example.com" }
 */
export const packageAuthor = (value: unknown): AuthorConfig | undefined => {
  if (typeof value === "string") {
    // Every part of the pattern is optional, so every string matches
    const [, name, email, url] = PACKAGE_AUTHOR.exec(
      value.trim(),
    ) as RegExpExecArray;
    return name
      ? { name, email: email || undefined, url: url || undefined }
      : undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const { name, email, url } = value as Record<string, unknown>;
  return typeof name === "string" && name.trim()
    ? {
        name: name.trim(),
        email: typeof email === "string" && email ? email : undefined,
        url: typeof url === "string" && url ? url : undefined,
      }
    : undefined;
};

/** A theme package's info, from its package.json (named after its folder if it has no name) */
const packageThemeInfo = (data: unknown, themeDir: string): ThemeInfo => {
  const fields = (data && typeof data === "object" ? data : {}) as Record<
    string,
    unknown
  >;
  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;
  const contributors = Array.isArray(fields.contributors)
    ? fields.contributors
    : [];
  return {
    name: text(fields.name) ?? basename(themeDir),
    description: text(fields.description),
    version: text(fields.version),
    authors: [fields.author, ...contributors]
      .map(packageAuthor)
      .filter((author): author is AuthorConfig => author !== undefined),
    isPackage: true,
  };
};

/** A file's text, or undefined if it can't be read */
const readText = (path: string): Promise<string | undefined> =>
  readFile(path, "utf8").catch(() => undefined);

/**
 * Read a theme's info: from its package.json if it is a package, else from its settings file (THEME_FILE), else just
 * its folder's name. Throws, naming the file, if the file is invalid.
 *
 * @example
 * await readThemeInfo("themes/blog"); // { name: "Blog", version: "1.0.0", authors: [...], isPackage: false, ... }
 */
export const readThemeInfo = async (themeDir: string): Promise<ThemeInfo> => {
  const packageJson = await readText(join(themeDir, "package.json"));
  if (packageJson !== undefined) {
    try {
      return packageThemeInfo(JSON.parse(packageJson), themeDir);
    } catch (error) {
      throw new Error(`package.json: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }
  const settings = await readText(join(themeDir, THEME_FILE));
  if (settings === undefined)
    return { name: basename(resolve(themeDir)), authors: [], isPackage: false };
  let data: unknown;
  try {
    data = parse(settings);
  } catch (error) {
    throw new Error(`${THEME_FILE}: ${(error as Error).message}`, {
      cause: error,
    });
  }
  return parseThemeInfo(data);
};
