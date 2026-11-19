import { fileURLToPath } from "node:url";

/**
 * edaha.md's default theme folder, which holds `templates/` and `static/`. A site's own `templates/` and `static/`
 * override its files one by one. The path is the same from `src/` and from the published `dist/`.
 *
 * @example
 * join(THEME_DIR, "templates"); // ".../node_modules/@lvl99dotcom/edaha.md/theme/templates"
 */
export const THEME_DIR = fileURLToPath(new URL("../../theme", import.meta.url));
