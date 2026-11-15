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

/** An article type's labels from config.yml */
export interface ArticleTypeLabels {
  /** e.g. "Article" */
  labelSingle: string;
  /** e.g. "Articles" */
  labelPlural: string;
}
