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
  type MetadataContext,
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
import {
  articleMetadata,
  CORE_FIELDS,
  MetadataValidator,
  typeMetadataKeys,
} from "../../generator/metadata/index.ts";
import type { EdahaConfig } from "../../generator/config/index.ts";
import {
  ArticleIndex,
  type MetadataCheck,
  articleFilters,
  queryArticles,
  recentArticles,
  RECENT_COUNT,
  type ArticleIndexOptions,
} from "../articleIndex/index.ts";
import {
  changeArticleReferences,
  fileFilters,
  fileReferences,
  queryFiles,
  type ReferenceChange,
} from "../files/index.ts";
import { folderPath, folderUrl } from "../../generator/urls/index.ts";
import type {
  ArticleFilters,
  ArticleLocation,
  ArticlePage,
  ArticleQuery,
  FileChange,
  FileFilters,
  FilePage,
  FileQuery,
  MetadataInfo,
  MetadataProblem,
  ArticleTypeLabels,
  RecentArticles,
  EditorArticle,
  EditorArticleData,
  UploadResult,
} from "../types/index.ts";

/** An editor request that can't be done, with the HTTP status to answer with */
export class EditorError extends Error {
  readonly status: number;

  /** Problems with the article's custom metadata, when saving it was refused because of them */
  readonly problems?: MetadataProblem[] | undefined;

  constructor(status: number, message: string, problems?: MetadataProblem[]) {
    super(message);
    this.status = status;
    this.problems = problems;
  }
}

/** Options for an `ArticleStore` */
export interface ArticleStoreOptions extends ArticleIndexOptions {
  /** Whether the article index watches the articles folder for changes made outside the editor (default: true) */
  watch?: boolean;
}

