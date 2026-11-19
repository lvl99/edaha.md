import { watch, type FSWatcher } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import {
  parseArticleConfig,
  splitArticle,
  splitContent,
} from "../../generator/article/index.ts";
import { isSlug } from "../../generator/slug/index.ts";
import { DEFAULT_ORDERS, type ArticleSort } from "../types/index.ts";
import { fileKind } from "../files/index.ts";
import type {
  ArticleFilters,
  IndexedFile,
  ArticlePage,
  ArticleQuery,
  ArticleSummary,
  RecentArticles,
} from "../types/index.ts";

/** The most articles a page of query results has */
export const MAX_PER_PAGE = 50;

/** How many of each type's most recently changed articles the editor's nav shows */
export const RECENT_COUNT = 5;

/** The names of a folder's sub-folders that can be article types or slugs (none if it doesn't exist) */
const slugFolders = async (dir: string): Promise<string[]> => {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && isSlug(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
};

/**
 * Read an article's summary from its folder: its settings, title, and when its article.md last changed. Articles that
 * can't be read are summarised with their error. Undefined if the folder has no article.md.
 *
 * @example
 * await summarizeArticle("my-site/articles", "news", "hello");
 * // { type: "news", slug: "hello", title: "Hello", status: "published", date: "2026-10-19T09:54:00.000Z", tags: [], ... }
 */
export const summarizeArticle = async (
  articlesDir: string,
  type: string,
  slug: string,
): Promise<ArticleSummary | undefined> => {
  const file = join(articlesDir, type, slug, "article.md");
  let source: string;
  let updated: string;
  try {
    [source, updated] = await Promise.all([
      readFile(file, "utf8"),
      stat(file).then((info) => info.mtime.toISOString()),
    ]);
  } catch {
    return undefined;
  }
  try {
    const { header, content } = splitArticle(source);
    const config = parseArticleConfig(header, type, `${type}/${slug}`);
    return {
      type,
      slug,
      title: config.title ?? splitContent(content).heading ?? slug,
      status: config.status,
      date: config.date,
      author: config.author?.name,
      tags: config.tags,
      updated,
    };
  } catch (error) {
    return {
      type,
      slug,
      title: slug,
      status: "draft",
      date: "",
      tags: [],
      updated,
      error: (error as Error).message,
    };
  }
};

/**
 * Text for comparing without case or accents.
 *
 * @example
 * comparable("Zoë Ångström"); // "zoe angstrom"
 */
export const comparable = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();

/** Sort articles newest first by a date field, then by slug */
const byNewest =
  (field: "date" | "updated") => (a: ArticleSummary, b: ArticleSummary) =>
    b[field].localeCompare(a[field]) || a.slug.localeCompare(b.slug);

/** Sort articles by title (A to Z, ignoring case and accents), then by type and slug */
const byTitle = (a: ArticleSummary, b: ArticleSummary) =>
  a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) ||
  a.type.localeCompare(b.type) ||
  a.slug.localeCompare(b.slug);

/** The value each sort compares (dates are ISO 8601, so they compare as text) */
const SORT_VALUES: Readonly<
  Record<ArticleSort, (article: ArticleSummary) => string>
> = {
  title: (article) => comparable(article.title),
  type: (article) => article.type,
  status: (article) => article.status,
  date: (article) => article.date,
  updated: (article) => article.updated,
};

/**
 * How to sort articles for a query: by its sort's value (default: date), in its order (default: the sort's own), then
 * by title A to Z.
 */
const articleOrder = (query: ArticleQuery) => {
  const sort: ArticleSort = query.sort ?? "date";
  const direction = (query.order ?? DEFAULT_ORDERS[sort]) === "asc" ? 1 : -1;
  const value = SORT_VALUES[sort];
  return (a: ArticleSummary, b: ArticleSummary) =>
    direction * value(a).localeCompare(value(b)) || byTitle(a, b);
};

/**
 * Find articles: those whose title contains the search text (ignoring case and accents) and that match the type,
 * author, tag and status given, sorted by title, type, status, date or when their file last changed, ascending or
 * descending (by default titles, types and statuses A to Z and dates newest first), one page at a time.
 *
 * @example
 * queryArticles(articles, { search: "hello", type: "news", sort: "title", page: 2 });
 * // { articles: [...], total: 73, page: 2, pages: 2, perPage: 50 }
 */
