import { Hono } from "hono";
import mime from "mime-types";
import {
  EMBED_RENDERERS,
  EmbedResolver,
  type EmbedRenderer,
} from "../../embeds/index.ts";
import type { Logger } from "../../generator/types/index.ts";
import {
  editorHtmlToMarkdown,
  markdownToEditorHtml,
} from "../convert/index.ts";
import { bodyBaseUrl, EditorError, type ArticleStore } from "../store/index.ts";
import type {
  ArticleLocation,
  ArticleQuery,
  ArticleSort,
  ArticleStatus,
  EditorArticleData,
  FileKind,
  FileQuery,
  FileSort,
  EmbedPreview,
} from "../types/index.ts";

/** Read search parameters as text or numbers, undefined when empty or not a number */
const paramReader = (params: URLSearchParams) => ({
  text: (name: string) => params.get(name) || undefined,
  number: (name: string) => {
    const value = Number(params.get(name) || NaN);
    return Number.isFinite(value) ? value : undefined;
  },
});

/** The kinds of files a file query can filter by */
const FILE_KINDS: readonly FileKind[] = [
  "image",
  "document",
  "archive",
  "video",
  "audio",
  "other",
];

/** The ways a file query can sort */
const FILE_SORTS: readonly FileSort[] = ["name", "kind", "size", "location"];

/**
 * Read a file query from a URL's search parameters, e.g. "?search=photo&kind=image&sort=size&order=desc&page=2".
 * Unknown kinds, sorts and orders, and pages that aren't numbers, are left out.
 *
 * @example
 * fileQuery(new URLSearchParams("kind=image&page=2")); // { kind: "image", page: 2 }
 */
export const fileQuery = (params: URLSearchParams): FileQuery => {
  const { text, number } = paramReader(params);
  const kind = text("kind") as FileKind | undefined;
  const sort = text("sort") as FileSort | undefined;
  const order = text("order");
  return Object.fromEntries(
    Object.entries({
      search: text("search"),
      kind: kind && FILE_KINDS.includes(kind) ? kind : undefined,
      type: text("type"),
      sort: sort && FILE_SORTS.includes(sort) ? sort : undefined,
      order: order === "asc" || order === "desc" ? order : undefined,
      page: number("page"),
      perPage: number("perPage"),
    }).filter(([, value]) => value !== undefined),
  );
};

/** The ways an article query can sort */
const SORTS: readonly ArticleSort[] = [
  "title",
  "type",
  "status",
  "date",
  "updated",
];

/** The statuses an article query can filter by */
const STATUSES: readonly ArticleStatus[] = ["published", "draft", "unlisted"];

/**
 * Read an article query from a URL's search parameters, e.g. "?search=hello&type=news&sort=title&order=desc&page=2".
 * Unknown statuses, sorts and orders, and pages that aren't numbers, are left out.
 *
 * @example
 * articleQuery(new URLSearchParams("search=hello&page=2")); // { search: "hello", page: 2 }
 */
export const articleQuery = (params: URLSearchParams): ArticleQuery => {
  const { text, number } = paramReader(params);
  const status = text("status") as ArticleStatus | undefined;
  const problems = text("problems");
  const sort = text("sort");
  const order = text("order");
  return Object.fromEntries(
    Object.entries({
      search: text("search"),
      type: text("type"),
      author: text("author"),
      tag: text("tag"),
      status: status && STATUSES.includes(status) ? status : undefined,
      problems:
        problems === "errors" || problems === "warnings" || problems === "any"
          ? problems
          : undefined,
      sort: SORTS.includes(sort as ArticleSort)
        ? (sort as ArticleSort)
        : undefined,
      order: order === "asc" || order === "desc" ? order : undefined,
      page: number("page"),
      perPage: number("perPage"),
    }).filter(([, value]) => value !== undefined),
  );
};

/** Options for the editor API */
export interface EditorAppOptions {
  /** Origins allowed to change articles, e.g. "http://127.0.0.1:5180" */
  allowedOrigins: readonly string[];
  /** Fetches extra data for embed previews (defaults to the global fetch) */
  fetch?: typeof fetch | undefined;
  /** Embed renderers tried after the config file's `embeds` (defaults to the built-in ones, EMBED_RENDERERS) */
  embedRenderers?: readonly EmbedRenderer[] | undefined;
}

