// A small web server for a built website on this computer, used by `pnpm site:serve` and `pnpm site:dev`.
import { readFile, stat } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import mime from "mime-types";

/** The address the server listens on: this computer only */
export const SITE_HOST = "127.0.0.1";

/**
 * The port to listen on: PORT, or the given default.
 *
 * @example
 * sitePort(8449); // 8449, or PORT if it is set
 */
export const sitePort = (defaultPort: number): number =>
  Number(process.env.PORT ?? defaultPort);

/** The URL path pages listen on for reloads, in live reload mode */
const RELOAD_PATH = "/__edaha_reload";

/** Added to HTML pages in live reload mode: reloads the page when the server says the website was rebuilt */
const RELOAD_SCRIPT = `<script>new EventSource("${RELOAD_PATH}").addEventListener("reload", () => location.reload());</script>`;

/** Options for the site server */
export interface SiteServerOptions {
  /** The built website's folder (read on every request, so it can change) */
  root: () => string;
  /** The port to listen on when PORT isn't set */
  port: number;
  /** Reload open pages when `reload()` is called */
  liveReload?: boolean;
}

/** A running site server */
export interface SiteServer {
  /** The server's address */
  url: string;
  /** Tell open pages to reload (in live reload mode) */
  reload: () => void;
}

/** Whether a path is a file */
const isFile = (path: string) =>
  stat(path).then(
    (stats) => stats.isFile(),
    () => false,
  );

/**
 * The built file for a URL path, as the website's host would serve it: the file itself, a folder's index.html, or the
 * path with .html (list pages after the first, e.g. /news/2 is news/2.html). Undefined if there is none, or the path
 * leaves the folder.
 */
const findFile = async (
  root: string,
  urlPath: string,
): Promise<string | undefined> => {
  const path = resolve(root, `.${decodeURIComponent(urlPath)}`);
  if (path !== root && !path.startsWith(root + sep)) return undefined;
  for (const file of [path, resolve(path, "index.html"), `${path}.html`])
    if (await isFile(file)) return file;
  return undefined;
};

/** Answer with plain text */
const sendText = (response: ServerResponse, status: number, text: string) => {
  response.writeHead(status, { "Content-Type": "text/plain" });
  response.end(text);
};

/**
 * Serve a built website on this computer (SITE_HOST), at PORT or the given port. Rejects if the port is in use. In live reload mode, HTML pages reload when
 * `reload()` is called.
 *
 * @example
 * const server = await startSiteServer({ root: () => "build", port: 5181 });
 * console.log(server.url);
 */
export const startSiteServer = ({
  root,
  port: defaultPort,
  liveReload = false,
}: SiteServerOptions): Promise<SiteServer> => {
  const listeners = new Set<ServerResponse>();
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? "/", `http://${SITE_HOST}`);
    if (liveReload && pathname === RELOAD_PATH) {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
      });
      response.write(": connected\n\n");
      listeners.add(response);
      request.on("close", () => listeners.delete(response));
      return;
    }
    findFile(root(), pathname)
      .then(async (file) => {
        if (!file) return sendText(response, 404, `Not found: ${pathname}`);
        const type =
          mime.contentType(extname(file)) || "application/octet-stream";
        let body: string | Buffer = await readFile(file);
        if (liveReload && extname(file) === ".html")
          body = body
            .toString("utf8")
            .replace(/<\/body>|$/i, (end) => RELOAD_SCRIPT + end);
        response.writeHead(200, {
          "Content-Type": type,
          "Cache-Control": "no-store",
        });
        response.end(body);
      })
      .catch((error: unknown) => sendText(response, 500, String(error)));
  });
  const port = sitePort(defaultPort);
  return new Promise((done, fail) => {
    server.once("error", (error: NodeJS.ErrnoException) =>
      fail(
        error.code === "EADDRINUSE"
          ? new Error(
              `Port ${port} is already in use; stop what is using it, or set PORT to use another port`,
              { cause: error },
            )
          : error,
      ),
    );
    server.listen(port, SITE_HOST, () =>
      done({
        url: `http://${SITE_HOST}:${port}`,
        reload: () => {
          for (const listener of listeners)
            listener.write("event: reload\ndata: \n\n");
        },
      }),
    );
  });
};
