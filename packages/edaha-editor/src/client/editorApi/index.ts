import type {
  ArticleFilters,
  ArticleLocation,
  FileChange,
  FileConflict,
  FileFilters,
  FilePage,
  FileQuery,
  MetadataInfo,
  MetadataProblem,
  SiteInfo,
  ArticlePage,
  ArticleQuery,
  ArticleTypeLabels,
  EditorArticle,
  EditorArticleData,
  EmbedFrame,
  EmbedInfo,
  EmbedValidation,
  RecentArticles,
  UploadResult,
} from "../../server/types/index.ts";
import { isShared, sharedFilePath } from "../../server/types/index.ts";

import { previewAddress } from "../embeds/index.ts";

export type { ArticleLocation } from "../../server/types/index.ts";

/** How an EditorApi reaches the editor's server */
export interface EditorApiOptions {
  /**
   * The editor server's address, e.g. "http://127.0.0.1:5180", for a page the server doesn't serve itself (e.g. an
   * app showing `<edaha-editor>`). Requests, articles' files and previews use it. Default: "" (the page's own server)
   */
  baseUrl?: string | undefined;
  /** Sends the requests, e.g. through an app's own channel to the server. Default: the global fetch */
  fetch?: typeof fetch | undefined;
}

/**
 * A failed request: the server's message, the problems with an article's metadata when saving it was refused, and the
 * two files when a file couldn't be saved because another has its name
 */
export class ApiError extends Error {
  readonly problems?: MetadataProblem[] | undefined;

  readonly conflict?: FileConflict | undefined;

  constructor(
    message: string,
    problems?: MetadataProblem[],
    conflict?: FileConflict,
  ) {
    super(message);
    this.problems = problems;
    this.conflict = conflict;
  }
}

/** How to upload a file: under another name, or overwriting a file with its name */
export interface UploadOptions {
  name?: string | undefined;
  overwrite?: boolean | undefined;
}

/** A file in an article's folder */
export interface FileLocation extends ArticleLocation {
  name: string;
}

/**
 * A query as URL search parameters, leaving out empty parts, e.g. "?search=hi&page=2" (or "" for none).
 *
 * @example
 * searchParams({ search: "hi", type: "", page: 2 }); // "?search=hi&page=2"
 */
export const searchParams = (query: object): string => {
  const params = new URLSearchParams(
    Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([name, value]) => [name, String(value)]),
  );
  return params.size ? `?${params}` : "";
};

/**
 * A file's API route, or the route of the articles that refer to it: by its article, or by its path in the shared
 * files folder.
 *
 * @example
 * fileRoute({ type: "news", slug: "hello", name: "a b.png" }); // "/api/files/news/hello/a%20b.png"
 * fileRoute({ type: "@shared", slug: "2026/11", name: "a.png" }, "references"); // "/api/shared-files/references?path=2026%2F11%2Fa.png"
 */
const fileRoute = (file: FileLocation, part?: "references") =>
  isShared(file)
    ? `/api/shared-files${part ? `/${part}` : ""}?path=${encodeURIComponent(sharedFilePath(file))}`
    : `/api/files/${file.type}/${file.slug}/${encodeURIComponent(file.name)}${part ? `/${part}` : ""}`;

/** A preview page: its URL, and the extensions of the files its article's template outputs, HTML first */
export interface PreviewPage {
  url: string;
  outputs: string[];
}

/**
 * Talks to the editor's local server (see src/server/app.ts): the page's own, or another at `baseUrl`.
 *
 * @example
 * const api = new EditorApi();
 * const { articles, total } = await api.query({ search: "hello" });
 * const other = new EditorApi({ baseUrl: "http://127.0.0.1:5193" });
 */
export class EditorApi {
  private readonly fetch: typeof fetch;

  /** The editor server's address, without a "/" at the end, or "" for the page's own server */
  readonly baseUrl: string;

