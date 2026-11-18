import type {
  ArticleFilters,
  ArticleLocation,
  ArticlePage,
  ArticleQuery,
  ArticleTypeLabels,
  EditorArticle,
  EditorArticleData,
  EmbedPreview,
  RecentArticles,
  UploadResult,
} from "../../server/types/index.ts";

export type { ArticleLocation } from "../../server/types/index.ts";

/**
 * Talks to the editor's local server (see src/server/app.ts).
 *
 * @example
 * const api = new EditorApi();
 * const { articles, total } = await api.query({ search: "hello" });
 */
export class EditorApi {
  private readonly fetch: typeof fetch;

  constructor(fetchFn: typeof fetch = (...args) => fetch(...args)) {
    this.fetch = fetchFn;
  }

  /**
   * Send a request and return its JSON response. Throws an Error with the server's message if it fails.
   */
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetch(path, init);
    if (response.status === 204) return undefined as T;
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok)
      throw new Error(body.error ?? `Request failed with ${response.status}`);
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
    const params = new URLSearchParams(
      Object.entries(query)
        .filter(([, value]) => value !== undefined && value !== "")
        .map(([name, value]) => [name, String(value)]),
    );
    return this.request(`/api/articles${params.size ? `?${params}` : ""}`);
  }

  /** Each type's most recently changed articles, for the nav */
  recent(): Promise<RecentArticles[]> {
    return this.request("/api/articles/recent");
  }

  /** The types, authors and tags articles use, for the article browser's filters */
  filters(): Promise<ArticleFilters> {
    return this.request("/api/articles/filters");
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

  /** Render an embed URL as the website would */
  embedPreview(url: string): Promise<EmbedPreview> {
    return this.request(`/api/embed?url=${encodeURIComponent(url)}`);
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
   * Render unsaved article data as the website would, with its type's "single" template, as a temporary page on the
   * preview server. Returns the page's URL.
   */
  async preview(
    data: EditorArticleData,
    location?: ArticleLocation,
  ): Promise<string> {
    return (
      await this.send<{ url: string }>("POST", "/api/preview", {
        data,
        location,
      })
    ).url;
  }

  /** Upload a file into an article's folder */
  upload({ type, slug }: ArticleLocation, file: File): Promise<UploadResult> {
    const body = new FormData();
    body.append("file", file);
    return this.request(`/api/articles/${type}/${slug}/files`, {
      method: "POST",
      body,
    });
  }
}
