// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import lit from "eslint-plugin-lit";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    // build/ is the website built from site/ (generated)
    ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**", "build/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["packages/edaha-editor/src/client/**/*.ts"],
    ...lit.configs["flat/recommended"],
    languageOptions: { globals: globals.browser },
  },
  {
    // Scripts the website's pages load in the browser
    files: ["site/static/**/*.js", "packages/*/theme/static/**/*.js"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [
      "packages/*/src/**/*.ts",
      "packages/*/scripts/**/*.ts",
      "packages/*/*.config.ts",
      "scripts/**/*.ts",
      "*.config.{js,ts}",
    ],
    languageOptions: { globals: globals.node },
  },
  {
    // Tests may assert values exist and use minimal stub classes
    files: ["**/tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
  prettier,
);
