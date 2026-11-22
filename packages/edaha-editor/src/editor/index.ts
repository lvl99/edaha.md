import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import mime from "mime-types";
import { EDITOR_PORT } from "@lvl99dotcom/edaha.md/cli";
import type { EmbedPlugin } from "@lvl99dotcom/edaha.md/embeds";
import { createEditorApp, previewOriginOf } from "../server/app/index.ts";
import { ArticleStore } from "../server/store/index.ts";
import {
  loadSiteConfig,
  type SiteConfigOptions,
} from "@lvl99dotcom/edaha.md/generator/configFile";

/** The editor only listens on this computer's own address, so nothing else on the network can reach it */
export const EDITOR_HOST = "127.0.0.1";

/** The editor's default port (the same as `edaha editor`'s) */
export { EDITOR_PORT };

/** The URL path the editor page's own files (scripts, styles) are served under, apart from the site's static files */
export const EDITOR_BASE = "/_editor/";

/**
 * The editor page's built files (`dist/client`, bundled by Vite). The path is the same from `src/editor` (in the
 * workspace) and from the published `dist/editor`, so the editor never serves the page's unbuilt source.
 */
export const CLIENT_DIR = fileURLToPath(
  new URL("../../dist/client", import.meta.url),
);

/** Options for the article editor's server */
export interface EditorServerOptions extends SiteConfigOptions {
  /** The theme folder that the site's templates and static files override. Default: the config's `theme`, else THEME_DIR */
  themeDir?: string;
  /** The port to listen on. Default: EDITOR_PORT */
  port?: number;
  /** The editor page's built files. Default: CLIENT_DIR */
  clientDir?: string;
  /** Fetches extra data for embeds (defaults to the global fetch) */
  fetch?: typeof fetch;
  /** Embed plugins added after the config file's `plugins` (a key in both uses the config file's). Default: none */
  plugins?: readonly EmbedPlugin[];
  /**
   * Hide the "edaha.md" title, e.g. in an app that shows the editor in its own window (Home still goes back to the
   * welcome prompt). Default: false
   */
  hideTitle?: boolean;
  /**
   * Hide the light/dark theme switcher, showing the device's light or dark theme instead, e.g. in an app that sets it.
   * Default: false
   */
  hideThemeSwitcher?: boolean;
}

/** A running editor server */
export interface EditorServer {
  /** The editor's address, e.g. "http://127.0.0.1:5180" */
  url: string;
  /** Stop the server */
  close: () => Promise<void>;
}

/**
 * The editor's address for a port.
 *
 * @example
 * editorUrl(5180); // "http://127.0.0.1:5180"
 */
export const editorUrl = (port: number): string =>
  `http://${EDITOR_HOST}:${port}`;

/**
 * The port an editor listens on: the given one, or EDITOR_PORT.
 *
 * @example
 * editorPort({}); // 5180
 */
export const editorPort = (options: EditorServerOptions): number =>
  options.port ?? EDITOR_PORT;

/**
 * The editor page's HTML with the options that change how it looks set as attributes of its `<edaha-editor>` element.
 *
 * @example
 * editorPage("<edaha-editor></edaha-editor>", { hideTitle: true }); // "<edaha-editor hide-title></edaha-editor>"
 */
export const editorPage = (
  html: string,
  options: Pick<EditorServerOptions, "hideTitle" | "hideThemeSwitcher">,
): string => {
  const attributes = [
    options.hideTitle ? " hide-title" : "",
    options.hideThemeSwitcher ? " hide-theme-switcher" : "",
  ].join("");
  return html.replace("<edaha-editor>", `<edaha-editor${attributes}>`);
};

/**
 * Read one of the editor page's built files, or undefined if there is no such file or the path leaves the folder.
 */
const clientFile = async (
  clientDir: string,
  path: string,
): Promise<Uint8Array<ArrayBuffer> | undefined> => {
  const parts = path.split("/");
  if (parts.some((part) => part === "" || part.startsWith(".")))
    return undefined;
  try {
    return (await readFile(
      join(clientDir, ...parts),
    )) as Uint8Array<ArrayBuffer>;
  } catch {
    return undefined;
  }
};

/**
 * Create the article editor's web app: the editor page at `/`, its files under `EDITOR_BASE`, and the editor API,
 * previews and the site's static files (see createEditorApp) everywhere else. Throws if the site's config file can't be
 * found or read.
 *
 * @example
 * const app = await createEditorServer({ siteDir: "my-site" });
 * await app.request("/"); // the editor page
 */
export const createEditorServer = async (
  options: EditorServerOptions,
): Promise<Hono> => (await editorServerParts(options)).app;

/** The editor's web app, and the article store it uses (which watches the articles folder until closed) */
const editorServerParts = async (
  options: EditorServerOptions,
): Promise<{ app: Hono; store: ArticleStore }> => {
  const port = editorPort(options);
  const clientDir = options.clientDir ?? CLIENT_DIR;
  const store = new ArticleStore(
    await loadSiteConfig(options),
    options.themeDir,
  );
  // Every article is read and checked as the editor starts
  await store.load();
  const previewOrigin = previewOriginOf(editorUrl(port));
  const editorApp = createEditorApp(store, {
    allowedOrigins: [editorUrl(port)],
    fetch: options.fetch,
    plugins: options.plugins,
    previewOrigin,
  });

  const app = new Hono();
  // The previews' own origin doesn't show the editor page or its files
  app.use("/", async (c, next) =>
    new URL(c.req.url).origin === previewOrigin
      ? c.json({ error: "Not found" }, 404)
      : next(),
  );
  app.use(`${EDITOR_BASE}*`, async (c, next) =>
    new URL(c.req.url).origin === previewOrigin
      ? c.json({ error: "Not found" }, 404)
      : next(),
  );
  app.get("/", async (c) => {
    const html = await clientFile(clientDir, "index.html");
    if (!html)
      return c.text(
        "The editor page is missing; build it with `pnpm build`",
        500,
      );
    return c.body(editorPage(new TextDecoder().decode(html), options), 200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
  });
  app.get(`${EDITOR_BASE}*`, async (c) => {
    const path = decodeURIComponent(c.req.path.slice(EDITOR_BASE.length));
    const contents = await clientFile(clientDir, path);
    if (!contents) return c.json({ error: "File not found" }, 404);
    return c.body(contents, 200, {
      "Content-Type": mime.lookup(path) || "application/octet-stream",
    });
  });
  app.route("/", editorApp);
  return { app, store };
};

/**
 * Start the article editor on this computer only (`EDITOR_HOST`). Never deploy it: it reads and writes the site's
 * files.
 *
 * @example
 * const editor = await startEditor({ siteDir: "my-site" });
 * console.log(`Open ${editor.url}`);
 * await editor.close();
 */
export const startEditor = async (
  options: EditorServerOptions,
): Promise<EditorServer> => {
  const port = editorPort(options);
  const { app, store } = await editorServerParts(options);
  return new Promise((resolve, reject) => {
    const server: ServerType = serve(
      { fetch: app.fetch, hostname: EDITOR_HOST, port },
      () =>
        resolve({
          url: editorUrl(port),
          close: () => {
            store.close();
            return new Promise((done, fail) =>
              server.close((error) => (error ? fail(error) : done())),
            );
          },
        }),
    );
    server.once("error", reject);
  });
};
