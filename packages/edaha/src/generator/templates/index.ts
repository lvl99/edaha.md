import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import get from "lodash/get.js";
import nunjucks from "nunjucks";
import { formatDate, formatRfc822 } from "../format/index.ts";
import type { Logger, TemplateData } from "../types/index.ts";

/**
 * Templates that must exist for the build to run. Each of them but the HTML layout can have an output extension before
 * `.njk` (e.g. `article/single.json.njk`), see `templateFileName`.
 */
export const REQUIRED_TEMPLATES = [
  "layouts/html.njk",
  "layouts/rssfeed.njk",
  "article/single.njk",
  "article/list.njk",
];

/** What a page template outputs when its file name gives no extension */
export const DEFAULT_OUTPUT_EXTENSION = "html";

/** What the feed template (`layouts/rssfeed.njk`) outputs when its file name gives no extension */
export const FEED_OUTPUT_EXTENSION = "xml";

/** Output extensions whose templates escape values for HTML; other outputs (e.g. JSON, text) are written as they are */
export const ESCAPED_EXTENSIONS: readonly string[] = [
  "html",
  "htm",
  "xhtml",
  "xml",
  "svg",
  "rss",
  "atom",
];

/** Output extensions of HTML pages, the only outputs `{% embedHead %}` and `{% embedFoot %}` output anything in */
export const HTML_EXTENSIONS: readonly string[] = ["html", "htm", "xhtml"];

/** A template file, and the extension of the file it outputs, e.g. `{ file: "article/single.json.njk", extension: "json" }` */
export interface TemplateOutput {
  file: string;
  extension: string;
}

/**
 * A template file's name split into the template's name and the extension of the file it outputs, given before `.njk`
 * (letters and numbers only), or undefined if it gives none. Undefined for a file that isn't a template.
 *
 * @example
 * templateFileName("single.json.njk"); // { name: "single", extension: "json" }
 * templateFileName("single.njk"); // { name: "single", extension: undefined }
 * templateFileName("notes.txt"); // undefined
 */
export const templateFileName = (
  file: string,
): { name: string; extension?: string | undefined } | undefined => {
  const match = /^(.+?)(?:\.([a-z0-9]+))?\.njk$/i.exec(file);
  return match ? { name: match[1] as string, extension: match[2] } : undefined;
};

/**
 * The extension of the file a template outputs: the one in its file name, or else `xml` for the feed template
 * (`layouts/rssfeed.njk`) and `html` for the rest.
 *
 * @example
 * outputExtension("article/single.json.njk"); // "json"
 * outputExtension("article/single.njk"); // "html"
 * outputExtension("@theme/layouts/rssfeed.njk"); // "xml"
 */
export const outputExtension = (file: string): string =>
  templateFileName(basename(file))?.extension ??
  (/(^|\/)layouts\/rssfeed\.njk$/.test(file)
    ? FEED_OUTPUT_EXTENSION
    : DEFAULT_OUTPUT_EXTENSION);

/**
 * Template names starting with this always load from the last template folder (the default theme's), e.g.
 * `{% extends "@theme/article/single.njk" %}` in a site's own `article/single.njk`, to build on the theme's version.
 */
export const THEME_PREFIX = "@theme/";

/**
 * The templates in the given folders for a template's path without `.njk` (e.g. "article/single"), with the extension
 * of each one's output: `single.njk` outputs `defaultExtension`, and `single.json.njk` outputs `json`. A template in an
 * earlier folder (e.g. the site's) overrides one in a later folder (e.g. the theme's) that outputs the same extension,
 * whatever its file name (e.g. a site's `rssfeed.njk` over a theme's `rssfeed.xml.njk`). Throws if two in one folder
 * output the same extension (e.g. `single.njk` and `single.html.njk`).
 *
 * @example
 * findTemplates(["site/templates", "theme/templates"], "article/single", "html");
 * // [{ file: "article/single.njk", extension: "html" }, { file: "article/single.json.njk", extension: "json" }]
 */
export const findTemplates = (
  dirs: readonly string[],
  path: string,
  defaultExtension: string,
): TemplateOutput[] => {
  const slash = path.lastIndexOf("/");
  const folder = path.slice(0, Math.max(slash, 0));
  const name = path.slice(slash + 1);
  const outputs = new Map<string, TemplateOutput>();
  for (const dir of dirs) {
    const own = new Map<string, TemplateOutput>();
    let files: string[] = [];
    try {
      files = readdirSync(join(dir, folder)).sort();
    } catch {
      // A template folder without this folder
    }
    for (const file of files) {
      const parsed = templateFileName(file);
      if (parsed?.name !== name) continue;
      const extension = parsed.extension ?? defaultExtension;
      const relative = folder ? `${folder}/${file}` : file;
      const clash = own.get(extension);
      if (clash)
        throw new Error(
          `${clash.file} and ${relative} in ${dir} both output ${name}'s .${extension} file; rename or remove one of them`,
        );
      own.set(extension, { file: relative, extension });
    }
    for (const [extension, output] of own)
      if (!outputs.has(extension)) outputs.set(extension, output);
  }
  return [...outputs.values()];
};

