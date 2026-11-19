/** What an embed's functions may use */
export interface EmbedContext {
  /** Fetches extra data, e.g. oEmbed JSON (replaceable for tests) */
  fetch: typeof fetch;
}

/** What an embed's `render` gets besides the content */
export interface EmbedRenderContext extends EmbedContext {
  /**
   * Things this render needs once per page, which the embed's `renderHead` and `renderFoot` get, e.g. diagram IDs to
   * start. Push to it while rendering.
   */
  renders: unknown[];
}

/** What an embed's `renderHead` and `renderFoot` get */
export interface EmbedPageContext extends EmbedContext {
  /** What every render of this embed on the page pushed to `renders`, in page order */
  renders: readonly unknown[];
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
  /** Optional; the web addresses its HTML loads from, which the editor's previews allow */
  sources?: EmbedSources | undefined;
  /** How it renders for the website */
  build: EmbedBuildRenderers;
  /** Optional; how it shows in the editor's rich text body instead (each one defaults to the website's) */
  editor?: EmbedEditorRenderers | undefined;
}

/** Which of an embed's renderers to use: the website's, or the editor's (which default to the website's) */
export type EmbedTarget = "build" | "editor";

/** The embeds used on a page: each embed's key, with what its renders pushed (see EmbedRenderContext) */
export type EmbedUsage = Map<string, unknown[]>;

/** HTML an embed adds to a page, for the `{% embedHead %}` and `{% embedFoot %}` template tags */
export interface EmbedPageParts {
  /** For the end of `<head>` */
  head: string;
  /** For the end of `<body>` */
  foot: string;
}