export const queryArticles = (
  articles: ArticleSummary[],
  query: ArticleQuery = {},
): ArticlePage => {
  const search = comparable(query.search?.trim() ?? "");
  const author = query.author && comparable(query.author);
  const tag = query.tag && comparable(query.tag);
  const found = articles
    .filter(
      (article) =>
        (!search || comparable(article.title).includes(search)) &&
        (!query.type || article.type === query.type) &&
        (!author || comparable(article.author ?? "") === author) &&
        (!tag || article.tags.some((t) => comparable(t) === tag)) &&
        (!query.status || article.status === query.status),
    )
    .sort(articleOrder(query));
  const perPage = Math.min(
    Math.max(Math.floor(query.perPage ?? MAX_PER_PAGE), 1),
    MAX_PER_PAGE,
  );
  const pages = Math.max(Math.ceil(found.length / perPage), 1);
  const page = Math.min(Math.max(Math.floor(query.page ?? 1), 1), pages);
  return {
    articles: found.slice((page - 1) * perPage, page * perPage),
    total: found.length,
    page,
    pages,
    perPage,
  };
};

/**
 * Each type's most recently changed articles (by when their file last changed), types in alphabetical order.
 *
 * @example
 * recentArticles(articles, 5); // [{ type: "news", articles: [...5 articles], total: 120 }, ...]
 */
export const recentArticles = (
  articles: ArticleSummary[],
  count = RECENT_COUNT,
): RecentArticles[] =>
  [...new Set(articles.map((article) => article.type))].sort().map((type) => {
    const ofType = articles.filter((article) => article.type === type);
    return {
      type,
      articles: ofType.sort(byNewest("updated")).slice(0, count),
      total: ofType.length,
    };
  });

