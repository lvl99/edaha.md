// Data given to the Nunjucks templates (see the Templating docs).
// All URLs are root-relative paths on the website (e.g. "/news/article/hello/"), except `site.url` and
// absolute URLs given in an article's config.
import type { ArticleTypeConfig, GenerateConfig } from "../config/index.ts";

/** Website data */
export interface TemplateDataSite {
  /** The name of the website */
  name: string;
  /** The website description */
  description: string;
  /** The website's absolute URL, without a trailing slash, e.g. "https://example.com" */
  url: string;
  /** The URL of the site's home: "/", or its `path` setting's folder, e.g. "/docs/" */
  path: string;
  /** Article type settings (configured types, plus any other types articles use) */
  types: Record<string, TemplateDataArticleType>;
}

/** What is built for an article type */
export type TemplateDataArticleTypeGenerationConfig = GenerateConfig;

/** An article type's settings */
export interface TemplateDataArticleType extends ArticleTypeConfig {
  /** The URL of the type's front page (its list or index article), e.g. "/news/" */
  url: string;
}

/** An article's author */
export interface TemplateDataAuthor {
  /** The author's name */
  name: string;
  /** The author's name converted to a slug */
  slug: string;
  /** The author's email address */
  email?: string | undefined;
  /** The author's homepage URL */
  url?: string | undefined;
  /** The URL to the author's list of articles */
  listUrl: string;
}

/** A tag on an article */
export interface TemplateDataTag {
  /** The tag's name */
  name: string;
  /** The tag's name converted to a slug */
  slug: string;
  /** The URL to the tag's list of articles */
  url: string;
}

/** A downloadable attachment on an article */
export interface TemplateDataAttachment {
  /** The attachment's name */
  name: string;
  /** The attachment's thumbnail URL */
  thumbnail?: string | undefined;
  /** The attachment's download URL */
  url: string;
  /** The attachment's mime type */
  mimeType: string;
  /** The attachment's file size in bytes (only for files in the article's subfolder) */
  size?: number | undefined;
  /** The attachment's file size in a human-readable form, e.g. "200 KB", "2.5 MB" */
  sizeRelative?: string | undefined;
}

/** Article status: published articles are listed, unlisted ones only get their own page, drafts are not built */
export type ArticleStatus = "published" | "draft" | "unlisted";

/** A rendered article */
export interface TemplateDataArticle {
  /** The article type */
  type: string;
  /** The article status (drafts are never rendered) */
  status: Exclude<ArticleStatus, "draft">;
  /** The article date (ISO 8601) */
  date: string;
  /** The article slug (i.e. the name of the article's subfolder) */
  slug: string;
  /** The template the article is rendered with, e.g. "single" */
  template: string;
  /** The article URL */
  url: string;
  /** The article title */
  title: string;
  /** The article author */
  author: TemplateDataAuthor;
  /** The article thumbnail URL */
  thumbnail?: string | undefined;
  /** The article tags */
  tags: TemplateDataTag[];
  /** The article excerpt (in markdown) */
  excerpt: string;
  /** The article excerpt (in plaintext, stripped of any formatting) */
  excerptText: string;
  /** The article excerpt (in HTML) */
  excerptHtml: string;
  /** The article body (in markdown) */
  body: string;
  /** The article body (in plaintext, stripped of any formatting) */
  bodyText: string;
  /** The article body (in HTML) */
  bodyHtml: string;
  /** Article attachments */
  attachments: TemplateDataAttachment[];
}

/** One page of a paginated list */
export interface TemplateDataPaginationPage {
  /** The page index (1, 2, ...) */
  index: number;
  /** The page URL, e.g. "/news/" for the first page, "/news/2" for the second */
  url: string;
  /** If the page is the current page or not */
  isCurrent: boolean;
}

/** Pagination of a list */
export interface TemplateDataPagination {
  /** The list of pages of articles */
  pages: TemplateDataPaginationPage[];
  /** The current page data */
  page: TemplateDataPaginationPage;
  /** The previous page data (only if not on first page) */
  prevPage: TemplateDataPaginationPage | undefined;
  /** The next page data (only if not on last page) */
  nextPage: TemplateDataPaginationPage | undefined;
}

/** What a list groups articles by */
export type ListKind = "type" | "tag" | "author";

/** A paginated list of articles */
export interface TemplateDataList {
  /** The list's name (the article type's plural label, the tag or the author name) */
  name: string;
  /** The slug of the article type/tag/author that was used for the list */
  slug: string;
  /** The article type the list belongs to */
  type: string;
  /** What the list groups articles by */
  kind: ListKind;
  /** The URL of the list's first page */
  url: string;
  /** The URL of the list's RSS feed */
  feedUrl: string;
  /** Whether the list has an RSS feed */
  hasFeed: boolean;
  /** The articles on the current page */
  articles: TemplateDataArticle[];
  /** The list's paginated pages */
  pagination: TemplateDataPagination;
}

/** Everything given to a template */
export interface TemplateData {
  /** Website data, always provided */
  site: TemplateDataSite;
  /** List data, provided when rendering list and feed templates, and index articles (the first page of their type's list) */
  list?: TemplateDataList;
  /** Article data, only provided when rendering single templates */
  article?: TemplateDataArticle;
}

/** Where build warnings go */
export interface Logger {
  /** Report a problem that doesn't stop the build */
  warn(message: string): void;
}
