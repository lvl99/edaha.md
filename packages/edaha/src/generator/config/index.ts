import { isAbsolute, normalize, sep } from "node:path";
import { checkEmbedPlugins } from "../../embeds/index.ts";
import type { EmbedPlugin } from "../../embeds/types/index.ts";
import { isSlug, slugify } from "../slug/index.ts";
import type { AuthorConfig } from "../article/index.ts";
import {
  parseMetadata,
  parseTypeMetadata,
  type MetadataDefinitions,
} from "../metadata/index.ts";
import {
  metadataLayout,
  parseMetadataGroups,
  type MetadataGroupConfig,
} from "../metadataGroups/index.ts";

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
  /** The type's URL path ("" for the site's root), e.g. "news" */
  path: string;
  /** Label for one article, e.g. "Article" */
  labelSingle: string;
  /** Label for several articles, e.g. "Articles" */
  labelPlural: string;
  /** What is built for the type */
  generate: GenerateConfig;
  /** The custom metadata fields the type uses: those listed, none for `false`, or all when undefined */
  metadata?: string[] | false | undefined;
  /** The author of the type's articles that don't name one, or `false` for none. Default: the site's `author` */
  author?: AuthorConfig | false | undefined;
}

/** Where new uploads go: the article's folder, the top of the shared files folder, or its year/month folders */
export const FILES_UPLOAD_TO = ["article", "files", "files-by-date"] as const;

/** Where new uploads go (see `FILES_UPLOAD_TO`) */
export type FilesUploadTo = (typeof FILES_UPLOAD_TO)[number];

/** Settings of the shared files folder: files any article can use, besides the files in its own folder */
export interface FilesConfig {
  /** The shared files folder, relative to the site folder and inside it. It may not exist. Default: "files" */
  dir: string;
  /** The website path articles use for shared files, as folders without slashes around them. Default: "files" */
  path: string;
  /**
   * Optional; the absolute URL shared files are hosted at (e.g. "https://static.example.com/"), used for them in built
   * pages instead of `path`. Default: none (they are published with the website)
   */
  url?: string | undefined;
  /** Where the build copies shared files when `url` is set, relative to the site folder. Default: "build-files" */
  outputDir: string;
  /** Where new uploads go in the editor. Default: "article" */
  uploadTo: FilesUploadTo;
}

