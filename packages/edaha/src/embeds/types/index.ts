import type { EmbedOptionValues } from "../blocks/index.ts";
import type { MetadataDefinitions } from "../../generator/metadata/index.ts";

export type { EmbedOptionValues } from "../blocks/index.ts";

/** An embed's options' schemas, by the name each is saved under (see EmbedPlugin.options) */
export type EmbedOptionSchemas = MetadataDefinitions;

/** What an embed's functions may use */
export interface EmbedContext {
  /** Fetches extra data, e.g. oEmbed JSON (replaceable for tests) */
  fetch: typeof fetch;
}

/**
 * Things an embed keeps for one page while it renders, which every render of it on the page and its `renderHead` and
 * `renderFoot` share, e.g. the IDs of the diagrams to start. Each page starts with an empty one for each embed.
 */
export type EmbedState = Record<string, unknown>;

/** What an embed's `render` gets besides the content */
export interface EmbedRenderContext extends EmbedContext {
  /** What the embed keeps for this page (see EmbedState): change it while rendering */
  state: EmbedState;
  /** The block's options, with their defaults and without hidden ones (see EmbedPlugin.options) */
  options: EmbedOptionValues;
}

/** What an embed's `renderHead` and `renderFoot` get */
export interface EmbedPageContext extends EmbedContext {
  /** What the embed kept for this page (see EmbedState), after every render of it */
  state: EmbedState;
  /** The options of each of the embed's blocks on the page, in page order */
  options: readonly EmbedOptionValues[];
}

/** How an embed renders for the website, or for the editor */
export interface EmbedRenderers {
  /** Render one embed block's content (the text between its tags) to HTML. Throws if it can't be embedded. */
  render?(content: string, context: EmbedRenderContext): Promise<string>;
  /** Optional; HTML for the page's `<head>` (e.g. stylesheets), once per page that has this embed */
  renderHead?(context: EmbedPageContext): Promise<string>;
  /** Optional; HTML for the end of the page's `<body>` (e.g. scripts), once per page that has this embed */
  renderFoot?(context: EmbedPageContext): Promise<string>;
}

/** How an embed renders for the website: `render` is required */
export interface EmbedBuildRenderers extends EmbedRenderers {
  render(content: string, context: EmbedRenderContext): Promise<string>;
}

/** How an embed shows in the editor's rich text body, where each of these replaces the website's own */
export interface EmbedEditorRenderers extends EmbedRenderers {
  /** An SVG icon (markup) for the embed in the editor's lists, sized by the editor */
  icon?: string | undefined;
}

/**
 * The web addresses an embed's HTML loads from, by kind (each an `https://` origin, e.g. "https://cdn.example.com"),
 * which the editor's preview pages allow. Its own scripts and styles inside the HTML are always allowed there.
 */
export interface EmbedSources {
  /** Frames, e.g. a video player */
  frame?: readonly string[] | undefined;
  /** Scripts */
  script?: readonly string[] | undefined;
  /** Stylesheets */
  style?: readonly string[] | undefined;
  /** Fonts */
  font?: readonly string[] | undefined;
  /** Requests made by its scripts */
  connect?: readonly string[] | undefined;
}

/**
 * An embed plugin: turns the content of `<!-- embed:<key> -->...<!-- /embed:<key> -->` blocks into HTML.
 *
 * @example
 * const quote: EmbedPlugin = {
 *   key: "quote",
 *   name: "Quote",
 *   build: { render: async (content) => `<blockquote>${content}</blockquote>` },
 * };
 */
export interface EmbedPlugin {
  /** Which blocks it renders, e.g. "youtube" for `<!-- embed:youtube -->`: lowercase kebab-case */
  key: string;
  /** Its name, shown in the editor and in warnings, e.g. "YouTube video" */
  name: string;
  /** Optional; what it embeds, shown in the editor, e.g. "Paste a YouTube video's URL" */
  description?: string | undefined;
  /**
   * Optional; shown under the content's label in the embed dialog, e.g. "Paste the album's or track's URL". Without
   * it, the dialog says "Provide the embed's content, e.g. a URL or code".
   */
  info?: string | undefined;
  /** Optional; the web addresses its HTML loads from, which the editor's previews allow */
  sources?: EmbedSources | undefined;
  /**
   * Optional; options that change how a block shows, by the name they are saved under: JSON Schemas with
   * `$edahaField`, like article metadata fields (including `defaultValue`, `showWhen` and `hideWhen`). The embed dialog
   * shows them above the content, and blocks save them in YAML before their content:
   * `<!-- embed:bandcamp -->\n<!--yaml\nlayout: large\n-->\nhttps://...\n<!-- /embed:bandcamp -->`. A block's options
   * are checked against them, and one with options that aren't valid is left out, like one with content that isn't.
   */
  options?: EmbedOptionSchemas | undefined;
  /**
   * Optional; check a block's content (and options) before it is rendered, for the website and the editor. Return
   * `true` when it is valid. Throw an error saying what is wrong (or an `AggregateError` with one error for each
   * problem), or return `false` for a general message. A block whose content isn't valid is left out of the website,
   * with a warning (the rest of its page is still built), and the editor shows the errors on it and in its embed
   * dialog.
   */
  validate?:
    | ((
        content: string,
        options: EmbedOptionValues,
      ) => boolean | undefined | Promise<boolean | undefined>)
    | undefined;
  /** How it renders for the website */
  build: EmbedBuildRenderers;
  /** Optional; how it shows in the editor's rich text body instead (each one defaults to the website's) */
  editor?: EmbedEditorRenderers | undefined;
}

/** Which of an embed's renderers to use: the website's, or the editor's (which default to the website's) */
export type EmbedTarget = "build" | "editor";

/** HTML an embed adds to a page, for the `{% embedHead %}` and `{% embedFoot %}` template tags */
export interface EmbedPageParts {
  /** For the end of `<head>` */
  head: string;
  /** For the end of `<body>` */
  foot: string;
}
