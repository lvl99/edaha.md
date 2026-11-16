import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import nunjucks from "nunjucks";
import { formatDate, formatRfc822 } from "../format/index.ts";
import type { Logger, TemplateData } from "../types/index.ts";

/** Templates that must exist for the build to run */
export const REQUIRED_TEMPLATES = [
  "layouts/html.njk",
  "layouts/rssfeed.njk",
  "article/single.njk",
  "article/list.njk",
];

/**
 * Template names starting with this always load from the last template folder (the default theme's), e.g.
 * `{% extends "@theme/article/single.njk" %}` in a site's own `article/single.njk`, to build on the theme's version.
 */
export const THEME_PREFIX = "@theme/";

/**
 * A Nunjucks loader for template names starting with THEME_PREFIX, from one folder. Other names are left to the next
 * loader.
 *
 * @example
 * themeLoader("/theme/templates").getSource("@theme/article/single.njk"); // the theme's article/single.njk
 */
export const themeLoader = (dir: string): nunjucks.ILoader => {
  const files = new nunjucks.FileSystemLoader(dir);
  return {
    getSource: (name) =>
      name.startsWith(THEME_PREFIX)
        ? files.getSource(name.slice(THEME_PREFIX.length))
        : // Nunjucks' loaders answer null for templates they don't have
          (null as unknown as nunjucks.LoaderSource),
  };
};

/**
 * Make root-relative `href` and `src` URLs in HTML absolute, e.g. for RSS feeds read outside the website.
 *
 * @example
 * absoluteUrls('<a href="/news/">', "https://example.com"); // '<a href="https://example.com/news/">'
 */
export const absoluteUrls = (html: string, siteUrl: string): string =>
  html.replace(/(\s(?:href|src)=")\/(?!\/)/g, `$1${siteUrl}/`);

/**
 * Loads and renders the blog's Nunjucks templates from one or more folders. A file in an earlier folder overrides the
 * same file in later ones (e.g. a site's templates over the default theme's). Falls back to the `article` templates
 * (with a warning) when an article type has none of its own. Names starting with THEME_PREFIX (`@theme/`) load from
 * the last folder only.
 *
 * @example
 * const templates = new Templates(["site/templates", join(THEME_DIR, "templates")], console);
 * templates.render(templates.resolve("article", "single"), data);
 */
export class Templates {
  private readonly dirs: string[];
  private readonly logger: Logger;
  private readonly env: nunjucks.Environment;
  private readonly warned = new Set<string>();

  /**
   * Throws if any of the required templates are missing.
   */
  constructor(dirs: string | string[], logger: Logger) {
    this.dirs = typeof dirs === "string" ? [dirs] : dirs;
    const missing = REQUIRED_TEMPLATES.filter((file) => !this.exists(file));
    if (missing.length)
      throw new Error(
        `Missing required templates in ${this.dirs.join(", ")}: ${missing.join(", ")}`,
      );
    this.logger = logger;
    this.env = new nunjucks.Environment(
      [
        themeLoader(this.dirs.at(-1) as string),
        new nunjucks.FileSystemLoader(this.dirs),
      ],
      {
        autoescape: true,
        // Keep the generated HTML free of blank lines left by template tags
        trimBlocks: true,
        lstripBlocks: true,
      },
    );
    this.env.addFilter("date", formatDate);
    this.env.addFilter("rfc822", formatRfc822);
    this.env.addFilter("absoluteUrls", absoluteUrls);
  }

  /**
   * Whether a template file or folder exists in any of the template folders.
   *
   * @example
   * templates.exists("page/home.njk"); // true
   */
  private exists(file: string): boolean {
    return this.dirs.some((dir) => existsSync(join(dir, file)));
  }

  /**
   * The template file for an article type's template name (e.g. "single", "list" or "home"). Types without their own
   * templates folder use `templates/article/`; a type folder without the template falls back to `templates/article/`
   * with a warning (once per file). Throws if the template exists in neither.
   *
   * @example
   * templates.resolve("page", "home"); // "page/home.njk" if it exists, otherwise "article/home.njk"
   */
  resolve(type: string, name: string): string {
    const file = `${type}/${name}.njk`;
    if (this.exists(file)) return file;
    const fallback = `article/${name}.njk`;
    if (!this.exists(fallback))
      throw new Error(
        `Template "${name}" not found: looked for ${file} and ${fallback} in ${this.dirs.join(" and ")}`,
      );
    if (this.exists(type) && !this.warned.has(file)) {
      this.warned.add(file);
      this.logger.warn(`Template ${file} not found; using ${fallback}`);
    }
    return fallback;
  }

  /**
   * The template names an article of a type can use (its own and the default ones, except "list"), sorted.
   *
   * @example
   * templates.names("page"); // ["home", "single"]
   */
  names(type: string): string[] {
    const names = new Set<string>();
    for (const dir of this.dirs)
      for (const folder of ["article", type]) {
        try {
          for (const file of readdirSync(join(dir, folder)))
            if (file.endsWith(".njk") && file !== "list.njk")
              names.add(file.slice(0, -4));
        } catch {
          // A type without its own templates folder
        }
      }
    return [...names].sort();
  }

  /**
   * Render a template with the given data.
   */
  render(file: string, data: TemplateData): string {
    return this.env.render(file, data);
  }
}
