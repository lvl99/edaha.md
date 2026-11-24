import { Hono } from "hono";
import mime from "mime-types";
import {
  EMBED_PAGE_PARTS,
  EMBED_SOURCE_KINDS,
  EmbedResolver,
  embedText,
  type EmbedPlugin,
  type EmbedSources,
} from "@lvl99dotcom/edaha.md/embeds";
import { withPlugins } from "@lvl99dotcom/edaha.md/generator/build";
import type { Logger } from "@lvl99dotcom/edaha.md/generator/types";
import {
  editorHtmlToMarkdown,
  markdownToEditorHtml,
} from "../convert/index.ts";
import {
  bodyBaseUrl,
  EditorError,
  type ArticleStore,
  type EmbedFrameData,
} from "../store/index.ts";
import type {
  ArticleLocation,
  ArticleQuery,
  ArticleSort,
  ArticleStatus,
  EditorArticleData,
  FileKind,
  FileQuery,
  FileSort,
  EmbedFrame,
  EmbedInfo,
  EmbedValidation,
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
  /** Fetches extra data for embeds (defaults to the global fetch) */
  fetch?: typeof fetch | undefined;
  /** Embed plugins added after the config file's `plugins` (a key in both uses the config file's). Default: none */
  plugins?: readonly EmbedPlugin[] | undefined;
  /**
   * Optional; the origin preview pages and embed frames are shown from, e.g. "http://localhost:5180": an address of
   * the same server that isn't the editor's own, so they run in an origin (and site) of their own. The API answers
   * nothing there.
   */
  previewOrigin?: string | undefined;
}

/**
 * The origin preview pages and embed frames are shown from, for an editor at an address: `localhost` instead of
 * `127.0.0.1`, which is the same server but another origin and site.
 *
 * @example
 * previewOriginOf("http://127.0.0.1:5180"); // "http://localhost:5180"
 */
export const previewOriginOf = (editorOrigin: string): string => {
  const url = new URL(editorOrigin);
  url.hostname = "localhost";
  return url.origin;
};

/**
 * An embed block sent to the API: its key, content and options (none when they aren't a map).
 *
 * @example
 * await embedRequest(request); // { key: "bandcamp", content: "https://...", options: { layout: "large" } }
 */
const embedRequest = async (request: Request): Promise<EmbedFrameData> => {
  const { key, content, options } = (await request.json()) as Partial<
    Record<keyof EmbedFrameData, unknown>
  >;
  return {
    key: String(key ?? ""),
    content: String(content ?? ""),
    options:
      options && typeof options === "object" && !Array.isArray(options)
        ? (options as EmbedFrameData["options"])
        : {},
  };
};

/** A logger that leaves out warnings, for renders whose problems the editor shows itself (or doesn't need) */
const QUIET: Logger = { warn: () => undefined };

/** The kinds of embed sources, by the Content Security Policy directive that allows them */
const SOURCE_DIRECTIVES: Record<keyof EmbedSources, string> = {
  frame: "frame-src",
  script: "script-src 'self' 'unsafe-inline'",
  style: "style-src 'self' 'unsafe-inline'",
  font: "font-src 'self' data:",
  // 'self' is replaced with the page's own address (see previewCsp)
  connect: "connect-src",
};

/**
 * The Content Security Policy of preview pages, embed frames and the files they load. They are shown from an origin
 * of their own (`previewOrigin`), which the editor's API doesn't answer and whose changes it refuses, and are
 * sandboxed (`sandbox`, keeping their own origin, so embedded players such as Bandcamp's keep theirs) so they can't
 * send forms or navigate the editor page. Inside, they may run their own scripts and styles, and load from their own
 * address and the web addresses the embed plugins list in `sources`. Only the editor's pages may show them in frames.
 *
 * @param self - the address they are served from, e.g. "http://localhost:5180"
 * @param ancestors - the editor's own addresses, which may show them in frames
 * @example
 * previewCsp([youtube], "http://localhost:5180", ["http://127.0.0.1:5180"]); // "sandbox allow-scripts allow-same-origin ...; default-src http://localhost:5180; ...; frame-src https://www.youtube-nocookie.com; ..."
 */
