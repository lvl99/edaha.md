import mime from "mime-types";
import type {
  ListKind,
  TemplateDataAlternate,
  TemplateDataArticle,
  TemplateDataArticleType,
  TemplateDataSite,
  TemplateDataList,
  TemplateDataPaginationPage,
} from "../types/index.ts";

/** Articles per list page */
export const PAGE_SIZE = 20;

/** A list of articles before pagination */
export interface ListDefinition {
  kind: ListKind;
  /** The list's name */
  name: string;
  /** The article type/tag/author slug */
  slug: string;
  /** The article type the list belongs to (its list template renders it) */
  type: string;
  /** The list's folder relative to the website's root, e.g. "news/" or "news/tags/art/" */
  dir: string;
  /** The URL of the list's first page */
  url: string;
  /** Whether list pages are built (otherwise only the feed, or nothing) */
  pages: boolean;
  /** The articles on the list's pages, newest first */
  articles: TemplateDataArticle[];
  /** Whether a feed is built */
  feed: boolean;
  /** The articles in the list's feed, newest first */
  feedArticles: TemplateDataArticle[];
}

/**
 * Sort articles newest first (by type and slug when dates are equal, so builds are stable).
 *
 * @example
 * sortArticles(articles)[0]; // the newest article
 */
export const sortArticles = (
  articles: readonly TemplateDataArticle[],
): TemplateDataArticle[] =>
  [...articles].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.type.localeCompare(b.type) ||
      a.slug.localeCompare(b.slug),
  );

/**
 * Group published articles into lists, following each article type's `generate` settings (see config.ts):
 * - one per type (its pages unless the type has an index article, and its feed)
 * - one per tag and per author within a type, with articles of types with `tag` or `author` (and in their feeds,
 *   also `feed`)
 *
 * Every type in `withIndex` gets a type list (even without articles or list settings), so its index article can
 * show it; build only the lists with `pages` or `feed`.
 *
 * @param articles - published articles, without index articles
 * @param withIndex - article types that have an index article
 *
 * @example
 * collectLists(published, site, new Set()).map((list) => list.url); // ["/news/", "/news/tags/art/", ...]
 */
export const collectLists = (
  articles: readonly TemplateDataArticle[],
  site: TemplateDataSite,
  withIndex: ReadonlySet<string>,
): ListDefinition[] => {
  const lists = new Map<string, ListDefinition>();
  /** Get or create a list */
  const list = (
    definition: Omit<ListDefinition, "url" | "articles" | "feedArticles">,
  ) => {
    const existing = lists.get(definition.dir);
    if (existing) return existing;
    const created = {
      ...definition,
      url: `${site.baseUrl}/${definition.dir}`,
      articles: [],
      feedArticles: [],
    };
    lists.set(definition.dir, created);
    return created;
  };
  /** A type's own list */
  const typeList = (type: string) => {
    const config = site.types[type] as TemplateDataArticleType;
    return list({
      kind: "type",
      name: config.labelPlural,
      slug: type,
      type,
      dir: config.url.slice(site.baseUrl.length + 1),
      // An index article takes the place of the list's pages
      pages: config.generate.list && !withIndex.has(type),
      feed: false,
    });
  };

  for (const type of withIndex) typeList(type);
  for (const article of sortArticles(articles)) {
    const config = site.types[article.type] as TemplateDataArticleType;
    const settings = config.generate;
    /** Add the article to a list, and to its feed if the type allows feeds */
    const add = (entry: ListDefinition) => {
      entry.articles.push(article);
      if (settings.feed) entry.feedArticles.push(article);
      entry.feed ||= settings.feed;
    };
    if (settings.list || settings.feed || withIndex.has(article.type))
      add(typeList(article.type));
    const typeDir = config.url.slice(site.baseUrl.length + 1);
    if (settings.tag)
      for (const tag of article.tags)
        add(
          list({
            kind: "tag",
            name: tag.name,
            slug: tag.slug,
            type: article.type,
            dir: `${typeDir}tags/${tag.slug}/`,
            pages: true,
            feed: false,
          }),
        );
    // Articles without an author aren't in any author's list
    if (settings.author && article.author)
      add(
        list({
          kind: "author",
          name: article.author.name,
          slug: article.author.slug,
          type: article.type,
          dir: `${typeDir}authors/${article.author.slug}/`,
          pages: true,
          feed: false,
        }),
      );
  }
  return [...lists.values()];
};

