import { isAbsolute, normalize, sep } from "node:path";
import type { EmbedRenderer } from "../../embeds/types/index.ts";
import { isSlug } from "../slug/index.ts";

/** What is built for an article type */
export interface GenerateConfig {
  /** Build the type's articles (when false, nothing else is built for it either) */
  article: boolean;
  /** Build the type's list pages, and include its articles in the all-articles list */
  list: boolean;
  /** Build the type's feed, and include its articles in the all-articles, tag and author feeds */
  feed: boolean;
  /** Include the type's articles in author lists */
  author: boolean;
  /** Include the type's articles in tag lists */
  tag: boolean;
}

/** Settings of an article type */
export interface ArticleTypeConfig {
  /** The type's URL path ("" for the blog's root), e.g. "news" */
  path: string;
  /** Label for one article, e.g. "Article" */
  labelSingle: string;
  /** Label for several articles, e.g. "Articles" */
  labelPlural: string;
  /** What is built for the type */
  generate: GenerateConfig;
}

/** Blog-level settings from the config file */
export interface BlogConfig {
  /** The name of the website */
  name: string;
  /** The description of the website */
  description: string;
  /** The URL path prefix of every article type ("" for the website's root) */
  path: string;
  /** The build folder, relative to the site folder and inside it (emptied on every build). Default: "build" */
  outputDir: string;
  /** The articles folder, relative to the site folder and inside it. Default: "articles" */
  articlesDir: string;
  /** The site's templates folder, over the theme's, relative to the site folder and inside it. Default: "templates" */
  templatesDir: string;
  /** The site's static files folder, over the theme's, relative to the site folder and inside it. Default: "static" */
  staticDir: string;
  /** Optional; where built files are copied to, relative to the site folder (e.g. another app's build folder) */
  publishDir?: string | undefined;
  /** Optional; the website's absolute URL for feeds, used when the `SITE_URL` environment variable isn't set */
  siteUrl?: string | undefined;
  /** Paths at the website's root that the blog can't use, e.g. another app's routes. Default: none */
  reservedPaths: string[];
  /** Article type settings, by type */
  types: Record<string, ArticleTypeConfig>;
  /** Custom embed renderers, tried before the built-in ones. Only JavaScript config files can set them. Default: none */
  embeds: EmbedRenderer[];
}

/** Settings under `generate` */
const GENERATE_KEYS: (keyof GenerateConfig)[] = [
  "article",
  "list",
  "feed",
  "author",
  "tag",
];

/** Settings of an article type */
const TYPE_KEYS = ["labelSingle", "labelPlural", "path", "generate"];

/** Blog settings */
const CONFIG_KEYS = [
  "name",
  "description",
  "path",
  "outputDir",
  "articlesDir",
  "templatesDir",
  "staticDir",
  "publishDir",
  "siteUrl",
  "reservedPaths",
  "types",
  "embeds",
];

/** List folders that can't be used as article types */
export const RESERVED_TYPES = ["tags", "authors"];

/**
 * Settings for an article type that isn't configured: everything generated, labelled from its name.
 *
 * @example
 * defaultTypeConfig("video"); // { path: "video", labelSingle: "Video", labelPlural: "Videos", generate: { article: true, ... } }
 */
export const defaultTypeConfig = (type: string): ArticleTypeConfig => {
  const labelSingle = type.charAt(0).toUpperCase() + type.slice(1);
  return {
    path: type,
    labelSingle,
    labelPlural: `${labelSingle}s`,
    generate: {
      article: true,
      list: true,
      feed: true,
      author: true,
      tag: true,
    },
  };
};