/**
 * The template file a template name loads from the given folders: the first folder's template that outputs the same
 * extension (see outputExtension), whatever its file name. So `layouts/rssfeed.njk` loads `layouts/rssfeed.xml.njk`,
 * and `article/single.njk` a site's `article/single.html.njk` over a theme's `article/single.njk`. Other names, and
 * names no template outputs, are given back as they are.
 *
 * @example
 * resolveTemplateName(["theme/templates"], "layouts/rssfeed.njk"); // "layouts/rssfeed.xml.njk"
 * resolveTemplateName(["theme/templates"], "partials/notes.txt"); // "partials/notes.txt"
 */
export const resolveTemplateName = (
  dirs: readonly string[],
  name: string,
): string => {
  const slash = name.lastIndexOf("/");
  const parsed = templateFileName(name.slice(slash + 1));
  if (!parsed) return name;
  const path = name.slice(0, slash + 1) + parsed.name;
  const extension = outputExtension(name);
  return (
    findTemplates(dirs, path, outputExtension(`${path}.njk`)).find(
      (output) => output.extension === extension,
    )?.file ?? name
  );
};

/**
 * A Nunjucks loader for the template folders, where an earlier folder's file overrides a later one's (see
 * resolveTemplateName). Names starting with THEME_PREFIX load from the last folder only (the theme's).
 *
 * @example
 * templateLoader(["site/templates", "theme/templates"]).getSource("@theme/layouts/rssfeed.njk");
 * // the theme's layouts/rssfeed.xml.njk
 */
export const templateLoader = (dirs: readonly string[]): nunjucks.ILoader => {
  const themeDirs = dirs.slice(-1);
  const files = new nunjucks.FileSystemLoader([...dirs]);
  const themeFiles = new nunjucks.FileSystemLoader(themeDirs);
  return {
    getSource: (name) =>
      name.startsWith(THEME_PREFIX)
        ? themeFiles.getSource(
            resolveTemplateName(themeDirs, name.slice(THEME_PREFIX.length)),
          )
        : files.getSource(resolveTemplateName(dirs, name)),
  };
};

/**
 * Make a root-relative URL absolute on the website's domain, e.g. for RSS feeds read outside the website. Template
 * data URLs already start with the website's base URL, so only its origin is added.
 *
 * @example
 * absoluteUrl("/news/", "https://example.com"); // "https://example.com/news/"
 * absoluteUrl("/edaha.md/news/", "https://lvl99.github.io/edaha.md"); // "https://lvl99.github.io/edaha.md/news/"
 */
export const absoluteUrl = (url: string, siteUrl: string): string =>
  new URL(url, siteUrl).href;

/**
 * Make root-relative `href` and `src` URLs in HTML absolute (see absoluteUrl), e.g. for RSS feeds read outside the
 * website.
 *
 * @example
 * absoluteUrls('<a href="/news/">', "https://example.com"); // '<a href="https://example.com/news/">'
 */
