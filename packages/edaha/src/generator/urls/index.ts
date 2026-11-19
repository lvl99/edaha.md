import type { ArticleTypeConfig } from "../config/index.ts";

/** Folders inside a type's URL path used by its tag and author lists */
export const RESERVED_SLUGS = ["tags", "authors"];

/**
 * Join URL path segments into a folder path relative to the website's root, ignoring empty segments.
 *
 * @example
 * folderPath("", "news"); // "news/"
 * folderPath("", ""); // ""
 */
export const folderPath = (...segments: string[]): string =>
  segments
    .filter(Boolean)
    .map((segment) => `${segment}/`)
    .join("");

/**
 * The root-relative URL of a folder path, under the website's base URL (see baseUrlOf).
 *
 * @example
 * folderUrl("news/"); // "/news/"
 * folderUrl(""); // "/"
 * folderUrl("news/", "/edaha.md"); // "/edaha.md/news/"
 */
export const folderUrl = (folder: string, baseUrl = ""): string =>
  `${baseUrl}/${folder}`;

/**
 * The URL path a website lives under: its absolute URL's path, without a trailing slash, or "" at a domain's root.
 * Every URL in its pages starts with it, e.g. for a website in a sub-folder like a GitHub Pages project site.
 *
 * @example
 * baseUrlOf("https://lvl99.github.io/edaha.md"); // "/edaha.md"
 * baseUrlOf("https://example.com/"); // ""
 */
export const baseUrlOf = (siteUrl: string): string =>
  new URL(siteUrl).pathname.replace(/\/+$/, "");

/**
 * Check article types' URL paths: no two the same, and none clashing with the website's reserved paths at its root
 * (`reservedPaths` in the config file). Throws an Error describing the first problem.
 *
 * @param sitePath - the site's URL path prefix
 * @param reservedPaths - paths at the website's root that the site can't use, e.g. another app's routes
 *
 * @example
 * checkTypePaths("", { app: defaultTypeConfig("app") }, ["app"]); // throws: type "app" can't use the path "app"
 */
export const checkTypePaths = (
  sitePath: string,
  types: Record<string, ArticleTypeConfig>,
  reservedPaths: readonly string[] = [],
): void => {
  const seen = new Map<string, string>();
  for (const [type, { path }] of Object.entries(types)) {
    const other = seen.get(path);
    if (other !== undefined)
      throw new Error(
        `types "${other}" and "${type}" have the same path "${path}"`,
      );
    seen.set(path, type);
    if (!sitePath && reservedPaths.includes(path))
      throw new Error(
        `type "${type}" can't use the path "${path}", which is reserved`,
      );
  }
};

/**
 * Why an article slug can't be used in a type, or undefined if it can. Slugs can't be the tag and author list folders
 * or numbers (list pages), and at the website's root, its reserved paths or another type's path.
 *
 * @param reservedPaths - paths at the website's root that the site can't use (`reservedPaths` in the config file)
 *
 * @example
 * slugProblem("tags", "news", "", types); // 'the slug "tags" is used by tag lists'
 */
export const slugProblem = (
  slug: string,
  type: string,
  sitePath: string,
  types: Record<string, ArticleTypeConfig>,
  reservedPaths: readonly string[] = [],
): string | undefined => {
  if (RESERVED_SLUGS.includes(slug))
    return `the slug "${slug}" is used by ${slug === "tags" ? "tag" : "author"} lists`;
  if (/^\d+$/.test(slug)) return `the slug "${slug}" is used by list pages`;
  // A type that isn't configured is at its own name
  const atRoot = !sitePath && !(types[type]?.path ?? type);
  if (atRoot && reservedPaths.includes(slug))
    return `the slug "${slug}" is reserved`;
  if (atRoot) {
    const other = Object.entries(types).find(
      ([name, config]) => name !== type && config.path === slug,
    );
    if (other) return `the slug "${slug}" is the path of type "${other[0]}"`;
  }
  return undefined;
};