/** Check a value is a map, throwing a config error if not */
const asMap = (value: unknown, what: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${what} must be a map of settings`);
  return value as Record<string, unknown>;
};

/**
 * Read an optional URL path: lowercase kebab-case, or "" for the root.
 */
const parsePath = (value: unknown, what: string): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || (value !== "" && !isSlug(value)))
    throw new Error(`${what} must be lowercase kebab-case, or "" for the root`);
  return value;
};

/** Throw a config error for keys that aren't allowed */
const checkKeys = (
  map: Record<string, unknown>,
  allowed: string[],
  what: string,
) => {
  const unknown = Object.keys(map).filter((key) => !allowed.includes(key));
  if (unknown.length)
    throw new Error(
      `unknown ${what} setting${unknown.length > 1 ? "s" : ""} ${unknown.map((key) => `"${key}"`).join(", ")}`,
    );
};

/**
 * Parse one article type's settings, filling in defaults.
 */
const parseTypeConfig = (type: string, value: unknown): ArticleTypeConfig => {
  if (!isSlug(type) || RESERVED_TYPES.includes(type))
    throw new Error(
      `type "${type}" must be lowercase kebab-case and not ${RESERVED_TYPES.join(" or ")}`,
    );
  const config = defaultTypeConfig(type);
  if (value === null || value === undefined) return config;
  const fields = asMap(value, `"types.${type}"`);
  checkKeys(fields, TYPE_KEYS, `"types.${type}"`);
  for (const label of ["labelSingle", "labelPlural"] as const) {
    const text = fields[label];
    if (text === undefined) continue;
    if (typeof text !== "string" || !text.trim())
      throw new Error(`"types.${type}.${label}" must be a non-empty string`);
    config[label] = text.trim();
  }
  config.path = parsePath(fields.path, `"types.${type}.path"`) ?? type;
  const generate = fields.generate;
  if (generate === false)
    for (const key of GENERATE_KEYS) config.generate[key] = false;
  else if (generate !== undefined && generate !== true) {
    const flags = asMap(generate, `"types.${type}.generate"`);
    checkKeys(flags, GENERATE_KEYS, `"types.${type}.generate"`);
    for (const key of GENERATE_KEYS) {
      const flag = flags[key];
      if (flag === undefined) continue;
      if (typeof flag !== "boolean")
        throw new Error(
          `"types.${type}.generate.${key}" must be true or false`,
        );
      config.generate[key] = flag;
    }
  }
  // Without articles, nothing else can be built
  if (!config.generate.article)
    for (const key of GENERATE_KEYS) config.generate[key] = false;
  return config;
};

/**
 * Read a required, non-empty string field from parsed YAML.
 */
const requireString = (data: Record<string, unknown>, field: string) => {
  const value = data[field];
  if (typeof value !== "string" || value.trim() === "")
    throw new Error(`"${field}" must be a non-empty string`);
  return value.trim();
};

/**
 * Read an optional, non-empty string field from parsed YAML.
 */
const optionalString = (data: Record<string, unknown>, field: string) =>
  data[field] === undefined || data[field] === null
    ? undefined
    : requireString(data, field);

/**
 * Read the optional site URL: an absolute http(s) URL.
 */
const parseSiteUrl = (data: Record<string, unknown>) => {
  const value = optionalString(data, "siteUrl");
  if (value !== undefined && !/^https?:\/\/[^/]/.test(value))
    throw new Error(
      '"siteUrl" must be an absolute http(s) URL, e.g. "https://example.com"',
    );
  return value;
};

/**
 * Read the optional list of reserved paths: URL path segments or file names, e.g. "app" or "jwks.json".
 */
/** The site's source folders' settings, with their defaults */
export const SOURCE_FOLDERS = {
  articlesDir: "articles",
  templatesDir: "templates",
  staticDir: "static",
} as const;

/** A setting for one of the site's source folders */
type SourceFolder = keyof typeof SOURCE_FOLDERS;

/**
 * Read an optional source folder setting: a folder inside the site folder (not the site folder itself). Gives the folder
 * with "/" separators.
 */
const parseFolder = (
  data: Record<string, unknown>,
  field: SourceFolder,
): string => {
  const value = optionalString(data, field) ?? SOURCE_FOLDERS[field];
  const folder = normalize(value).split(sep).join("/").replace(/\/$/, "");
  if (isAbsolute(value) || folder === "." || folder.split("/")[0] === "..")
    throw new Error(
      `"${field}" must be a folder inside the site folder, got "${value}"`,
    );
  return folder;
};

/** Whether one folder (with "/" separators) is the other or inside it */
const overlaps = (a: string, b: string) =>
  a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);

/**
 * Read the source folders (articles, templates and static files), which must be apart from each other.
 */
const parseSourceFolders = (
  data: Record<string, unknown>,
): Record<SourceFolder, string> => {
  const fields = Object.keys(SOURCE_FOLDERS) as SourceFolder[];
  const folders = Object.fromEntries(
    fields.map((field) => [field, parseFolder(data, field)]),
  ) as Record<SourceFolder, string>;
  fields.forEach((a, i) => {
    for (const b of fields.slice(i + 1))
      if (overlaps(folders[a], folders[b]))
        throw new Error(
          `"${a}" and "${b}" must be apart from each other, got "${folders[a]}" and "${folders[b]}"`,
        );
  });
  return folders;
};

/** Whether a value is an embed renderer: a name, match and render functions, and optional frame sources */
const isEmbedRenderer = (value: unknown): value is EmbedRenderer => {
  if (!value || typeof value !== "object") return false;
  const { name, match, render, frameSources } = value as Record<
    string,
    unknown
  >;
  return (
    typeof name === "string" &&
    name.trim() !== "" &&
    typeof match === "function" &&
    typeof render === "function" &&
    (frameSources === undefined ||
      (Array.isArray(frameSources) &&
        frameSources.every(
          (source) =>
            typeof source === "string" && /^https:\/\/[^/\s;]+$/.test(source),
        )))
  );
};

/**
 * Read the optional custom embed renderers: a list of `{ name, match, render, frameSources? }` objects, which only a
 * JavaScript config file can hold.
 */
const parseEmbeds = (data: Record<string, unknown>): EmbedRenderer[] => {
  const value = data.embeds;
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || !value.every(isEmbedRenderer))
    throw new Error(
      '"embeds" must be a list of embed renderers ({ name, match(url), render(url, context), frameSources? } with https origins), set in a JavaScript config file',
    );
  return value;
};

const parseReservedPaths = (data: Record<string, unknown>): string[] => {
  const value = data.reservedPaths;
  if (value === undefined || value === null) return [];
  if (
    !Array.isArray(value) ||
    value.some(
      (path) =>
        typeof path !== "string" || !/^[a-z0-9][a-z0-9._-]*$/.test(path),
    )
  )
    throw new Error(
      '"reservedPaths" must be a list of lowercase paths at the website\'s root, e.g. ["app", "api"]',
    );
  return value as string[];
};

/**
 * Validate the settings read from the blog's config file and fill in defaults.
 */
const validateConfig = (data: unknown): BlogConfig => {
  const fields = asMap(data, "the config file");
  checkKeys(fields, CONFIG_KEYS, "blog");
  const types =
    fields.types === undefined || fields.types === null
      ? {}
      : asMap(fields.types, '"types"');
  return {
    name: requireString(fields, "name"),
    description: requireString(fields, "description"),
    path: parsePath(fields.path, '"path"') ?? "",
    outputDir: optionalString(fields, "outputDir") ?? "build",
    ...parseSourceFolders(fields),
    publishDir: optionalString(fields, "publishDir"),
    siteUrl: parseSiteUrl(fields),
    reservedPaths: parseReservedPaths(fields),
    embeds: parseEmbeds(fields),
    types: Object.fromEntries(
      Object.entries(types).map(([type, value]) => [
        type,
        parseTypeConfig(type, value),
      ]),
    ),
  };
};

/**
 * Validate the settings read from the blog's config file (YAML, JSON or JavaScript) and fill in defaults. Errors start
 * with the config file's name.
 *
 * @param source - the config file's name, for errors
 *
 * @example
 * parseConfig({ name: "News", description: "Updates" }, "edaha.config.json");
 */
export const parseConfig = (
  data: unknown,
  source: string = "config",
): BlogConfig => {
  try {
    return validateConfig(data);
  } catch (error) {
    throw new Error(`${source}: ${(error as Error).message}`, { cause: error });
  }
};