  /**
   * @param options - the editor server's address and how to send requests to it, or (as before) just the fetch
   */
  constructor(options: EditorApiOptions | typeof fetch = {}) {
    const given: EditorApiOptions =
      typeof options === "function" ? { fetch: options } : options;
    const defaultFetch: typeof fetch = (...args) => fetch(...args);
    const { baseUrl = "", fetch: fetchFn = defaultFetch } = given;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetch = fetchFn;
  }

  /**
   * The address of a path on the editor's server (e.g. an article's file), for links and images. Other addresses
   * (e.g. "https://...", or a name relative to the page) are kept as they are.
   *
   * @example
   * new EditorApi({ baseUrl: "http://127.0.0.1:5193" }).url("/files/news/hello/a.png");
   * // "http://127.0.0.1:5193/files/news/hello/a.png"
   */
  url(path: string): string {
    return /^\/(?!\/)/.test(path) ? `${this.baseUrl}${path}` : path;
  }

  /**
   * The address a preview page or embed frame is shown from: the editor server's, at the previews' own origin (see
   * previewAddress).
   *
   * @example
   * new EditorApi({ baseUrl: "http://127.0.0.1:5193" }).previewUrl("/preview/1/");
   * // "http://localhost:5193/preview/1/"
   */
  previewUrl(path: string): string {
    return previewAddress(this.url(path));
  }