export const previewCsp = (
  plugins: readonly EmbedPlugin[],
  self: string,
  ancestors: readonly string[] = [],
): string => {
  const directives = EMBED_SOURCE_KINDS.map((kind) => {
    const origins = [
      ...new Set(plugins.flatMap((plugin) => plugin.sources?.[kind] ?? [])),
    ];
    const directive = SOURCE_DIRECTIVES[kind].replace("'self'", self);
    // Frames and requests are only allowed to the listed addresses
    return `${directive} ${origins.join(" ") || (directive.includes(" ") ? "" : "'none'")}`.trimEnd();
  });
  return [
    "sandbox allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox",
    `default-src ${self}`,
    ...directives,
    `img-src ${self} data: https:`,
    `media-src ${self} https:`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${["'self'", ...ancestors].join(" ")}`,
  ].join("; ");
};

/**
 * Sends an embed frame's height to the editor page (which sizes the frame to fit), whenever it changes. Messages
 * carry `{ edahaEmbedHeight }`.
 */
const FRAME_HEIGHT_SCRIPT = `<script>
  const report = () => parent.postMessage({ edahaEmbedHeight: document.documentElement.scrollHeight }, "*");
  new ResizeObserver(report).observe(document.documentElement);
  addEventListener("load", report);
</script>`;

/**
 * The page shown in an embed block's frame in the editor's body: the embed rendered for the editor, with the HTML it
 * needs once, in the editor's light or dark theme.
 *
 * @example
 * embedFramePage('<div class="embed">...</div>', { head: "", foot: "" }, "dark");
 */
export const embedFramePage = (
  html: string,
  parts: { head: string; foot: string },
  theme: "light" | "dark" | undefined,
): string => `<!doctype html>
<html lang="en"${theme ? ` data-theme="${theme}" style="color-scheme: ${theme}"` : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank">
<style>
  html { color-scheme: light dark; }
  body { margin: 0; font-family: system-ui, sans-serif; }
  iframe, img, svg, video { max-width: 100%; }
  .embed-text { white-space: pre-wrap; }
</style>
${parts.head}
</head>
<body>
${html}
${parts.foot}
${FRAME_HEIGHT_SCRIPT}
</body>
</html>
`;

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
 * - `GET /api/embeds`: the embed plugins (`EmbedInfo`), for the editor's embed dialog
 * - `POST /api/embed-validations`: check an embed block's content (`{ key, content }`) with its plugin's `validate`,
 *   giving why it isn't valid (`EmbedValidation`)
 * - `POST /api/embed-frames`: remember an embed block (`{ key, content }`) for its frame in the editor's body, and give
 *   the frame's URL, and why its content isn't valid (then it has no frame) or can't be shown (`EmbedFrame`); `GET /embed-frame/:id/?theme=light|dark` is the frame's page
 * - `POST /api/convert/markdown` and `POST /api/convert/html`: convert an article body between editor HTML and Markdown
 *   (`{ html | markdown, location? }`, where `location` is the saved article's, which relative URLs are relative to)
 * - `POST /api/preview`: remember unsaved article data (`{ data, location? }`) for a preview page, and give its URL
 *   and the extensions of the files its template outputs, HTML first (`{ url, outputs }`); answers 400 if it can't be
 *   rendered
 * - `GET /preview/:id/`: render a remembered preview with its own template (its HTML output), `GET /preview/:id/index.<extension>`
 *   its output with another extension (e.g. `index.json`), and `GET /<path>`: one of the
 *   site's static files (e.g. `/site.css`) or an article's file at its path on the website (e.g.
 *   `/news/welcome/photo.png`), all sandboxed by their Content Security Policy (`previewCsp`)
 *
 * Embeds are rendered with the config file's `plugins`, then the given `plugins`.
 *
 * @example
 * const app = createEditorApp(new ArticleStore(await loadSiteConfig({ siteDir: "my-site" })), { allowedOrigins: ["http://127.0.0.1:5180"] });
 */
export const createEditorApp = (
  store: ArticleStore,
  {
    allowedOrigins,
    fetch: fetchFn = (...args) => fetch(...args),
    plugins: givenPlugins = [],
    previewOrigin,
  }: EditorAppOptions,
): Hono => {
  const app = new Hono();

  /** The embed plugins: the config file's, then the given ones */
  const plugins = async () => withPlugins(await store.plugins(), givenPlugins);

  /**
   * A new embed resolver, each time, so a fixed embed, a network failure or a changed plugin isn't remembered
   */
  const embedResolver = async (logger: Logger) =>
    new EmbedResolver({ fetch: fetchFn, logger, plugins: await plugins() });

  /** The Content Security Policy of preview pages and embed frames, allowing the plugins' sources */
  const csp = async (url: string) =>
    previewCsp(await plugins(), new URL(url).origin, allowedOrigins);

  app.use(async (c, next) => {
    // The previews' own origin only shows previews, embed frames and their files: not the API
    if (
      previewOrigin &&
      new URL(c.req.url).origin === previewOrigin &&
      c.req.path.startsWith("/api/")
    )
      return c.json({ error: "Not found" }, 404);
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

  app.get("/api/embeds", async (c) =>
    c.json<EmbedInfo[]>(
      (await plugins()).map(
        ({
          key,
          name,
          description,
          info,
          contentOptional,
          options,
          editor,
        }) => ({
          key,
          name,
          description,
          info,
          contentOptional,
          icon: editor?.icon,
          options,
        }),
      ),
    ),
  );

  app.post("/api/embed-validations", async (c) => {
    const { key, content, options } = await embedRequest(c.req.raw);
    const embeds = await embedResolver(QUIET);
    return c.json<EmbedValidation>({
      errors: await embeds.validate(key, content, options),
    });
  });

  app.post("/api/embed-frames", async (c) => {
    const frame = await embedRequest(c.req.raw);
    const { key, content, options } = frame;
    const warnings: string[] = [];
    const embeds = await embedResolver({
      warn: (message) => warnings.push(message),
    });
    // Content that isn't valid isn't on the website, so it has no frame
    const known = (await plugins()).some((plugin) => plugin.key === key);
    const errors = known ? await embeds.validate(key, content, options) : [];
    if (errors.length) return c.json<EmbedFrame>({ url: "", errors, warnings });
    // Rendered now to report problems, then again each time the frame is shown
    await embeds.renderPage(
      embeds.place(key, embedText(content, options), "Embed"),
      "Embed",
      "editor",
    );
    return c.json<EmbedFrame>({
      url: `/embed-frame/${store.rememberEmbedFrame(frame)}/`,
      errors,
      warnings,
    });
  });

  // A remembered embed block, rendered for the editor now, so changes to its plugin show when it reloads
  app.get("/embed-frame/:id/", async (c) => {
    const { key, content, options } = store.embedFrame(c.req.param("id"));
    const theme = c.req.query("theme");
    const embeds = await embedResolver(QUIET);
    return c.html(
      await embeds.renderPage(
        embedFramePage(
          embeds.place(key, embedText(content, options), "Embed"),
          EMBED_PAGE_PARTS,
          theme === "light" || theme === "dark" ? theme : undefined,
        ),
        "Embed",
        "editor",
      ),
      200,
      {
        "Cache-Control": "no-store",
        "Content-Security-Policy": await csp(c.req.url),
      },
    );
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
    const embeds = await embedResolver(QUIET);
    // Rendered now to report problems (e.g. a missing file), then again each time the page is shown
    await store.preview(data, location, embeds);
    return c.json({
      url: `/preview/${store.rememberPreview(data, location)}/`,
      outputs: store.previewOutputs(data),
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
      await embedResolver(QUIET),
    );
    return c.html(html, 200, {
      "Cache-Control": "no-store",
      "Content-Security-Policy": await csp(c.req.url),
    });
  });

  // A remembered preview's output with another extension (e.g. index.json), rendered now
  app.get("/preview/:id/:file{index\\.[a-z0-9]+}", async (c) => {
    const file = c.req.param("file");
    const body = await store.renderPreview(
      c.req.param("id"),
      await embedResolver(QUIET),
      file.slice("index.".length),
    );
    return c.body(body, 200, {
      "Content-Type": mime.contentType(file) || "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": await csp(c.req.url),
    });
  });

  // The site's static files (stylesheet, fonts) and articles' files, at their paths on the website as pages link them
  app.get("/*", async (c) => {
    const path = decodeURIComponent(c.req.path.slice(1));
    return c.body(
      (await store.staticFile(path)) as Uint8Array<ArrayBuffer>,
      200,
      {
        "Content-Type": mime.lookup(path) || "application/octet-stream",
        "Cache-Control": "no-store",
        "Content-Security-Policy": await csp(c.req.url),
      },
    );
  });

  return app;
};
