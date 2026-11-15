// Builds the article editor's page (src/client) into dist/client, served under /_editor/ by `edaha editor`.
// `pnpm dev:editor` runs it with Vite for working on the editor, with the API for the site in EDAHA_SITE_DIR. Never
// deploy this.
import { resolve } from "node:path";
import { getRequestListener } from "@hono/node-server";
import { defineConfig } from "vite";
import { EDITOR_BASE, EDITOR_HOST, EDITOR_PORT } from "./src/editor/index.ts";
import { createEditorApp } from "./src/server/app/index.ts";
import { ArticleStore } from "./src/server/store/index.ts";

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
      configureServer(server) {
        const siteDir = process.env.EDAHA_SITE_DIR;
        if (!siteDir)
          throw new Error(
            "Set EDAHA_SITE_DIR to the site folder to edit, e.g. EDAHA_SITE_DIR=../my-site pnpm dev:editor",
          );
        const app = createEditorApp(new ArticleStore(resolve(siteDir)), {
          allowedOrigins: [`http://${EDITOR_HOST}:${EDITOR_PORT}`],
        });
        const listener = getRequestListener(app.fetch);
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
