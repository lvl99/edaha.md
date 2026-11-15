/** What embed renderers may use while rendering */
export interface EmbedContext {
  /** Fetches extra data, e.g. oEmbed JSON (replaceable for tests) */
  fetch: typeof fetch;
}

/** Turns a URL into embed HTML */
export interface EmbedRenderer {
  /** Name shown in warnings */
  name: string;
  /** Whether this renderer handles the URL */
  match(url: URL): boolean;
  /** Render the embed's HTML. Throws if the URL can't be embedded. */
  render(url: URL, context: EmbedContext): Promise<string>;
}