/**
 * The Content Security Policy of preview pages and their files: like the website's pages (its own files, and frames
 * from the embed renderers' `frameSources`), but with no scripts, requests or forms at all. Previews are served from
 * the editor's own address, so this is what stops anything in an article from using the editor's API.
 *
 * @example
 * previewCsp([youtube]); // "default-src 'self'; script-src 'none'; frame-src https://www.youtube-nocookie.com; ..."
 */
export const previewCsp = (renderers: readonly EmbedRenderer[]): string => {
  const frames = [
    ...new Set(renderers.flatMap((renderer) => renderer.frameSources ?? [])),
  ];
  return `default-src 'self'; script-src 'none'; frame-src ${frames.join(" ") || "'none'"}; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`;
};

/** The preview pages' Content Security Policy with the built-in embed renderers (see previewCsp) */
export const PREVIEW_CSP = previewCsp(EMBED_RENDERERS);

/**
 * Create the article editor's local API. Requests that change files must come from the editor's own page (checked
 * with the Origin header), so other websites open in the same browser can't write articles.
 *
 * Routes:
 * - `GET /api/articles`: list articles
 * - `GET /api/types`: the article types from the config file, with their labels
 * - `GET /api/templates/:type`: the template names an article of a type can use
 * - `POST /api/articles`: create an article
 * - `GET|PUT|DELETE /api/articles/:type/:slug`: load, save (and move) or delete an article
 * - `POST /api/articles/:type/:slug/files`: upload a file (multipart field "file")
 * - `GET /files/:type/:slug/:name`: an article's file, for previews in the editor
 * - `GET /api/embed?url=...`: render an embed URL as the website would, for previews in the editor
 * - `POST /api/convert/markdown` and `POST /api/convert/html`: convert an article body between editor HTML and Markdown
 *   (`{ html | markdown, location? }`, where `location` is the saved article's, which relative URLs are relative to)
 * - `POST /api/preview`: remember unsaved article data (`{ data, location? }`) for a preview page, and give its URL
 *   (`{ url }`); answers 400 if it can't be rendered
 * - `GET /preview/:id/`: render a remembered preview with its type's "single" template, and `GET /<path>`: one of the
 *   site's static files (e.g. `/site.css`), both with a Content Security Policy that forbids scripts (`previewCsp`)
 *
 * Embeds are rendered with the config file's `embeds`, then `embedRenderers`.
 *
 * @example
 * const app = createEditorApp(new ArticleStore(await loadSiteConfig({ siteDir: "my-site" })), { allowedOrigins: ["http://127.0.0.1:5180"] });
 */