  /**
   * Send a request and return its JSON response. Throws an Error with the server's message if it fails.
   */
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetch(this.url(path), init);
    if (response.status === 204) return undefined as T;
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      problems?: MetadataProblem[];
      conflict?: FileConflict;
    };
    if (!response.ok)
      throw new ApiError(
        body.error ?? `Request failed with ${response.status}`,
        body.problems,
        body.conflict,
      );
    return body as T;
  }

  /** Send JSON with a method */
  private send<T>(method: string, path: string, data: unknown) {
    return this.request<T>(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  /**
   * Find articles by title, type, author, tag and status, sorted by title or date, a page at a time.
   *
   * @example
   * await api.query({ search: "hello", sort: "title", page: 2 });
   */
  query(query: ArticleQuery = {}): Promise<ArticlePage> {
    return this.request(`/api/articles${searchParams(query)}`);
  }

  /**
   * Find files in the articles' folders by name, kind and article type, sorted by name, kind, size or location, a page
   * at a time.
   *
   * @example
   * await api.queryFiles({ kind: "image", sort: "size", order: "desc" });
   */
  queryFiles(query: FileQuery = {}): Promise<FilePage> {
    return this.request(`/api/files${searchParams(query)}`);
  }

  /** The kinds of files and the article types they are in, for the file browser's filters */
  fileFilters(): Promise<FileFilters> {
    return this.request("/api/files/filters");
  }

  /** The articles that refer to a file */
  fileReferences(file: FileLocation): Promise<ArticleLocation[]> {
    return this.request(fileRoute(file, "references"));
  }

  /** Replace a file with another, updating references to it if the new one's name differs */
  replaceFile(file: FileLocation, replacement: File): Promise<FileChange> {
    const body = new FormData();
    body.append("file", replacement);
    return this.request(fileRoute(file), { method: "PUT", body });
  }

  /** Delete a file, removing references to it from every article */
  deleteFile(file: FileLocation): Promise<FileChange> {
    return this.request(fileRoute(file), { method: "DELETE" });
  }

  /** Each type's most recently changed articles, for the nav */
  recent(): Promise<RecentArticles[]> {
    return this.request("/api/articles/recent");
  }

  /** The types, authors and tags articles use, for the article browser's filters */
  filters(): Promise<ArticleFilters> {
    return this.request("/api/articles/filters");
  }

  /** The custom metadata fields, and which fields each configured type uses */
  metadata(): Promise<MetadataInfo> {
    return this.request("/api/metadata");
  }

  /** The website's name, and the author of articles that don't name one */
  site(): Promise<SiteInfo> {
    return this.request("/api/site");
  }

  /** The article types from the config file, with their labels */
  types(): Promise<Record<string, ArticleTypeLabels>> {
    return this.request("/api/types");
  }

  /** The template names an article of a type can use */
  templates(type: string): Promise<string[]> {
    return this.request(`/api/templates/${type}`);
  }

  /** Load an article for editing */
  read({ type, slug }: ArticleLocation): Promise<EditorArticle> {
    return this.request(`/api/articles/${type}/${slug}`);
  }

  /** Create a new article */
  create(data: EditorArticleData): Promise<ArticleLocation> {
    return this.send("POST", "/api/articles", data);
  }

  /** Save an article, moving it if its type or slug changed */
  save(
    from: ArticleLocation,
    data: EditorArticleData,
  ): Promise<ArticleLocation> {
    return this.send("PUT", `/api/articles/${from.type}/${from.slug}`, data);
  }

  /** Delete an article and its files */
  remove({ type, slug }: ArticleLocation): Promise<void> {
    return this.request(`/api/articles/${type}/${slug}`, { method: "DELETE" });
  }

  /** The site's embed plugins */
  embeds(): Promise<EmbedInfo[]> {
    return this.request("/api/embeds");
  }

  /** Why an embed block's content or options aren't valid for its plugin (none when they are) */
  async validateEmbed(
    key: string,
    content: string,
    options: Record<string, unknown> = {},
  ): Promise<string[]> {
    return (
      await this.send<EmbedValidation>("POST", "/api/embed-validations", {
        key,
        content,
        options,
      })
    ).errors;
  }

  /** Render an embed block for its frame in the rich text body */
  embedFrame(
    key: string,
    content: string,
    options: Record<string, unknown> = {},
  ): Promise<EmbedFrame> {
    return this.send("POST", "/api/embed-frames", { key, content, options });
  }

  /** Convert an article body from editor HTML to Markdown (relative URLs are relative to its saved location) */
  async toMarkdown(html: string, location?: ArticleLocation): Promise<string> {
    return (
      await this.send<{ markdown: string }>("POST", "/api/convert/markdown", {
        html,
        location,
      })
    ).markdown;
  }

  /** Convert an article body from Markdown to editor HTML (relative URLs are relative to its saved location) */
  async toHtml(markdown: string, location?: ArticleLocation): Promise<string> {
    return (
      await this.send<{ html: string }>("POST", "/api/convert/html", {
        markdown,
        location,
      })
    ).html;
  }

  /**
   * Render unsaved article data as the website would, with its own template, as a temporary page on the preview server.
   * Gives the page's URL and the extensions of the files its template outputs, HTML first; the output with another
   * extension is at `index.<extension>` under the URL.
   *
   * @example
   * await api.preview(data); // { url: "/preview/<id>/", outputs: ["html", "json"] }, and /preview/<id>/index.json
   */
  async preview(
    data: EditorArticleData,
    location?: ArticleLocation,
  ): Promise<PreviewPage> {
    return this.send<PreviewPage>("POST", "/api/preview", {
      data,
      location,
    });
  }

  /**
   * Upload a file where the config file's `files.uploadTo` says: the article's folder (which must be given), or the
   * shared files folder. A file there with its name fails with an ApiError giving the `conflict`, unless overwritten.
   *
   * @example
   * await api.upload({ type: "news", slug: "hello" }, file);
   * await api.upload(undefined, file, { name: "photo-2.png" }); // into the shared files folder
   */
  upload(
    article: ArticleLocation | undefined,
    file: File,
    { name, overwrite }: UploadOptions = {},
  ): Promise<UploadResult> {
    const body = new FormData();
    body.append("file", file);
    if (name) body.append("name", name);
    if (overwrite) body.append("overwrite", "true");
    return this.request(
      article
        ? `/api/articles/${article.type}/${article.slug}/files`
        : "/api/files",
      { method: "POST", body },
    );
  }
}
