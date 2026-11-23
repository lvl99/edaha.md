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
  changeConfigText,
  CONFIG_FILES,
  findConfigFile,
  loadSiteConfig,
  readConfigFile,
  updateConfigFile,
  type ConfigChanges,
  type SiteConfig,
  type SiteConfigOptions,
} from "./generator/configFile/index.ts";
export {
  CONFIG_FORM_SCHEMA,
  configFormChanges,
  configFormProblems,
} from "./generator/configSchema/index.ts";
export {
  REQUIRED_TEMPLATES,
  templateFileName,
  type TemplateOutput,
} from "./generator/templates/index.ts";
export type * from "./generator/types/index.ts";
export {
  EMBED_BLOCK,
  EmbedResolver,
  embedBlock,
  isEmbedPlugin,
  loadPlugins,
  validationErrors,
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
export {
  isThemePath,
  packageAuthor,
  parseThemeInfo,
  readThemeInfo,
  resolveTheme,
  THEME_DIR,
  THEME_FILE,
  type ThemeInfo,
} from "./theme/index.ts";