/** The site's settings from the config file */
export interface EdahaConfig {
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
  /**
   * Optional; the theme the site's templates and static files override: a folder path relative to the site folder
   * (starting with "." or absolute), or an installed theme package's name. Default: edaha.md's default theme
   */
  theme?: string | undefined;
  /** Optional; where built files are copied to, relative to the site folder (e.g. another app's build folder) */
  publishDir?: string | undefined;
  /** Optional; the website's absolute URL for feeds, used when the `SITE_URL` environment variable isn't set */
  siteUrl?: string | undefined;
  /** Paths at the website's root that the site can't use, e.g. another app's routes. Default: none */
  reservedPaths: string[];
  /** The shared files folder's settings */
  files: FilesConfig;
  /** Article type settings, by type */
  types: Record<string, ArticleTypeConfig>;
  /**
   * Embed plugins, for `<!-- embed:<key> -->` blocks. The config file names their packages (loaded by loadSiteConfig);
   * a JavaScript config file can also give the plugins themselves. Default: none
   */
  plugins: EmbedPlugin[];
  /** Custom metadata fields' JSON Schemas, by the key articles store their values under. Default: none */
  metadata: MetadataDefinitions;
  /** Groups of settings in the editor, besides the built-in ones, by key. Default: none */
  metadataGroups: Record<string, MetadataGroupConfig>;
  /** The author of articles that don't name one (unless their type has its own), or `false` for none. Default: none (the website's name is used) */
  author?: AuthorConfig | false | undefined;
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
const TYPE_KEYS = [
  "labelSingle",
  "labelPlural",
  "path",
  "generate",
  "metadata",
  "author",
];

/** The site's settings */
const CONFIG_KEYS = [
  "name",
  "description",
  "path",
  "outputDir",
  "articlesDir",
  "templatesDir",
  "staticDir",
  "theme",
  "publishDir",
  "siteUrl",
  "reservedPaths",
  "files",
  "types",
  "plugins",
  "metadata",
  "metadataGroups",
  "author",
];

/** Settings under `files` */
const FILES_KEYS: (keyof FilesConfig)[] = [
  "dir",
  "path",
  "url",
  "outputDir",
  "uploadTo",
];

/** The shared files folder's default settings */
export const DEFAULT_FILES_CONFIG: FilesConfig = {
  dir: "files",
  path: "files",
  outputDir: "build-files",
  uploadTo: "article",
};

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
  config.author = parseAuthor(fields.author, `"types.${type}.author"`);
  config.metadata = parseTypeMetadata(
    fields.metadata,
    `"types.${type}.metadata"`,
  );
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
 * Read a default author: a name, a map with a `name` and optionally an `email` and `url` (like an article's), or `false`
 * for none.
 *
 * @param what - the setting, for errors, e.g. '"author"'
 *
 * @example
 * parseAuthor("Matt", '"author"'); // { name: "Matt" }
 * parseAuthor(false, '"author"'); // false
 */
const parseAuthor = (
  value: unknown,
  what: string,
): AuthorConfig | false | undefined => {
  if (value === undefined || value === null) return undefined;
  if (value === false) return false;
  const nameNeeded = `${what} needs a name with letters or numbers, or false for no author`;
  if (typeof value === "string") {
    if (!slugify(value)) throw new Error(nameNeeded);
    return { name: value.trim() };
  }
  const fields = asMap(value, what);
  checkKeys(fields, ["name", "email", "url"], what);
  const name = optionalString(fields, "name");
  if (!name || !slugify(name)) throw new Error(nameNeeded);
  return {
    name,
    email: optionalString(fields, "email"),
    url: optionalString(fields, "url"),
  };
};

/**
 * Read a required, non-empty string field from parsed YAML.
 */
const requireString = (
  data: Record<string, unknown>,
  field: string,
  what = `"${field}"`,
) => {
  const value = data[field];
  if (typeof value !== "string" || value.trim() === "")
    throw new Error(`${what} must be a non-empty string`);
  return value.trim();
};

/**
 * Read an optional, non-empty string field from parsed YAML.
 */
const optionalString = (
  data: Record<string, unknown>,
  field: string,
  what?: string,
) =>
  data[field] === undefined || data[field] === null
    ? undefined
    : requireString(data, field, what);

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
  field: string,
  fallback: string,
  what = `"${field}"`,
): string => {
  const value = optionalString(data, field, what) ?? fallback;
  const folder = normalize(value).split(sep).join("/").replace(/\/$/, "");
  if (isAbsolute(value) || folder === "." || folder.split("/")[0] === "..")
    throw new Error(
      `${what} must be a folder inside the site folder, got "${value}"`,
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
    fields.map((field) => [
      field,
      parseFolder(data, field, SOURCE_FOLDERS[field]),
    ]),
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

/**
 * Read the optional embed plugins. Package names in the config file are loaded by loadSiteConfig before this, so only
 * plugin objects are left.
 */
const parsePlugins = (data: Record<string, unknown>): EmbedPlugin[] => {
  const value = data.plugins;
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value))
    throw new Error(
      '"plugins" must be a list of embed plugin package names (or, in a JavaScript config file, embed plugins)',
    );
  if (value.some((plugin) => typeof plugin === "string"))
    throw new Error(
      '"plugins" package names are loaded by loadSiteConfig; pass embed plugins to parseConfig',
    );
  return checkEmbedPlugins(value);
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
 * Read the shared files folder's settings (`files`), filling in defaults. Its folder must be apart from the source
 * folders, and its path is folders of lowercase letters, numbers, ".", "_" or "-", e.g. "/files/" or "/media/shared/".
 *
 * @param sourceFolders - the articles, templates and static files folders
 *
 * @example
 * parseFiles({ files: { path: "/media/", uploadTo: "files-by-date" } }, folders);
 * // { dir: "files", path: "media", outputDir: "build-files", uploadTo: "files-by-date" }
 */
const parseFiles = (
  data: Record<string, unknown>,
  sourceFolders: Record<SourceFolder, string>,
): FilesConfig => {
  const value = data.files;
  if (value === undefined || value === null) return { ...DEFAULT_FILES_CONFIG };
  const fields = asMap(value, '"files"');
  checkKeys(fields, FILES_KEYS, '"files"');
  const dir = parseFolder(
    fields,
    "dir",
    DEFAULT_FILES_CONFIG.dir,
    '"files.dir"',
  );
  for (const [field, folder] of Object.entries(sourceFolders))
    if (overlaps(dir, folder))
      throw new Error(
        `"files.dir" and "${field}" must be apart from each other, got "${dir}" and "${folder}"`,
      );
  const path = (
    optionalString(fields, "path", '"files.path"') ?? DEFAULT_FILES_CONFIG.path
  ).replace(/^\/+|\/+$/g, "");
  if (!path.split("/").every((part) => /^[a-z0-9][a-z0-9._-]*$/.test(part)))
    throw new Error(
      `"files.path" must be a website path of lowercase folders, e.g. "/files/", got "${String(fields.path)}"`,
    );
  const url = optionalString(fields, "url", '"files.url"');
  if (url !== undefined && !/^https?:\/\/[^/]/.test(url))
    throw new Error(
      '"files.url" must be an absolute http(s) URL, e.g. "https://static.example.com/"',
    );
  const uploadTo = fields.uploadTo ?? DEFAULT_FILES_CONFIG.uploadTo;
  if (!FILES_UPLOAD_TO.includes(uploadTo as FilesUploadTo))
    throw new Error(
      `"files.uploadTo" must be ${FILES_UPLOAD_TO.map((option) => `"${option}"`).join(", ")}, got "${String(uploadTo)}"`,
    );
  return {
    dir,
    path,
    url: url && url.replace(/\/*$/, "/"),
    outputDir:
      optionalString(fields, "outputDir", '"files.outputDir"') ??
      DEFAULT_FILES_CONFIG.outputDir,
    uploadTo: uploadTo as FilesUploadTo,
  };
};

/**
 * Validate the settings read from the site's config file and fill in defaults.
 */
const validateConfig = (data: unknown): EdahaConfig => {
  const fields = asMap(data, "the config file");
  checkKeys(fields, CONFIG_KEYS, "site");
  const types =
    fields.types === undefined || fields.types === null
      ? {}
      : asMap(fields.types, '"types"');
  const metadata = parseMetadata(fields.metadata);
  const metadataGroups = parseMetadataGroups(fields.metadataGroups);
  // Every field's group, and what each field and group follows, must exist
  metadataLayout(metadata, metadataGroups);
  const typeConfigs = Object.fromEntries(
    Object.entries(types).map(([type, value]) => [
      type,
      parseTypeConfig(type, value),
    ]),
  );
  const sourceFolders = parseSourceFolders(fields);
  // Types can only use custom metadata that is defined
  for (const [type, { metadata: keys }] of Object.entries(typeConfigs))
    for (const key of keys || [])
      if (!(key in metadata))
        throw new Error(
          `"types.${type}.metadata" lists "${key}", which isn't defined in "metadata"`,
        );
  return {
    name: requireString(fields, "name"),
    description: requireString(fields, "description"),
    path: parsePath(fields.path, '"path"') ?? "",
    outputDir: optionalString(fields, "outputDir") ?? "build",
    ...sourceFolders,
    files: parseFiles(fields, sourceFolders),
    theme: optionalString(fields, "theme"),
    publishDir: optionalString(fields, "publishDir"),
    siteUrl: parseSiteUrl(fields),
    reservedPaths: parseReservedPaths(fields),
    plugins: parsePlugins(fields),
    metadata,
    metadataGroups,
    author: parseAuthor(fields.author, '"author"'),
    types: typeConfigs,
  };
};

/**
 * Validate the settings read from the site's config file (YAML, JSON or JavaScript) and fill in defaults. Errors start
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
): EdahaConfig => {
  try {
    return validateConfig(data);
  } catch (error) {
    throw new Error(`${source}: ${(error as Error).message}`, { cause: error });
  }
};