export const createEditorApp = (
  store: ArticleStore,
  {
    allowedOrigins,
    fetch: fetchFn = (...args) => fetch(...args),
    embedRenderers = EMBED_RENDERERS,
  }: EditorAppOptions,
): Hono => {
  const app = new Hono();

  /** The embed renderers: the config file's, then the given ones */
  const renderers = async () => [...(await store.embeds()), ...embedRenderers];

  /**
   * A new embed resolver, each time, so a fixed URL, a network failure or a changed renderer isn't remembered
   */
  const embedResolver = async (logger: Logger) =>
    new EmbedResolver({ fetch: fetchFn, logger, renderers: await renderers() });

  /** The preview pages' Content Security Policy, allowing the renderers' frames */
  const csp = async () => previewCsp(await renderers());

  app.use(async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const origin = c.req.header("origin");
      if (!origin || !allowedOrigins.includes(origin))
        return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  });

  app.onError((error, c) =>
    error instanceof EditorError
      ? c.json(
          {
            error: error.message,
            ...(error.problems ? { problems: error.problems } : {}),
          },
          error.status as 400,
        )
      : c.json({ error: error.message }, 500),
  );

  app.get("/api/articles", async (c) =>
    c.json(await store.query(articleQuery(new URL(c.req.url).searchParams))),
  );

  app.get("/api/articles/recent", async (c) => c.json(await store.recent()));

  app.get("/api/files", async (c) =>
    c.json(await store.queryFiles(fileQuery(new URL(c.req.url).searchParams))),
  );

  app.get("/api/files/filters", async (c) => c.json(await store.fileFilters()));

  app.get("/api/files/:type/:slug/:name/references", async (c) =>
    c.json(
      await store.fileReferences(
        c.req.param("type"),
        c.req.param("slug"),
        c.req.param("name"),
      ),
    ),
  );

  app.put("/api/files/:type/:slug/:name", async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File))
      throw new EditorError(400, 'Expected a file in the "file" field');
    return c.json(
      await store.replaceFile(
        c.req.param("type"),
        c.req.param("slug"),
        c.req.param("name"),
        file.name,
        new Uint8Array(await file.arrayBuffer()),
      ),
    );
  });

  app.delete("/api/files/:type/:slug/:name", async (c) =>
    c.json(
      await store.deleteFile(
        c.req.param("type"),
        c.req.param("slug"),
        c.req.param("name"),
      ),
    ),
  );

  app.get("/api/articles/filters", async (c) => c.json(await store.filters()));

  app.get("/api/types", async (c) => c.json(await store.types()));

  app.get("/api/site", async (c) => c.json(await store.site()));

  app.get("/api/metadata", async (c) => c.json(await store.metadataInfo()));

  app.get("/api/templates/:type", (c) =>
    c.json(store.templates(c.req.param("type"))),
  );

  app.get("/api/embed", async (c) => {
    const url = c.req.query("url") ?? "";
    const warnings: string[] = [];
    const embeds = await embedResolver({
      warn: (message) => warnings.push(message),
    });
    return c.json<EmbedPreview>({
      html: await embeds.render(url, "Preview"),
      warnings,
    });
  });

  app.post("/api/convert/markdown", async (c) => {
    const { html, location } = await c.req.json<{
      html: string;
      location?: ArticleLocation;
    }>();
    return c.json({
      markdown: editorHtmlToMarkdown(html, bodyBaseUrl(location)),
    });
  });

  app.post("/api/convert/html", async (c) => {
    const { markdown, location } = await c.req.json<{
      markdown: string;
      location?: ArticleLocation;
    }>();
    return c.json({
      html: markdownToEditorHtml(markdown, bodyBaseUrl(location)),
    });
  });

  app.post("/api/preview", async (c) => {
    const { data, location } = await c.req.json<{
      data: EditorArticleData;
      location?: ArticleLocation;
    }>();
    const embeds = await embedResolver({ warn: () => undefined });
    // Rendered now to report problems (e.g. a missing file), then again each time the page is shown
    await store.preview(data, location, embeds);
    return c.json({
      url: `/preview/${store.rememberPreview(data, location)}/`,
    });
  });

  app.post("/api/articles", async (c) => {
    const data = await c.req.json<EditorArticleData>();
    return c.json(await store.save(data), 201);
  });

  app.get("/api/articles/:type/:slug", async (c) =>
    c.json(await store.read(c.req.param("type"), c.req.param("slug"))),
  );

  app.put("/api/articles/:type/:slug", async (c) => {
    const data = await c.req.json<EditorArticleData>();
    return c.json(
      await store.save(data, {
        type: c.req.param("type"),
        slug: c.req.param("slug"),
      }),
    );
  });

  app.delete("/api/articles/:type/:slug", async (c) => {
    await store.remove(c.req.param("type"), c.req.param("slug"));
    return c.body(null, 204);
  });

  app.post("/api/articles/:type/:slug/files", async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File))
      throw new EditorError(400, 'Expected a file in the "file" field');
    return c.json(
      await store.upload(
        c.req.param("type"),
        c.req.param("slug"),
        file.name,
        new Uint8Array(await file.arrayBuffer()),
      ),
      201,
    );
  });

  app.get("/files/:type/:slug/:name", async (c) => {
    const name = c.req.param("name");
    const contents = await store.file(
      c.req.param("type"),
      c.req.param("slug"),
      name,
    );
    return c.body(contents as Uint8Array<ArrayBuffer>, 200, {
      "Content-Type": mime.lookup(name) || "application/octet-stream",
      "Cache-Control": "no-store",
    });
  });

  // A remembered preview, rendered now, so template changes show when it reloads
  app.get("/preview/:id/", async (c) => {
    const html = await store.renderPreview(
      c.req.param("id"),
      await embedResolver({ warn: () => undefined }),
    );
    return c.html(html, 200, {
      "Cache-Control": "no-store",
      "Content-Security-Policy": await csp(),
    });
  });

  // The site's static files (stylesheet, fonts), at the root as preview pages link them
  app.get("/*", async (c) => {
    const path = decodeURIComponent(c.req.path.slice(1));
    return c.body(
      (await store.staticFile(path)) as Uint8Array<ArrayBuffer>,
      200,
      {
        "Content-Type": mime.lookup(path) || "application/octet-stream",
        "Cache-Control": "no-store",
        "Content-Security-Policy": await csp(),
      },
    );
  });

  return app;
};