/** What articles' custom metadata is checked with (see `ArticleStore.metadata`) */
interface MetadataTools {
  config: EdahaConfig;
  /** An article's problems, from its type and settings */
  check: MetadataCheck;
  /** What `loadArticle` reads a type's metadata with (besides `warn`) */
  context(type: string): Omit<MetadataContext, "warn">;
}

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
      // Custom metadata and other settings, after the core ones
      ...data.meta,
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
 * templates over the default theme's. Articles are listed and searched from an in-memory index (see `ArticleIndex`),
 * read on first use and kept up to date as the editor saves and deletes articles, and (unless `watch` is false) as their
 * files change outside the editor. Call `close` to stop watching.
 *
 * @example
 * const store = new ArticleStore(await loadSiteConfig({ siteDir: "my-site" }));
 * await store.query({ search: "hello" });
 * store.close();
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

  /** What custom metadata is checked with, once read from the config file */
  private metadataLoad?: Promise<MetadataTools> | undefined;

  /** The article index, once its first load has started */
  private indexLoad?: Promise<ArticleIndex> | undefined;

  private readonly indexOptions: ArticleStoreOptions;

  /**
   * @param site - the site's config file, folder (which holds the articles, templates and static files folders) and
   *   settings
   * @param themeDir - the default theme folder that the site's templates and static files override
   * @param options - how the article index watches for changes
   */
  constructor(
    site: SiteConfig,
    themeDir: string = THEME_DIR,
    options: ArticleStoreOptions = {},
  ) {
    this.indexOptions = options;
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
   * What articles' custom metadata is checked with, from the config file (read once): a check giving an article's
   * problems from its type and settings, and the context `loadArticle` reads a type's metadata with.
   */
  private metadata(): Promise<MetadataTools> {
    this.metadataLoad ??= (async () => {
      const config = await this.config();
      const validator = new MetadataValidator(config.metadata);
      const context = (type: string) => {
        const typeConfig = config.types[type] ?? defaultTypeConfig(type);
        return {
          validator,
          keys: typeMetadataKeys(config.metadata, typeConfig.metadata),
          typeLabel: typeConfig.labelPlural,
        };
      };
      const check: MetadataCheck = (type, settings) => {
        const { keys, typeLabel } = context(type);
        return articleMetadata(settings, keys, validator, typeLabel).problems;
      };
      return { config, check, context };
    })();
    return this.metadataLoad;
  }

  /**
   * Read the config file's custom metadata and every article now, rather than on first use, so the editor starts with
   * every article checked.
   */
  async load(): Promise<void> {
    await this.index();
  }

  /**
   * The custom metadata fields, and which fields each configured type uses, for the editor's article form.
   */
  async metadataInfo(): Promise<MetadataInfo> {
    const { config } = await this.metadata();
    return {
      definitions: config.metadata,
      types: Object.fromEntries(
        Object.entries(config.types).flatMap(([type, { metadata }]) =>
          metadata === undefined ? [] : [[type, metadata]],
        ),
      ),
    };
  }

  /** The article index, read on first use (and then watched, unless turned off) */
  private index(): Promise<ArticleIndex> {
    this.indexLoad ??= (async () => {
      const index = new ArticleIndex(this.articlesDir, {
        ...this.indexOptions,
        check: (await this.metadata()).check,
      });
      await index.load();
      if (this.indexOptions.watch !== false) index.watch();
      return index;
    })();
    return this.indexLoad;
  }

  /**
   * Find articles by title, type, author, tag and status, sorted by title or date, a page at a time (see
   * `queryArticles`).
   *
   * @example
   * await store.query({ search: "hello", sort: "title", page: 2 });
   */
  async query(query: ArticleQuery): Promise<ArticlePage> {
    return queryArticles((await this.index()).articles(), query);
  }

  /**
   * Each type's most recently changed articles, for the editor's nav (see `recentArticles`).
   */
  async recent(count = RECENT_COUNT): Promise<RecentArticles[]> {
    return recentArticles((await this.index()).articles(), count);
  }

  /**
   * The types, authors and tags articles use, for the article browser's filters.
   */
  async filters(): Promise<ArticleFilters> {
    return articleFilters((await this.index()).articles());
  }

  /**
   * Where articles are on the website, from the config file: a function giving an article's path (e.g. "/news/hello/";
   * an index article is at its type's path), and the website's address without a trailing slash, if it has one.
   */
  private async articleUrls() {
    const config = await this.config();
    const typeUrl = (type: string) =>
      folderUrl(
        folderPath(
          config.path,
          (config.types[type] ?? defaultTypeConfig(type)).path,
        ),
      );
    return {
      articleUrl: (type: string, slug: string) =>
        slug === "index" ? typeUrl(type) : `${typeUrl(type)}${slug}/`,
      siteUrl: config.siteUrl?.replace(/\/+$/, ""),
    };
  }

  /**
   * Find files in the articles' folders by name, kind and article type, sorted by name, kind, size or location, a page
   * at a time, with their paths on the website.
   *
   * @example
   * await store.queryFiles({ kind: "image", sort: "size" });
   */
  async queryFiles(query: FileQuery): Promise<FilePage> {
    const { articleUrl } = await this.articleUrls();
    const page = queryFiles((await this.index()).files(), query);
    return {
      ...page,
      files: page.files.map((file) => ({
        ...file,
        url: articleUrl(file.type, file.slug) + file.name,
      })),
    };
  }

  /** The kinds of files and the article types they are in, for the file browser's filters */
  async fileFilters(): Promise<FileFilters> {
    return fileFilters((await this.index()).files());
  }

  /** A file's path in an article's folder. Throws a 404 EditorError if there is no such file. */
  private async filePath(type: string, slug: string, name: string) {
    if (
      name === "article.md" ||
      name !== basename(name) ||
      name.startsWith(".")
    )
      throw new EditorError(404, "File not found");
    const path = join(this.dir(type, slug), name);
    if (!(await exists(path))) throw new EditorError(404, "File not found");
    return path;
  }

  /**
   * Change references to a file in every article (see `changeArticleReferences`), or only find them with `dryRun`.
   * Returns the articles that refer to it.
   */
  private async changeReferences(
    file: ArticleLocation & { name: string },
    change: ReferenceChange,
    dryRun = false,
  ): Promise<ArticleLocation[]> {
    const index = await this.index();
    const { articleUrl, siteUrl } = await this.articleUrls();
    const url = articleUrl(file.type, file.slug) + file.name;
    const changed: ArticleLocation[] = [];
    for (const { type, slug } of index.articles()) {
      const references = fileReferences(
        file.name,
        url,
        siteUrl,
        type === file.type && slug === file.slug,
      );
      let source: string;
      let next: string | undefined;
      try {
        source = await this.source(type, slug);
        next = changeArticleReferences(source, references, change);
      } catch {
        // Articles that can't be read are left alone
        continue;
      }
      if (next === undefined) continue;
      changed.push({ type, slug });
      if (!dryRun) {
        await writeFile(join(this.dir(type, slug), "article.md"), next);
        await index.update(type, slug);
      }
    }
    return changed;
  }

  /**
   * The articles that refer to a file, e.g. to say which will change before replacing or deleting it.
   */
  async fileReferences(
    type: string,
    slug: string,
    name: string,
  ): Promise<ArticleLocation[]> {
    await this.filePath(type, slug, name);
    return this.changeReferences({ type, slug, name }, { remove: true }, true);
  }

  /**
   * Replace a file in an article's folder with an uploaded one. With the same (safe) name, the file is overwritten;
   * with another, the new file is saved under its own name, references to the old one switch to it in every article,
   * and the old file is removed. Throws a 409 EditorError if another file already has the new name.
   */
  async replaceFile(
    type: string,
    slug: string,
    name: string,
    fileName: string,
    contents: Uint8Array,
  ): Promise<FileChange> {
    const oldPath = await this.filePath(type, slug, name);
    const newName = safeFileName(fileName);
    const newPath = join(this.dir(type, slug), newName);
    if (newName !== name && (await exists(newPath)))
      throw new EditorError(
        409,
        `A file called ${newName} is already in ${type}/${slug}`,
      );
    await writeFile(newPath, contents);
    const articles: ArticleLocation[] = [];
    if (newName !== name) {
      articles.push(
        ...(await this.changeReferences(
          { type, slug, name },
          { rename: newName },
        )),
      );
      await rm(oldPath);
    }
    await (await this.index()).update(type, slug);
    return { name: newName, articles };
  }

  /**
   * Delete a file from an article's folder, removing references to it in every article (images are removed, links keep
   * their text, a thumbnail is cleared and attachments are removed).
   */
  async deleteFile(
    type: string,
    slug: string,
    name: string,
  ): Promise<FileChange> {
    const path = await this.filePath(type, slug, name);
    const articles = await this.changeReferences(
      { type, slug, name },
      { remove: true },
    );
    await rm(path);
    await (await this.index()).update(type, slug);
    return { articles };
  }

  /** Stop watching the articles folder for changes */
  close(): void {
    void this.indexLoad?.then((index) => index.close());
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
    const settings = header as Record<string, unknown>;
    const { check } = await this.metadata();
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
      meta: Object.fromEntries(
        Object.entries(settings).filter(([key]) => !CORE_FIELDS.includes(key)),
      ),
      problems: check(type, settings),
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
    // Custom metadata values that aren't valid aren't saved
    const errors = (await this.metadata())
      .check(data.type, data.meta ?? {})
      .filter(({ level }) => level === "error");
    if (errors.length)
      throw new EditorError(
        400,
        `Some values aren't valid: ${errors.map(({ path, message }) => `"${path}" ${message}`).join("; ")}`,
        errors,
      );
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
    const index = await this.index();
    if (from && moving) index.delete(from.type, from.slug);
    await index.update(data.type, data.slug);
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
    const metadata = await this.metadata();
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
        metadata: {
          ...metadata.context(data.type),
          // The editor shows problems itself
          warn: () => undefined,
        },
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
    (await this.index()).delete(type, slug);
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