/**
 * The output file name of a list page, with the extension its template outputs (HTML unless given).
 *
 * @example
 * pageFile(1); // "index.html"
 * pageFile(2, "json"); // "2.json"
 */
export const pageFile = (index: number, extension = "html"): string =>
  `${index === 1 ? "index" : index}.${extension}`;

/**
 * Another output of a page (see TemplateDataAlternate), with the MIME type of its extension. XML feeds are RSS.
 *
 * @example
 * alternateData("json", "/news/hello/index.json"); // { extension: "json", type: "application/json", url: ... }
 * alternateData("xml", "/news/feed.xml", true); // { extension: "xml", type: "application/rss+xml", url: ... }
 */
export const alternateData = (
  extension: string,
  url: string,
  feed = false,
): TemplateDataAlternate => ({
  extension,
  type:
    feed && extension.toLowerCase() === "xml"
      ? "application/rss+xml"
      : mime.lookup(extension) || "application/octet-stream",
  url,
});

/** The extensions a list's page and feed templates output */
export interface ListOutputs {
  /** The list page's, e.g. ["html", "json"] */
  pages: string[];
  /** The feed's, e.g. ["xml"] */
  feeds: string[];
}

/**
 * Split a list into pages of template data (at least one page, even when empty). `outputs` are the extensions its page
 * and feed templates output, for each page's `alternates`, and the list's `feeds` and `feedUrl` (`feed.xml` unless the
 * feed has no XML output).
 *
 * @example
 * paginate(list).map((page) => page.pagination.page.url); // ["/news/", "/news/2"]
 * paginate(list, 20, { pages: ["html", "json"], feeds: ["xml"] })[1].alternates; // [{ url: "/news/2.json", ... }]
 */
export const paginate = (
  list: ListDefinition,
  pageSize = PAGE_SIZE,
  outputs: ListOutputs = { pages: ["html"], feeds: ["xml"] },
): TemplateDataList[] => {
  const count = Math.max(1, Math.ceil(list.articles.length / pageSize));
  const pageUrl = (index: number) =>
    index === 1 ? list.url : `${list.url}${index}`;
  const feedExtension = outputs.feeds.includes("xml")
    ? "xml"
    : (outputs.feeds[0] ?? "xml");
  const feeds = list.feed
    ? outputs.feeds.map((extension) =>
        alternateData(extension, `${list.url}feed.${extension}`, true),
      )
    : [];
  return Array.from({ length: count }, (_, i) => {
    const pages: TemplateDataPaginationPage[] = Array.from(
      { length: count },
      (_, p) => ({ index: p + 1, url: pageUrl(p + 1), isCurrent: p === i }),
    );
    return {
      name: list.name,
      slug: list.slug,
      type: list.type,
      kind: list.kind,
      url: list.url,
      feedUrl: `${list.url}feed.${feedExtension}`,
      hasFeed: list.feed,
      feeds,
      alternates: outputs.pages
        .filter((extension) => extension !== "html")
        .map((extension) =>
          alternateData(extension, list.url + pageFile(i + 1, extension)),
        ),
      articles: list.articles.slice(i * pageSize, (i + 1) * pageSize),
      pagination: {
        pages,
        page: pages[i] as TemplateDataPaginationPage,
        prevPage: pages[i - 1],
        nextPage: pages[i + 1],
      },
    };
  });
};
