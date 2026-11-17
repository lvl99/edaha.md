import { randomUUID } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { stringify } from "yaml";
import type { EmbedRenderer, EmbedResolver } from "../../embeds/index.ts";
import {
  DEFAULT_HEADER_FORMAT,
  headerFormat,
  loadArticle,
  parseArticleConfig,
  splitArticle,
  splitContent,
  type HeaderFormat,
} from "../../generator/article/index.ts";
import {
  articlePageData,
  DEFAULT_SITE_URL,
  siteData,
} from "../../generator/build/index.ts";
import {
  defaultTypeConfig,
  parseConfig,
  RESERVED_TYPES,
} from "../../generator/config/index.ts";
import {
  readConfigFile,
  type SiteConfig,
} from "../../generator/configFile/index.ts";
import {
  createMarkdown,
  renderMarkdown,
} from "../../generator/markdown/index.ts";
import { Templates } from "../../generator/templates/index.ts";
import { THEME_DIR } from "../../theme/index.ts";
import type {
  TemplateDataArticle,
  TemplateDataArticleType,
} from "../../generator/types/index.ts";
import { slugProblem } from "../../generator/urls/index.ts";
import { isSlug, slugify } from "../../generator/slug/index.ts";
import {
  editorHtmlToMarkdown,
  filesUrl,
  markdownToEditorHtml,
} from "../convert/index.ts";
import type {
  ArticleSummary,
  ArticleTypeLabels,
  EditorArticle,
  EditorArticleData,
  UploadResult,
} from "../types/index.ts";

