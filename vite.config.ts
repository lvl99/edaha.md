// Builds the article editor's page (src/client) into dist/client, served under /_editor/ by `edaha editor`.
// `pnpm dev:editor` runs it with Vite for working on the editor, with the API for the site in EDAHA_SITE_DIR. Never
// deploy this.
import { resolve, sep } from "node:path";
import { getRequestListener } from "@hono/node-server";
import { defineConfig } from "vite";
import { EDITOR_BASE, EDITOR_HOST, EDITOR_PORT } from "./src/editor/index.ts";
import { loadSiteConfig } from "./src/generator/configFile/index.ts";
import { createEditorApp } from "./src/server/app/index.ts";
import { ArticleStore } from "./src/server/store/index.ts";

/** The folders of the API's code, which `pnpm dev:editor` restarts for when they change */
const BACKEND_FOLDERS = [
  "src/server",
  "src/generator",
  "src/embeds",
  "src/editor",
  "src/theme",
];

export default defineConfig({
  root: "src/client",
  base: EDITOR_BASE,
  build: {
    outDir: resolve(import.meta.dirname, "dist/client"),
    emptyOutDir: true,
    // A local tool loaded once from this computer, so one bundle (mostly the rich text editor) is fine
    chunkSizeWarningLimit: 1024,
  },
  server: {
    // Only reachable from this computer
    host: EDITOR_HOST,
    port: EDITOR_PORT,
    strictPort: true,
  },
  plugins: [
    {
      name: "edaha-editor-api",
      async configureServer(server) {
        const siteDir = process.env.EDAHA_SITE_DIR;
        if (!siteDir)
          throw new Error(
            "Set EDAHA_SITE_DIR to the folder with the site's config file, e.g. EDAHA_SITE_DIR=../my-site pnpm dev:editor",
          );
        const site = await loadSiteConfig({ siteDir: resolve(siteDir) });
        const app = createEditorApp(new ArticleStore(site), {
          allowedOrigins: [`http://${EDITOR_HOST}:${EDITOR_PORT}`],
        });
        const listener = getRequestListener(app.fetch);
        // The API's code is bundled into this config, so changes to it need a restart (the page reloads by itself)
        const backend = BACKEND_FOLDERS.map((folder) =>
          resolve(import.meta.dirname, folder),
        );
        server.watcher.add(backend);
        server.watcher.on("change", (file) => {
          if (
            backend.some((folder) => file.startsWith(folder + sep)) &&
            !file.includes(`${sep}tests${sep}`)
          )
            void server.restart();
        });
        server.middlewares.use((req, res, next) => {
          const url = req.url ?? "/";
          // Vite serves the editor page and its files; the API serves everything else
          if (url === "/" || url.startsWith(EDITOR_BASE)) next();
          else void listener(req, res);
        });
      },
    },
  ],
});
