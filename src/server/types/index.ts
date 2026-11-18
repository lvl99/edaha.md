// Data exchanged between the article editor's client and its local server.
import type { ArticleStatus } from "../../generator/types/index.ts";

export type { ArticleStatus } from "../../generator/types/index.ts";

/** Where an article is saved */
export interface ArticleLocation {
  type: string;
  slug: string;
}

/** An article in the editor's article list */
export interface ArticleSummary {
  type: string;
  slug: string;
  /** The article title, or its folder name if it can't be read */
  title: string;
  status: ArticleStatus;
  /** ISO 8601 date (empty if it can't be read) */
  date: string;
  /** Why the article can't be read, if it can't */
  error?: string | undefined;
  /** The author's name, if the article names one */
  author?: string | undefined;
  /** The article's tags */
  tags: string[];
  /** When its article.md file last changed (ISO 8601) */
  updated: string;
}

/** How articles are sorted: by title (A to Z) or by date (newest first) */
export type ArticleSort = "title" | "date";

/** A search of the article index; every part is optional */
export interface ArticleQuery {
  /** Text the title contains (ignoring case and accents) */
  search?: string | undefined;
  type?: string | undefined;
  /** The author's name */
  author?: string | undefined;
  tag?: string | undefined;
  status?: ArticleStatus | undefined;
  /** Default: "date" */
  sort?: ArticleSort | undefined;
  /** The page to show, from 1 (default: 1) */
  page?: number | undefined;
  /** Articles per page, at most `MAX_PER_PAGE` (default: `MAX_PER_PAGE`) */
  perPage?: number | undefined;
}

/** A page of articles found by an `ArticleQuery` */
export interface ArticlePage {
  articles: ArticleSummary[];
  /** How many articles were found in all */
  total: number;
  /** The page shown, from 1 */
  page: number;
  /** How many pages there are (at least 1) */
  pages: number;
  perPage: number;
}

/** A type's most recently changed articles, for the editor's nav */
export interface RecentArticles {
  type: string;
  articles: ArticleSummary[];
  /** How many articles the type has in all */
  total: number;
}

/** What the article browser's filters can choose from: the types, authors and tags articles use */
export interface ArticleFilters {
  types: string[];
  authors: string[];
  tags: string[];
}

/** An author as edited */
export interface EditorAuthor {
  name: string;
  email?: string | undefined;
  url?: string | undefined;
}

/** An attachment as edited (URLs relative to the article folder, or absolute) */
export interface EditorAttachment {
  url: string;
  thumbnail?: string | undefined;
  mimeType?: string | undefined;
  name?: string | undefined;
}

/** An article's editable data, as saved by the editor */
export interface EditorArticleData {
  type: string;
  slug: string;
  status: ArticleStatus;
  /** ISO 8601 date */
  date: string;
  title: string;
  /** The template to render the article with (undefined for the default, "single") */
  template?: string | undefined;
  author?: EditorAuthor | undefined;
  excerpt?: string | undefined;
  thumbnail?: string | undefined;
  tags: string[];
  attachments: EditorAttachment[];
  /** The article body as editor HTML (readmore as `<hr class="readmore">`, embeds as `<div class="embed">URL</div>`) */
  bodyHtml: string;
}

/** An article as loaded into the editor */
export interface EditorArticle extends EditorArticleData {
  /** Files in the article's folder (except article.md) */
  files: string[];
}

/** The result of uploading a file into an article's folder */
export interface UploadResult {
  /** The saved file name (relative to the article folder) */
  name: string;
  /** Where the editor can show the file */
  url: string;
}

/** A rendered embed for the editor's preview */
export interface EmbedPreview {
  /** The embed HTML as the website shows it (or a plain link if it can't be embedded) */
  html: string;
  /** Why the URL couldn't be embedded, if it couldn't */
  warnings: string[];
}

/** An article type's labels from the config file */
export interface ArticleTypeLabels {
  /** e.g. "Article" */
  labelSingle: string;
  /** e.g. "Articles" */
  labelPlural: string;
}