/** Unique values, sorted alphabetically ignoring case and accents, keeping the first spelling of each */
const uniqueSorted = (values: string[]) => {
  const unique = new Map<string, string>();
  for (const value of values)
    if (value && !unique.has(comparable(value)))
      unique.set(comparable(value), value);
  return [...unique.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
};

/**
 * The types, authors and tags articles use, for the article browser's filters.
 *
 * @example
 * articleFilters(articles); // { types: ["news", "page"], authors: ["Matt"], tags: ["News", "Releases"] }
 */
export const articleFilters = (articles: ArticleSummary[]): ArticleFilters => ({
  types: [...new Set(articles.map((article) => article.type))].sort(),
  authors: uniqueSorted(articles.map((article) => article.author ?? "")),
  tags: uniqueSorted(articles.flatMap((article) => article.tags)),
});

/** An article in the index: its summary and the files in its folder */
interface IndexEntry {
  summary: ArticleSummary;
  files: IndexedFile[];
}

/**
 * The files in an article's folder (not article.md or hidden files), with their kind, size and when they last changed.
 *
 * @example
 * await articleFiles("my-site/articles", "news", "hello"); // [{ type: "news", slug: "hello", name: "photo.png", ... }]
 */
export const articleFiles = async (
  articlesDir: string,
  type: string,
  slug: string,
): Promise<IndexedFile[]> => {
  const dir = join(articlesDir, type, slug);
  let names: string[];
  try {
    names = (await readdir(dir, { withFileTypes: true }))
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name !== "article.md" &&
          !entry.name.startsWith("."),
      )
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
  const files = await Promise.all(
    names.map(async (name) => {
      try {
        const info = await stat(join(dir, name));
        return {
          type,
          slug,
          name,
          kind: fileKind(name),
          size: info.size,
          updated: info.mtime.toISOString(),
        };
      } catch {
        // Removed while being read
        return undefined;
      }
    }),
  );
  return files.filter((file) => file !== undefined);
};

/** An article's key in the index, e.g. "news/hello" */
const key = (type: string, slug: string) => `${type}/${slug}`;

/** Options for an `ArticleIndex` */
export interface ArticleIndexOptions {
  /** How long to wait for more file changes before reading them again, in milliseconds (default: 100) */
  watchDelay?: number;
  /** Called after changes found by watching have been read (e.g. for tests) */
  onWatchUpdate?: () => void;
}

/**
 * An in-memory index of a site's articles, so the editor can search, filter and sort them without reading every file
 * each time. `load` reads every article; `update` and `delete` keep an entry up to date when the editor changes it;
 * `watch` reads entries again when their files change outside the editor (e.g. a `git pull` or a text editor). The
 * article files stay the only source of truth: nothing is written.
 *
 * @example
 * const index = new ArticleIndex("my-site/articles");
 * await index.load();
 * index.watch();
 * queryArticles(index.articles(), { search: "hello" });
 */
export class ArticleIndex {
  /** Each article's summary and the files in its folder, by "type/slug" */
  private readonly entries = new Map<string, IndexEntry>();

  private readonly articlesDir: string;

  private watcher?: FSWatcher | undefined;

  /** Changed folders waiting to be read again: articles ("news/hello"), whole types ("news"), or everything ("") */
  private readonly pending = new Set<string>();

  private timer?: ReturnType<typeof setTimeout> | undefined;

  private readonly watchDelay: number;

  private readonly onWatchUpdate?: (() => void) | undefined;

  /**
   * @param articlesDir - the site's articles folder, holding a folder per type, each holding a folder per article
   */
  constructor(articlesDir: string, options: ArticleIndexOptions = {}) {
    this.articlesDir = articlesDir;
    this.watchDelay = options.watchDelay ?? 100;
    this.onWatchUpdate = options.onWatchUpdate;
  }

  /** Every indexed article */
  articles(): ArticleSummary[] {
    return [...this.entries.values()].map((entry) => entry.summary);
  }

  /** Every file in the indexed articles' folders */
  files(): IndexedFile[] {
    return [...this.entries.values()].flatMap((entry) => entry.files);
  }

  /** An article's summary and files, or undefined if it has no article.md */
  private async readEntry(
    type: string,
    slug: string,
  ): Promise<IndexEntry | undefined> {
    const [summary, files] = await Promise.all([
      summarizeArticle(this.articlesDir, type, slug),
      articleFiles(this.articlesDir, type, slug),
    ]);
    return summary && { summary, files };
  }

  /** Read every article again, replacing the index */
  async load(): Promise<void> {
    const entries = await Promise.all(
      (await slugFolders(this.articlesDir)).map((type) => this.readType(type)),
    );
    this.entries.clear();
    for (const entry of entries.flat())
      this.entries.set(key(entry.summary.type, entry.summary.slug), entry);
  }

  /** Read every article of a type */
  private async readType(type: string): Promise<IndexEntry[]> {
    const slugs = await slugFolders(join(this.articlesDir, type));
    const entries = await Promise.all(
      slugs.map((slug) => this.readEntry(type, slug)),
    );
    return entries.filter((entry) => entry !== undefined);
  }

  /** Read a type's articles again, dropping those that are gone */
  private async updateType(type: string): Promise<void> {
    const entries = await this.readType(type);
    for (const [name, entry] of this.entries)
      if (entry.summary.type === type) this.entries.delete(name);
    for (const entry of entries)
      this.entries.set(key(entry.summary.type, entry.summary.slug), entry);
  }

  /**
   * Read an article and its files again, e.g. after the editor saved it. It is dropped if it's gone.
   */
  async update(type: string, slug: string): Promise<void> {
    const entry = await this.readEntry(type, slug);
    if (entry) this.entries.set(key(type, slug), entry);
    else this.entries.delete(key(type, slug));
  }

  /**
   * Drop an article, e.g. after the editor deleted or moved it.
   */
  delete(type: string, slug: string): void {
    this.entries.delete(key(type, slug));
  }

  /**
   * Read entries again when their files change, until `close` is called. Doesn't keep the process running. Does
   * nothing if the articles folder doesn't exist or the system can't watch it.
   */
  watch(): void {
    if (this.watcher) return;
    try {
      this.watcher = watch(
        this.articlesDir,
        { recursive: true, persistent: false },
        (_event, file) => this.changed(file),
      );
      this.watcher.on("error", () => this.close());
    } catch {
      // Without watching, changes made outside the editor show after it restarts
    }
  }

  /**
   * Note a changed path (relative to the articles folder) to read again once changes pause. A path inside an article
   * folder reads that article; a type folder reads the type; an unknown path reads everything.
   */
  private changed(file: string | null): void {
    const [type = "", slug = ""] = file ? file.split(sep) : [];
    if (file && !isSlug(type)) return;
    this.pending.add(slug && isSlug(slug) ? key(type, slug) : type);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.watchDelay);
  }

  /** Read the changed folders again */
  private async flush(): Promise<void> {
    const changes = [...this.pending];
    this.pending.clear();
    if (changes.includes("")) await this.load();
    else
      await Promise.all(
        changes.map((change) => {
          const [type = "", slug] = change.split("/");
          return slug ? this.update(type, slug) : this.updateType(type);
        }),
      );
    this.onWatchUpdate?.();
  }

  /** Stop watching for changes */
  close(): void {
    clearTimeout(this.timer);
    this.pending.clear();
    this.watcher?.close();
    this.watcher = undefined;
  }
}
