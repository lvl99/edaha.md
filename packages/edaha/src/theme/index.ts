import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * edaha.md's default theme folder (the `@lvl99dotcom/edaha-theme-default` package), which holds `templates/` and
 * `static/`. A site's own `templates/` and `static/` override its files one by one.
 *
 * @example
 * join(THEME_DIR, "templates"); // ".../node_modules/@lvl99dotcom/edaha-theme-default/templates"
 */
export const THEME_DIR = dirname(
  fileURLToPath(
    import.meta.resolve("@lvl99dotcom/edaha-theme-default/package.json"),
  ),
);
