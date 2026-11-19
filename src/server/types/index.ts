// Data exchanged between the article editor's client and its local server.
import type { ArticleStatus } from "../../generator/types/index.ts";
import type {
  MetadataDefinitions,
  MetadataProblem,
} from "../../generator/metadata/index.ts";
import type { MetadataGroup } from "../../generator/metadataGroups/index.ts";

export type { ArticleStatus } from "../../generator/types/index.ts";
export type {
  MetadataDefinitions,
  MetadataProblem,
} from "../../generator/metadata/index.ts";
export type { MetadataGroup } from "../../generator/metadataGroups/index.ts";

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
  /** Problems with its custom metadata, if it has any */
  problems?: MetadataProblem[] | undefined;
}

/** What articles are sorted by: their title, type, status, date, or when their file last changed */
export type ArticleSort = "title" | "type" | "status" | "date" | "updated";

/**
 * Which way articles are sorted: ascending (A to Z, oldest first) or descending (Z to A, newest first). Each sort has
 * its own default (see `DEFAULT_ORDERS`).
 */
export type ArticleOrder = "asc" | "desc";

/** Each sort's default order: titles, types and statuses A to Z, dates newest first */
export const DEFAULT_ORDERS: Readonly<Record<ArticleSort, ArticleOrder>> = {
  title: "asc",
  type: "asc",
  status: "asc",
  date: "desc",
  updated: "desc",
};

/** Which articles with metadata problems to find: those with errors, with warnings, or with either */
export type ProblemFilter = "errors" | "warnings" | "any";

/**
 * The custom metadata fields, which each configured type uses (a list, `false` for none, or all when missing), and the
 * groups the editor shows settings in, in order
 */
export interface MetadataInfo {
  definitions: MetadataDefinitions;
  types: Record<string, string[] | false>;
  groups: MetadataGroup[];
}

/** A search of the article index; every part is optional */
export interface ArticleQuery {
  /** Text the title contains (ignoring case and accents) */
  search?: string | undefined;
  type?: string | undefined;
  /** The author's name */
  author?: string | undefined;
  tag?: string | undefined;
  status?: ArticleStatus | undefined;
  /** Only articles with metadata errors, warnings, or either */
  problems?: ProblemFilter | undefined;
  /** Default: "date" */
  sort?: ArticleSort | undefined;
  /** Default: the sort's own default (see `DEFAULT_ORDERS`) */
  order?: ArticleOrder | undefined;
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

/** The kind of a file, by its extension */
export type FileKind =
  "image" | "document" | "archive" | "video" | "audio" | "other";

/** A file in an article's folder, as the article index lists it */
export interface IndexedFile {
  /** The article's type and slug */
  type: string;
  slug: string;
  /** The file's name in the article's folder */
  name: string;
  kind: FileKind;
  /** Its size in bytes */
  size: number;
  /** When it last changed (ISO 8601) */
  updated: string;
}

/** A file, as the file browser shows it */
export interface FileSummary extends IndexedFile {
  /** Its path on the website, e.g. "/news/welcome/photo.png" */
  url: string;
}

/** What files are sorted by: their name, kind, size, or location (article type and slug) */
export type FileSort = "name" | "kind" | "size" | "location";

/** Each file sort's default order: sizes largest first, the others A to Z */
export const DEFAULT_FILE_ORDERS: Readonly<Record<FileSort, ArticleOrder>> = {
  name: "asc",
  kind: "asc",
  size: "desc",
  location: "asc",
};

/** A search of the article folders' files; every part is optional */
export interface FileQuery {
  /** Text the name contains (ignoring case) */
  search?: string | undefined;
  kind?: FileKind | undefined;
  /** The article type the files are in */
  type?: string | undefined;
  /** Default: "location" */
  sort?: FileSort | undefined;
  /** Default: the sort's own default (see `DEFAULT_FILE_ORDERS`) */
  order?: ArticleOrder | undefined;
  /** The page to show, from 1 (default: 1) */
  page?: number | undefined;
  /** Files per page, at most 50 (default: 50) */
  perPage?: number | undefined;
}

/** A page of files found by a `FileQuery` */
export interface FilePage {
  files: FileSummary[];
  total: number;
  page: number;
  pages: number;
  perPage: number;
}

/** What the file browser's filters can choose from: the kinds of files and the article types they are in */
export interface FileFilters {
  kinds: FileKind[];
  types: string[];
}

/** The result of replacing or deleting a file: the replacement's name, and the articles whose references changed */
export interface FileChange {
  name?: string | undefined;
  articles: ArticleLocation[];
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

/**
 * The website, as the editor needs it: its name, the author of articles that don't name one (undefined for none), and
 * the types with their own default author (`false` for none)
 */
export interface SiteInfo {
  name: string;
  author?: EditorAuthor | undefined;
  types: Record<string, EditorAuthor | false>;
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
  /** The article's author, `false` for none, or undefined for its type's or the website's default */
  author?: EditorAuthor | false | undefined;
  excerpt?: string | undefined;
  thumbnail?: string | undefined;
  tags: string[];
  attachments: EditorAttachment[];
  /** The article body as editor HTML (readmore as `<hr class="readmore">`, embeds as `<div class="embed">URL</div>`) */
  bodyHtml: string;
  /**
   * Every other setting, by key: the custom metadata values, and settings the type doesn't use or nobody defined (kept
   * as they are). Default: none
   */
  meta?: Record<string, unknown> | undefined;
}

/** An article as loaded into the editor */
export interface EditorArticle extends EditorArticleData {
  /** Files in the article's folder (except article.md) */
  files: string[];
  /** Problems with its custom metadata as saved (none if left out) */
  problems?: MetadataProblem[] | undefined;
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
