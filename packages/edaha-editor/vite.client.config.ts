// Builds the article editor for other apps' pages (src/client/index.ts, "@lvl99dotcom/edaha-editor/client") into
// dist/client-lib as an ES module. Its dependencies aren't bundled, so the app installs them once.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

/** The package's dependencies, which the app's own bundler finds */
const dependencies = Object.keys(
  (
    JSON.parse(
      readFileSync(resolve(import.meta.dirname, "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> }
  ).dependencies,
);

export default defineConfig({
  build: {
    outDir: resolve(import.meta.dirname, "dist/client-lib"),
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, "src/client/index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: (id) =>
        dependencies.some((name) => id === name || id.startsWith(`${name}/`)),
    },
  },
});