export const absoluteUrls = (html: string, siteUrl: string): string =>
  html.replace(/(\s(?:href|src)=")\/(?!\/)/g, `$1${new URL(siteUrl).origin}/`);

/**
 * A value as JSON text, optionally indented by 2 spaces. Values JSON can't hold (e.g. `undefined`) give "", and
 * values it can't write (e.g. circular objects) give the error's message.
 *
 * @example
 * toJson(1); // "1"
 * toJson(null); // "null"
 * toJson({ test: 123 }); // '{"test":123}'
 * toJson({ test: 123 }, true); // '{\n  "test": 123\n}'
 */
export const toJson = (input: unknown, pretty = false): string => {
  try {
    return JSON.stringify(input, undefined, pretty ? 2 : undefined) ?? "";
  } catch (err) {
    return (err as Error).message;
  }
};

/**
 * Parse JSON text into a value, or `undefined` if the text isn't valid JSON.
 *
 * @example
 * parseJson("1"); // 1
 * parseJson("null"); // null
 * parseJson('{"test":123}'); // { test: 123 }
 * parseJson("{test"); // undefined
 */
export const parseJson = (input: string): unknown => {
  try {
    return JSON.parse(input);
  } catch {
    return undefined;
  }
};

/**
 * Whether a string contains a piece of text, or an array contains a value. Anything else contains nothing.
 *
 * @example
 * contains("example 1, 2, 3, 4", "4"); // true
 * contains("example 1, 2, 3, 4", 4); // true (the value is compared as text)
 * contains(["example", 1, 2, 3, 4], 4); // true
 * contains(["example", 1, 2, 3, 4], "4"); // false (array values are compared exactly)
 */
export const contains = (input: unknown, search: unknown): boolean =>
  Array.isArray(input)
    ? input.includes(search)
    : typeof input === "string" && input.includes(String(search));

/**
 * The values of a (nested) property from an array of objects, leaving out objects without it.
 *
 * @example
 * where([{ example: 1, test: 2 }, { example: 3, test: 4 }], "test"); // [2, 4]
 * where([{ author: { name: "Ana" } }, {}], "author.name"); // ["Ana"]
 */
export const where = (input: readonly unknown[], prop: string): unknown[] =>
  input.map((item) => get(item, prop)).filter((value) => value !== undefined);

/** Template tags that output the page's embed HTML (`TemplateData.embeds`), by where it goes */
export const EMBED_TAGS = {
  embedHead: "head",
  embedFoot: "foot",
  // The names the brief's first draft used
  embedRenderHead: "head",
  embedRenderFoot: "foot",
} as const;

/** The Nunjucks parser and node classes an extension's `parse` gets (not in @types/nunjucks) */
interface NunjucksParser {
  nextToken(): { value: string; lineno: number; colno: number };
  parseSignature(tolerant: boolean, noParens: boolean): unknown;
  advanceAfterBlockEnd(name: string): void;
}
interface NunjucksNodes {
  NodeList: new (lineno: number, colno: number) => unknown;
  CallExtension: new (
    extension: object,
    method: string,
    args: unknown,
    contentArgs: unknown[],
  ) => unknown;
}

/**
 * The `{% embedHead %}` and `{% embedFoot %}` tags (also `{% embedRenderHead() %}` and `{% embedRenderFoot() %}`): output
 * the HTML that the page's embeds need once in its `<head>`, or before `</body>`. They output nothing on pages without
 * embeds, and in files that aren't HTML (see Templates.render).
 */
class EmbedTags implements nunjucks.Extension {
  tags = Object.keys(EMBED_TAGS);

  /** Read the tag (with or without empty brackets) */
  parse(parser: NunjucksParser, nodes: NunjucksNodes) {
    const token = parser.nextToken();
    // Brackets are optional, and the tags take no arguments
    const args =
      parser.parseSignature(true, false) ??
      new nodes.NodeList(token.lineno, token.colno);
    parser.advanceAfterBlockEnd(token.value);
    return new nodes.CallExtension(this, token.value, args, []);
  }
}
for (const [tag, part] of Object.entries(EMBED_TAGS))
  Object.defineProperty(EmbedTags.prototype, tag, {
    value: (context: { ctx: Partial<TemplateData> }) =>
      new nunjucks.runtime.SafeString(context.ctx.embeds?.[part] ?? ""),
  });

/**
 * Loads and renders the site's Nunjucks templates from one or more folders. A file in an earlier folder overrides the
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
  /** Renders templates that output HTML or XML (see ESCAPED_EXTENSIONS) */
  private readonly escaped: nunjucks.Environment;
  /** Renders templates that output anything else, e.g. JSON */
  private readonly unescaped: nunjucks.Environment;
  private readonly warned = new Set<string>();

  /**
   * Throws if any of the required templates are missing.
   */
  constructor(dirs: string | string[], logger: Logger) {
    this.dirs = typeof dirs === "string" ? [dirs] : dirs;
    const missing = REQUIRED_TEMPLATES.filter(
      (file) =>
        !(file === "layouts/html.njk"
          ? this.exists(file)
          : this.find(file.slice(0, -4), DEFAULT_OUTPUT_EXTENSION).length),
    );
    if (missing.length)
      throw new Error(
        `Missing required templates in ${this.dirs.join(", ")}: ${missing.join(", ")}`,
      );
    this.logger = logger;
    this.escaped = this.environment(true);
    this.unescaped = this.environment(false);
  }

  /**
   * A Nunjucks environment for the template folders, with edaha.md's filters and tags, that escapes values for HTML or
   * not. Each has its own loaders, as Nunjucks keeps compiled templates (bound to their environment) in them.
   */
  private environment(autoescape: boolean): nunjucks.Environment {
    const env = new nunjucks.Environment(templateLoader(this.dirs), {
      autoescape,
      // Keep the generated HTML free of blank lines left by template tags
      trimBlocks: true,
      lstripBlocks: true,
    });
    env.addFilter("date", formatDate);
    env.addFilter("rfc822", formatRfc822);
    env.addFilter("absoluteUrl", absoluteUrl);
    env.addFilter("absoluteUrls", absoluteUrls);
    env.addFilter("json", toJson);
    env.addFilter("parseJson", parseJson);
    env.addFilter("contains", contains);
    env.addFilter("where", where);
    env.addExtension("embeds", new EmbedTags());
    return env;
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
   * The templates for a template's path without `.njk` in the template folders (see findTemplates).
   *
   * @example
   * templates.find("article/single", "html"); // [{ file: "article/single.njk", extension: "html" }, ...]
   */
  private find(path: string, defaultExtension: string): TemplateOutput[] {
    return findTemplates(this.dirs, path, defaultExtension);
  }

  /**
   * The template files for an article type's template name (e.g. "single", "list" or "home"), with the extension of the
   * file each one outputs (see `templateFileName`): e.g. `single.njk` outputs HTML and `single.json.njk` JSON, and each
   * is rendered. Types without their own templates folder use `templates/article/`; a type folder without the template
   * falls back to `templates/article/` with a warning (once per name). Throws if the template exists in neither.
   *
   * @example
   * templates.outputs("page", "home"); // [{ file: "page/home.njk", extension: "html" }] if it exists, else article/'s
   */
  outputs(type: string, name: string): TemplateOutput[] {
    const own = this.find(`${type}/${name}`, DEFAULT_OUTPUT_EXTENSION);
    if (own.length) return own;
    const fallback = this.find(`article/${name}`, DEFAULT_OUTPUT_EXTENSION);
    if (!fallback.length)
      throw new Error(
        `Template "${name}" not found: looked for ${type}/${name}.njk and article/${name}.njk (or with an output extension, e.g. ${name}.json.njk) in ${this.dirs.join(" and ")}`,
      );
    const file = `${type}/${name}.njk`;
    if (this.exists(type) && !this.warned.has(file)) {
      this.warned.add(file);
      this.logger.warn(
        `Template ${file} not found; using ${fallback.map((output) => output.file).join(" and ")}`,
      );
    }
    return fallback;
  }

  /**
   * The template file for an article type's template name that outputs HTML (or else its first), e.g. for a preview of
   * the page (see `outputs`).
   *
   * @example
   * templates.resolve("page", "home"); // "page/home.njk" if it exists, otherwise "article/home.njk"
   */
  resolve(type: string, name: string): string {
    const outputs = this.outputs(type, name);
    return (
      outputs.find(({ extension }) => extension === DEFAULT_OUTPUT_EXTENSION) ??
      (outputs[0] as TemplateOutput)
    ).file;
  }

  /**
   * The feed's templates (`layouts/rssfeed.njk`, which outputs XML, or with an output extension, e.g.
   * `layouts/rssfeed.json.njk`), with the extension of the file each one outputs.
   *
   * @example
   * templates.feedOutputs(); // [{ file: "layouts/rssfeed.njk", extension: "xml" }]
   */
  feedOutputs(): TemplateOutput[] {
    return this.find("layouts/rssfeed", FEED_OUTPUT_EXTENSION);
  }

  /**
   * The template names an article of a type can use (its own and the default ones, except "list"), sorted. A name
   * with several outputs (e.g. `single.njk` and `single.json.njk`) is listed once.
   *
   * @example
   * templates.names("page"); // ["home", "single"]
   */
  names(type: string): string[] {
    const names = new Set<string>();
    for (const dir of this.dirs)
      for (const folder of ["article", type]) {
        try {
          for (const file of readdirSync(join(dir, folder))) {
            const name = templateFileName(file)?.name;
            if (name && name !== "list") names.add(name);
          }
        } catch {
          // A type without its own templates folder
        }
      }
    return [...names].sort();
  }

  /**
   * Render a template with the given data. Values are escaped for HTML only in templates that output HTML or XML (see
   * ESCAPED_EXTENSIONS and outputExtension), so e.g. a JSON template writes `{{ article.title | json }}` as it is. The
   * embed tags output nothing in templates that don't output HTML (see HTML_EXTENSIONS).
   *
   * @example
   * templates.render("article/single.njk", data); // HTML, with values escaped
   * templates.render("article/single.json.njk", data); // JSON, with values as they are
   */
  render(file: string, data: TemplateData): string {
    const extension = outputExtension(file).toLowerCase();
    return (
      ESCAPED_EXTENSIONS.includes(extension) ? this.escaped : this.unescaped
    ).render(
      file,
      // Only HTML pages have a <head> and <body> for the embed tags' HTML
      HTML_EXTENSIONS.includes(extension)
        ? data
        : { ...data, embeds: undefined },
    );
  }
}
