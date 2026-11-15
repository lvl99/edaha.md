// edaha.md's public API: build a site from Markdown articles, run the article editor, and add embed renderers
export {
  buildBlog,
  DEFAULT_SITE_URL,
  type BuildOptions,
  type BuildResult,
} from "./generator/build/index.ts";
export {
  parseConfig,
  type ArticleTypeConfig,
  type BlogConfig,
  type GenerateConfig,
} from "./generator/config/index.ts";
export { REQUIRED_TEMPLATES } from "./generator/templates/index.ts";
export type * from "./generator/types/index.ts";
export {
  EMBED_RENDERERS,
  type EmbedContext,
  type EmbedRenderer,
} from "./embeds/index.ts";
export { youtube } from "./embeds/youtube/index.ts";
export { bandcamp } from "./embeds/bandcamp/index.ts";
export {
  createEditorServer,
  EDITOR_HOST,
  EDITOR_PORT,
  startEditor,
  type EditorServer,
  type EditorServerOptions,
} from "./editor/index.ts";
export { runCli, type CliContext } from "./cli/index.ts";
export { THEME_DIR } from "./theme/index.ts";