/** An editor request that can't be done, with the HTTP status to answer with */
export class EditorError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** List the names of sub-folders in a folder (none if it doesn't exist) */
const subfolders = async (dir: string): Promise<string[]> => {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
};

/** How many previews the editor remembers (the newest) */
export const MAX_PREVIEWS = 20;

/** An article's unsaved data, and where it's saved (if it is), for its preview page */
interface Preview {
  data: EditorArticleData;
  location: { type: string; slug: string } | undefined;
}

/** Whether a path exists */
const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

/**
 * Check an article type and slug are valid folder names. Throws a 400 EditorError if not.
 */
export const checkLocation = (type: string, slug: string): void => {
  if (!isSlug(type) || RESERVED_TYPES.includes(type))
    throw new EditorError(
      400,
      `Type "${type}" must be lowercase kebab-case and not ${RESERVED_TYPES.join(" or ")}`,
    );
  if (!isSlug(slug))
    throw new EditorError(400, `Slug "${slug}" must be lowercase kebab-case`);
};

/**
 * The URL relative URLs in an article's body point at in the editor: its saved folder's file URL, or "" for an article
 * that isn't saved yet (and has no files).
 *
 * @example
 * bodyBaseUrl({ type: "news", slug: "hello" }); // "/files/news/hello/"
 * bodyBaseUrl(undefined); // ""
 */
export const bodyBaseUrl = (
  location: { type: string; slug: string } | undefined,
): string => {
  if (!location) return "";
  checkLocation(location.type, location.slug);
  return filesUrl(location.type, location.slug);
};

/**
 * Make an uploaded file name safe: a slug of its base name plus its lowercase extension.
 *
 * @example
 * safeFileName("My Photo (1).JPG"); // "my-photo-1.jpg"
 */
export const safeFileName = (name: string): string => {
  const extension = extname(name)
    .toLowerCase()
    .replace(/[^.a-z0-9]/g, "");
  const base = slugify(name.slice(0, name.length - extname(name).length));
  if (!base) throw new EditorError(400, `"${name}" is not a usable file name`);
  return base + extension;
};

/**
 * Write an article's markdown source: the config header (YAML by default, or JSON), the title as an H1 and the body.
 * The type (always the article's folder) and defaults (empty lists) are left out to keep the header short.
 *
 * @param format - the config header's format
 *
 * @example
 * serializeArticle({ type: "article", slug: "hi", status: "published", date, title: "Hi", tags: [], attachments: [] }, "Body");
 * serializeArticle(data, "Body", "json"); // '<!--json\n{\n  "status": "published", ...'
 */
export const serializeArticle = (
  data: EditorArticleData,
  body: string,
  format: HeaderFormat = DEFAULT_HEADER_FORMAT,
): string => {
  const author =
    data.author && (data.author.email || data.author.url)
      ? Object.fromEntries(
          Object.entries(data.author).filter(([, value]) => value),
        )
      : data.author?.name;
  const config = Object.fromEntries(
    Object.entries({
      status: data.status,
      date: data.date,
      author,
      template: data.template,
      excerpt: data.excerpt,
      thumbnail: data.thumbnail,
      attachments: data.attachments.length
        ? data.attachments.map((attachment) =>
            Object.fromEntries(
              Object.entries(attachment).filter(([, value]) => value),
            ),
          )
        : undefined,
      tags: data.tags.length ? data.tags : undefined,
    }).filter(([, value]) => value !== undefined && value !== ""),
  );
  const header =
    format === "json"
      ? `${JSON.stringify(config, null, 2)}\n`
      : stringify(config);
  return `<!--${format}\n${header}-->\n\n# ${data.title.trim()}\n\n${body}\n`;
};

/**
 * Reads and writes articles in the site's articles folder (`articlesDir`) for the editor, and renders previews with the site's
 * templates over the default theme's.
 *
 * @example
 * const store = new ArticleStore(await loadSiteConfig({ siteDir: "my-site" }));
 * await store.list();
 */
export class ArticleStore {
  private readonly articlesDir: string;

  private readonly configFile: string;

  /** The site's templates folder, relative to the site folder */
  private readonly templatesDir: string;

  /** The site's static files folder, relative to the site folder */
  private readonly staticDir: string;

  /** Previews' unsaved data by ID, the newest last (see `rememberPreview`) */
  private readonly previews = new Map<string, Preview>();

  private readonly siteDir: string;

  private readonly themeDir: string;

  /**
   * @param site - the site's config file, folder (which holds the articles, templates and static files folders) and
   *   settings
   * @param themeDir - the default theme folder that the site's templates and static files override
   */
  constructor(site: SiteConfig, themeDir: string = THEME_DIR) {
    this.configFile = site.configFile;
    this.siteDir = site.siteDir;
    this.themeDir = themeDir;
    this.articlesDir = join(site.siteDir, site.config.articlesDir);
    this.templatesDir = site.config.templatesDir;
    this.staticDir = site.config.staticDir;
  }

  /** The site's templates over the theme's */
  private loadTemplates() {
    return new Templates(
      [join(this.siteDir, this.templatesDir), join(this.themeDir, "templates")],
      console,
    );
  }

  /** Read the config file again, so changes to it show without restarting the editor */
  private async config() {
    return parseConfig(
      await readConfigFile(this.configFile),
      basename(this.configFile),
    );
  }

  /**
   * The template names an article of a type can use (see Templates.names).
   */
  templates(type: string): string[] {
    return this.loadTemplates().names(type);
  }

  /**
   * The config file's custom embed renderers (read again each time, so changes show without restarting the editor).
   */
  async embeds(): Promise<EmbedRenderer[]> {
    return (await this.config()).embeds;
  }

  /**
   * The article types from the config file, with their labels.
   */
  async types(): Promise<Record<string, ArticleTypeLabels>> {
    const config = await this.config();
    return Object.fromEntries(
      Object.entries(config.types).map(
        ([type, { labelSingle, labelPlural }]) => [
          type,
          { labelSingle, labelPlural },
        ],
      ),
    );
  }

  /** An article's folder */
  private dir(type: string, slug: string) {
    checkLocation(type, slug);
    return join(this.articlesDir, type, slug);
  }

  /** Read an article's source, or throw a 404 EditorError */
  private async source(type: string, slug: string) {
    try {
      return await readFile(join(this.dir(type, slug), "article.md"), "utf8");
    } catch (error) {
      if (error instanceof EditorError) throw error;
      throw new EditorError(404, `Article ${type}/${slug} not found`);
    }
  }

  /**
   * List every article, including drafts, newest first. Articles that can't be read are listed with their error.
   */
  async list(): Promise<ArticleSummary[]> {
    const summaries: ArticleSummary[] = [];
    for (const type of await subfolders(this.articlesDir)) {
      for (const slug of await subfolders(join(this.articlesDir, type))) {
        let source: string;
        try {
          source = await this.source(type, slug);
        } catch {
          continue;
        }
        try {
          const { header, content } = splitArticle(source);
          const config = parseArticleConfig(header, type, `${type}/${slug}`);
          summaries.push({
            type,
            slug,
            title: config.title ?? splitContent(content).heading ?? slug,
            status: config.status,
            date: config.date,
          });
        } catch (error) {
          summaries.push({
            type,
            slug,
            title: slug,
            status: "draft",
            date: "",
            error: (error as Error).message,
          });
        }
      }
    }
    return summaries.sort(
      (a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug),
    );
  }

  /**
   * Load an article for editing. Throws a 404 EditorError if it doesn't exist, or 422 if it can't be read.
   */
  async read(type: string, slug: string): Promise<EditorArticle> {
    const source = await this.source(type, slug);
    const { header, content } = splitArticle(source);
    let config;
    try {
      config = parseArticleConfig(header, type, `${type}/${slug}`);
    } catch (error) {
      throw new EditorError(422, (error as Error).message);
    }
    const parts = splitContent(content);
    // The title is edited separately, so a leading H1 stays out of the body; the readmore marker stays in
    const body = content.replace(/^\s*#[ \t]+.+(?:\r?\n|$)/, "").trim();
    const files = (await readdir(this.dir(type, slug)))
      .filter((name) => name !== "article.md")
      .sort();
    return {
      type,
      slug,
      status: config.status,
      date: config.date,
      title: config.title ?? parts.heading ?? "",
      template: config.template,
      author: config.author,
      excerpt: config.excerpt,
      thumbnail: config.thumbnail,
      tags: config.tags,
      attachments: config.attachments,
      bodyHtml: markdownToEditorHtml(body, filesUrl(type, slug)),
      files,
    };
  }

  /**
   * Save an article. When its type or slug changed, its folder (with all its files) moves to the new location.
   * Pass no `from` for a new article. Returns where the article now is.
   */
  async save(
    data: EditorArticleData,
    from?: { type: string; slug: string },
  ): Promise<{ type: string; slug: string }> {
    const dir = this.dir(data.type, data.slug);
    // The slug must not clash with other URLs
    const config = await this.config();
    const problem = slugProblem(
      data.slug,
      data.type,
      config.path,
      {
        [data.type]: defaultTypeConfig(data.type),
        ...config.types,
      },
      config.reservedPaths,
    );
    if (problem)
      throw new EditorError(400, `The slug can't be used: ${problem}`);
    if (!data.title.trim())
      throw new EditorError(400, "The article needs a title");
    const moving = !from || from.type !== data.type || from.slug !== data.slug;
    if (moving && (await exists(dir)))
      throw new EditorError(
        409,
        `Article ${data.type}/${data.slug} already exists`,
      );
    // A saved article keeps its config header's format; new ones get the default
    const format = from
      ? headerFormat(await this.source(from.type, from.slug))
      : DEFAULT_HEADER_FORMAT;
    const fromDir = from ? this.dir(from.type, from.slug) : undefined;

    // Files referenced from the body keep working after a move, as they are saved relative to the folder
    const body = editorHtmlToMarkdown(
      data.bodyHtml,
      filesUrl(from?.type ?? data.type, from?.slug ?? data.slug),
    );
    const source = serializeArticle(data, body, format);
    try {
      parseArticleConfig(
        splitArticle(source).header,
        data.type,
        `${data.type}/${data.slug}`,
      );
    } catch (error) {
      throw new EditorError(400, (error as Error).message);
    }

    if (fromDir && moving) {
      await mkdir(join(this.articlesDir, data.type), { recursive: true });
      await rename(fromDir, dir);
    } else await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "article.md"), source);
    return { type: data.type, slug: data.slug };
  }

  /**
   * Render an article from unsaved editor data as the website would, with its type's "single" template, for the
   * editor's preview. Drafts are shown as if published. Its files come from its saved folder (`location`), if it has one,
   * and are shown from the editor's file URLs. Throws a 400 EditorError if it can't be rendered (e.g. a file isn't in
   * the article's folder).
   *
   * @param embeds - renders embed blocks
   */
  async preview(
    data: EditorArticleData,
    location: { type: string; slug: string } | undefined,
    embeds: EmbedResolver,
  ): Promise<string> {
    if (!isSlug(data.type))
      throw new EditorError(
        400,
        `Type "${data.type}" must be lowercase kebab-case`,
      );
    const baseUrl = bodyBaseUrl(location);
    const config = await this.config();
    const site = siteData(
      config,
      { [data.type]: defaultTypeConfig(data.type), ...config.types },
      DEFAULT_SITE_URL,
    );
    const source = serializeArticle(
      { ...data, status: "published", title: data.title.trim() || "Untitled" },
      editorHtmlToMarkdown(data.bodyHtml, baseUrl),
    );
    const name = `${data.type}/${data.slug || "new"}`;
    const markdown = createMarkdown();
    try {
      // Published, so always rendered
      const article = (await loadArticle(source, data.type, {
        site,
        // An unsaved article has no folder, so any file it names isn't found
        dir: location
          ? this.dir(location.type, location.slug)
          : join(this.articlesDir, data.type, ".unsaved"),
        slug: data.slug,
        url: baseUrl,
        typeUrl: (site.types[data.type] as TemplateDataArticleType).url,
        source: name,
        replaceEmbeds: (md) => embeds.replaceBlocks(md, name),
        renderMarkdown: (md, base) => renderMarkdown(markdown, md, base),
      })) as TemplateDataArticle;
      const templates = this.loadTemplates();
      return templates.render(
        templates.resolve(data.type, "single"),
        articlePageData(site, article),
      );
    } catch (error) {
      throw new EditorError(400, (error as Error).message);
    }
  }

  /**
   * Delete an article and all its files.
   */
  async remove(type: string, slug: string): Promise<void> {
    await this.source(type, slug);
    await rm(this.dir(type, slug), { recursive: true });
  }

  /**
   * Save an uploaded file into an article's folder (replacing a file with the same name).
   */
  async upload(
    type: string,
    slug: string,
    fileName: string,
    contents: Uint8Array,
  ): Promise<UploadResult> {
    await this.source(type, slug);
    const name = safeFileName(fileName);
    await writeFile(join(this.dir(type, slug), name), contents);
    return { name, url: filesUrl(type, slug) + name };
  }

  /**
   * Remember an article's unsaved data for its preview page, under a new ID. Only the newest `MAX_PREVIEWS` are kept,
   * in memory: they're gone when the editor stops. Returns the ID.
   *
   * @example
   * const id = store.rememberPreview(data, { type: "news", slug: "hello" }); // the editor shows it at /preview/<id>/
   */
  rememberPreview(
    data: EditorArticleData,
    location: { type: string; slug: string } | undefined,
  ): string {
    const id = randomUUID();
    this.previews.set(id, { data, location });
    for (const old of [...this.previews.keys()].slice(0, -MAX_PREVIEWS))
      this.previews.delete(old);
    return id;
  }

  /**
   * Render a remembered preview as the website would (see `preview`), so changes to templates show when it reloads.
   * Throws a 404 EditorError if there is no preview with that ID (e.g. after the editor restarted).
   *
   * @param embeds - renders embed blocks
   */
  async renderPreview(id: string, embeds: EmbedResolver): Promise<string> {
    const preview = this.previews.get(id);
    if (!preview) throw new EditorError(404, "Preview not found");
    return this.preview(preview.data, preview.location, embeds);
  }

  /**
   * Read one of the static files published at the website's root (the site's `static/`, then the theme's), e.g.
   * `site.css`, for previews. Throws a 404 EditorError if there is no such file, or the path leaves the folder or
   * names a hidden file.
   *
   * @example
   * await store.staticFile("fonts/my-font.woff2");
   */
  async staticFile(path: string): Promise<Uint8Array> {
    const parts = path.split("/");
    if (parts.some((part) => part === "" || part.startsWith(".")))
      throw new EditorError(404, "File not found");
    for (const dir of this.staticDirs) {
      try {
        return await readFile(join(dir, ...parts));
      } catch {
        // Not in this folder
      }
    }
    throw new EditorError(404, "File not found");
  }

  /** The static folders (stylesheet, fonts) published at the website's root: the site's, then the theme's */
  get staticDirs(): string[] {
    return [join(this.siteDir, this.staticDir), join(this.themeDir, "static")];
  }

  /**
   * Read a file from an article's folder. Throws a 404 EditorError if there is no such file.
   */
  async file(type: string, slug: string, name: string): Promise<Uint8Array> {
    // Only plain file names in the article's folder (no sub-folders, parent folders or hidden files)
    if (
      name === "article.md" ||
      name !== basename(name) ||
      name.startsWith(".")
    )
      throw new EditorError(404, "File not found");
    try {
      return await readFile(join(this.dir(type, slug), name));
    } catch (error) {
      if (error instanceof EditorError) throw error;
      throw new EditorError(404, "File not found");
    }
  }
}
