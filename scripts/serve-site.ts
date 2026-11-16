// Serves the edaha.md website built from site/ (site/build) on this computer, to look at it before publishing.
// Run with `pnpm site:serve` (after `pnpm site:build`). Set PORT to use another port than 5181.
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import mime from "mime-types";

const root = resolve(import.meta.dirname, "../site/build");
const host = "127.0.0.1";
const port = Number(process.env.PORT ?? 5181);

/** Whether a path is a file */
const isFile = (path: string) =>
  stat(path).then(
    (stats) => stats.isFile(),
    () => false,
  );

/**
 * The built file for a URL path, as the website's host would serve it: the file itself, a folder's index.html, or the
 * path with .html (list pages after the first, e.g. /news/2 is news/2.html). Undefined if there is none, or the path
 * leaves the build folder.
 */
const findFile = async (urlPath: string): Promise<string | undefined> => {
  const path = resolve(root, `.${decodeURIComponent(urlPath)}`);
  if (path !== root && !path.startsWith(root + sep)) return undefined;
  for (const file of [path, resolve(path, "index.html"), `${path}.html`])
    if (await isFile(file)) return file;
  return undefined;
};

if (!(await stat(root).catch(() => undefined))) {
  console.error(`${root} doesn't exist yet; build it with \`pnpm site:build\``);
  process.exit(1);
}

createServer((request, response) => {
  const { pathname } = new URL(request.url ?? "/", `http://${host}`);
  findFile(pathname)
    .then(async (file) => {
      if (!file) {
        response.writeHead(404, { "Content-Type": "text/plain" });
        response.end(`Not found: ${pathname}`);
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, {
        "Content-Type":
          mime.contentType(extname(file)) || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(body);
    })
    .catch((error: unknown) => {
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end(String(error));
    });
}).listen(port, host, () => {
  console.log(
    `Serving ${root} at http://${host}:${port} (press Ctrl+C to stop)`,
  );
});
