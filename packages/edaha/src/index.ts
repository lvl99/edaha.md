// edaha.md's public API: build a site from Markdown articles, run the `edaha` command, and write embed plugins. The
// article editor is in its own package, @lvl99dotcom/edaha-editor.
export {
  buildSite,
  DEFAULT_SITE_URL,
  type BuildOptions,
  type BuildResult,
} from "./generator/build/index.ts";
export {
  parseConfig,
  type ArticleTypeConfig,
  type EdahaConfig,
  type GenerateConfig,
} from "./generator/config/index.ts";
export {
  CONFIG_FILES,
  findConfigFile,
  loadSiteConfig,
  readConfigFile,
  type SiteConfig,
  type SiteConfigOptions,
} from "./generator/configFile/index.ts";
export { REQUIRED_TEMPLATES } from "./generator/templates/index.ts";
export type * from "./generator/types/index.ts";
export {
  EMBED_BLOCK,
  EmbedResolver,
  embedBlock,
  isEmbedPlugin,
  loadPlugins,
  type EmbedBuildRenderers,
  type EmbedContext,
  type EmbedEditorRenderers,
  type EmbedPageContext,
  type EmbedPageParts,
  type EmbedPlugin,
  type EmbedRenderContext,
  type EmbedSources,
} from "./embeds/index.ts";
export {
  EDITOR_PACKAGE,
  EDITOR_PORT,
  loadEditor,
  runCli,
  type CliContext,
  type EditorOptions,
  type RunningEditor,
  type StartEditor,
} from "./cli/index.ts";
export { THEME_DIR } from "./theme/index.ts";
