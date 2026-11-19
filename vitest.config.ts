import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "edaha",
    environment: "node",
    // Components import their style.css as text; without this, tests get empty files
    css: { include: /.+/ },
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      // bin.ts only runs the CLI with the process's arguments; everything it calls is tested via cli/index.ts
      exclude: ["**/tests/**", "**/*.d.ts", "packages/edaha/src/cli/bin.ts"],
    },
  },
});
