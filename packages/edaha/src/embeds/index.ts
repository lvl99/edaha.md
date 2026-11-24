import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ErrorObject, ValidateFunction } from "ajv";
import { resolveFields } from "../generator/fields/index.ts";
import {
  escapeHtml,
  replaceOutsideCode,
  stripHtml,
} from "../generator/format/index.ts";
import {
  checkFieldSchema,
  createAjv,
  plainMessage,
  type MetadataSchema,
} from "../generator/metadata/index.ts";
import type { Logger } from "../generator/types/index.ts";
import {
  EMBED_BLOCK,
  splitEmbed,
  type EmbedOptionValues,
} from "./blocks/index.ts";
import type {
  EmbedContext,
  EmbedHeading,
  EmbedPageParts,
  EmbedPlugin,
  EmbedRenderers,
  EmbedSources,
  EmbedState,
  EmbedTarget,
} from "./types/index.ts";

export type * from "./types/index.ts";
export {
  EMBED_BLOCK,
  embedBlock,
  embedContent,
  embedOptionsOf,
  embedText,
  splitEmbed,
} from "./blocks/index.ts";

/**
 * Where `replaceBlocks` (or `place`) put an embed block, for `renderPage`: as written, or escaped by a template (e.g.
 * in a feed's descriptions). Group 1 is "<" or "&lt;", group 2 the block's ID.
 */
const EMBED_PLACEHOLDER = /(<|&lt;)!--edaha-embed:(\d+)--(?:>|&gt;)/g;

/**
 * Template data for the `{% embedHead %}` and `{% embedFoot %}` tags while a page is rendered: where `renderPage` puts
 * the HTML the page's embeds need, once it knows which embeds the page shows.
 */
export const EMBED_PAGE_PARTS: EmbedPageParts = {
  head: "<!--edaha-embeds-head-->",
  foot: "<!--edaha-embeds-foot-->",
};

/**
 * An embed's HTML for its placeholder in a page (see EMBED_PLACEHOLDER): escaped where the placeholder was (e.g. in a
 * feed's descriptions), written as JSON text in a JSON file (where it is inside a string, from the `json` filter), or
 * as it is.
 *
 * @param open - how the placeholder opened: "<", or "&lt;" when a template escaped it
 * @param extension - the extension of the file the page is, e.g. "html" or "json"
 * @example
 * encodeEmbed('<a href="/">', "<", "html"); // '<a href="/">'
 * encodeEmbed('<a href="/">', "&lt;", "xml"); // "&lt;a href=&quot;/&quot;&gt;"
 * encodeEmbed('<a href="/">', "<", "json"); // '<a href=\\"/\\">'
 */
export const encodeEmbed = (
  embed: string,
  open: string,
  extension: string,
): string =>
  open !== "<"
    ? escapeHtml(embed)
    : extension.toLowerCase() === "json"
      ? JSON.stringify(embed).slice(1, -1)
      : embed;

/** An HTML heading: group 1 is its level, group 2 its attributes, group 3 its content */
const HTML_HEADING = /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;

/**
 * The headings with IDs in HTML, e.g. an article's body, for embeds (see EmbedRenderContext.headings). Headings
 * without an ID can't be linked to, so they are left out.
 *
 * @example
 * htmlHeadings('<h2 id="fish-chips">Fish &amp; <em>chips</em></h2><h3>No ID</h3>');
 * // [{ level: 2, text: "Fish & chips", id: "fish-chips" }]
 */
export const htmlHeadings = (html: string): EmbedHeading[] =>
  [...html.matchAll(HTML_HEADING)].flatMap(([, level, attributes, content]) => {
    const id = /\bid="([^"]+)"/.exec(attributes as string)?.[1];
    return id
      ? [
          {
            level: Number(level),
            text: stripHtml((content as string).replace(/<[^>]*>/g, "")),
            id: stripHtml(id),
          },
        ]
      : [];
  });

/** Embed keys: lowercase kebab-case */
const EMBED_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The kinds of web addresses an embed can list in its `sources` */
export const EMBED_SOURCE_KINDS = [
  "frame",
  "script",
  "style",
  "font",
  "connect",
] as const satisfies readonly (keyof EmbedSources)[];

/** Whether a value is a list of `https://` origins */
const isOrigins = (value: unknown) =>
  value === undefined ||
  (Array.isArray(value) &&
    value.every(
      (source) =>
        typeof source === "string" && /^https:\/\/[^/\s;,'"]+$/.test(source),
    ));

/** Whether a value is an object of optional renderer functions (and an optional icon) */
const isRenderers = (value: unknown, renderRequired: boolean) => {
  if (!value || typeof value !== "object") return false;
  const { render, renderHead, renderFoot, icon } = value as Record<
    string,
    unknown
  >;
  return (
    (typeof render === "function" ||
      (!renderRequired && render === undefined)) &&
    [renderHead, renderFoot].every(
      (fn) => fn === undefined || typeof fn === "function",
    ) &&
    (icon === undefined || typeof icon === "string")
  );
};

/**
 * Whether a value is an embed plugin: a kebab-case `key`, a `name`, a `build.render` function, and valid optional
 * `description`, `info`, `contentOptional`, `sources`, `options` (a map), `validate` and `editor` renderers.
 *
 * @example
 * isEmbedPlugin({ key: "quote", name: "Quote", build: { render: async (text) => text } }); // true
 */
export const isEmbedPlugin = (value: unknown): value is EmbedPlugin => {
  if (!value || typeof value !== "object") return false;
  const {
    key,
    name,
    description,
    info,
    contentOptional,
    sources,
    options,
    validate,
    build,
    editor,
  } = value as Record<string, unknown>;
  return (
    typeof key === "string" &&
    EMBED_KEY.test(key) &&
    typeof name === "string" &&
    name.trim() !== "" &&
    [description, info].every(
      (text) => text === undefined || typeof text === "string",
    ) &&
    (contentOptional === undefined || typeof contentOptional === "boolean") &&
    (options === undefined ||
      (typeof options === "object" &&
        options !== null &&
        !Array.isArray(options))) &&
    (validate === undefined || typeof validate === "function") &&
    (sources === undefined ||
      (typeof sources === "object" &&
        sources !== null &&
        Object.entries(sources).every(
          ([kind, origins]) =>
            (EMBED_SOURCE_KINDS as readonly string[]).includes(kind) &&
            isOrigins(origins),
        ))) &&
    isRenderers(build, true) &&
    (editor === undefined || isRenderers(editor, false))
  );
};

/**
 * Check a list of embed plugins: each must be valid (see isEmbedPlugin), with a key of its own, and its options must be
 * fields like article metadata's (see EmbedPlugin.options). Throws describing the first problem.
 *
 * @example
 * checkEmbedPlugins([youtube, bandcamp]); // [youtube, bandcamp]
 */
export const checkEmbedPlugins = (plugins: unknown[]): EmbedPlugin[] => {
  const keys = new Set<string>();
  for (const plugin of plugins) {
    if (!isEmbedPlugin(plugin))
      throw new Error(
        `"plugins" must be embed plugins ({ key, name, description?, info?, contentOptional?, sources?, options?, validate?, build: { render, renderHead?, renderFoot? }, editor? }, with a lowercase kebab-case key and https origins), got ${JSON.stringify(plugin) ?? String(plugin)}`,
      );
    if (keys.has(plugin.key))
      throw new Error(
        `"plugins" has more than one embed with the key "${plugin.key}"`,
      );
    keys.add(plugin.key);
    for (const [name, schema] of Object.entries(plugin.options ?? {}))
      checkFieldSchema(schema, `${plugin.name} embed's options.${name}`);
    try {
      createAjv().compile({ type: "object", properties: plugin.options ?? {} });
    } catch (error) {
      throw new Error(
        `${plugin.name} embed's options aren't valid JSON Schemas: ${(error as Error).message}`,
        { cause: error },
      );
    }
  }
  return plugins as EmbedPlugin[];
};

/**
 * Load a config file's `plugins`: package names are imported from the config file's folder (their default export is
 * an embed plugin or a list of them); objects are used as they are. Throws naming a package that can't be loaded.
 *
 * @param fromDir - the folder package names are found from, i.e. the config file's
 * @example
 * await loadPlugins(["@lvl99dotcom/edaha-plugin-youtube"], "my-site"); // [youtube]
 */
export const loadPlugins = async (
  entries: unknown,
  fromDir: string,
): Promise<unknown[]> => {
  if (entries === undefined || entries === null) return [];
  if (!Array.isArray(entries))
    throw new Error(
      '"plugins" must be a list of embed plugin package names (or, in a JavaScript config file, embed plugins)',
    );
  const require = createRequire(join(fromDir, "package.json"));
  const plugins: unknown[] = [];
  for (const entry of entries) {
    if (typeof entry !== "string") {
      plugins.push(entry);
      continue;
    }
    try {
      const module = (await import(
        pathToFileURL(require.resolve(entry)).href
      )) as { default?: unknown };
      plugins.push(
        ...(Array.isArray(module.default) ? module.default : [module.default]),
      );
    } catch (error) {
      throw new Error(
        `plugin "${entry}" couldn't be loaded: ${(error as Error).message}`,
        { cause: error },
      );
    }
  }
  return plugins;
};

/** Options for resolving embeds */
export interface EmbedOptions extends EmbedContext {
  /** The embed plugins */
  plugins: readonly EmbedPlugin[];
  /** Where to report embeds that can't be rendered */
  logger: Logger;
}

/** An embed block put in a page's HTML by its placeholder (see EmbedResolver.place) */
interface PlacedEmbed {
  /** The block's key, or undefined for an old `<!-- embed -->` block */
  key: string | undefined;
  /** What is between its tags: its options and content (see splitEmbed) */
  text: string;
  /** Where it is, for warnings */
  source: string;
  /** The headings of the article it is in (see setHeadings) */
  headings?: readonly EmbedHeading[];
}

/** What each embed on a page keeps (see EmbedState), and its blocks' options, by its key */
type EmbedPage = Map<
  string,
  { state: EmbedState; options: EmbedOptionValues[] }
>;

/** The renderers to use for a target: the editor's fall back to the website's, one by one */
const renderersFor = (
  plugin: EmbedPlugin,
  target: EmbedTarget,
): EmbedRenderers =>
  target === "editor" ? { ...plugin.build, ...plugin.editor } : plugin.build;

/**
 * Renders embed blocks to HTML with embed plugins, page by page: each page's blocks share their embed's `state`, and
 * the page gets the HTML its embeds need once (`renderHead` and `renderFoot`).
 *
 * Put blocks in markdown with placeholders (`replaceBlocks`), render the markdown and the page's template (with
 * EMBED_PAGE_PARTS for the `{% embedHead %}` and `{% embedFoot %}` tags), then render the page's embeds
 * (`renderPage`).
 *
 * @example
 * const embeds = new EmbedResolver({ fetch, logger: console, plugins: [youtube] });
 * const body = renderMarkdown(embeds.replaceBlocks(source, "news/hello"));
 * const page = await embeds.renderPage(render("article.njk", { body, embeds: EMBED_PAGE_PARTS }), "/news/hello/");
 */
export class EmbedResolver {
  private readonly options: EmbedOptions;
  private readonly plugins: Map<string, EmbedPlugin>;
  /** Embed blocks put in pages, by their placeholders' IDs */
  private readonly placed: PlacedEmbed[] = [];
  /** Why blocks aren't valid, by their key, options and content (see validate) */
  private readonly checked = new Map<string, Promise<string[]>>();
  /** Each embed's options' validator, by its key */
  private readonly optionValidators = new Map<string, ValidateFunction>();
  /** Warnings given, so a block shown on several pages is warned about once */
  private readonly warned = new Set<string>();

  constructor(options: EmbedOptions) {
    this.options = options;
    this.plugins = new Map(
      options.plugins.map((plugin) => [plugin.key, plugin]),
    );
  }

  /**
   * Put an embed block in a page by a placeholder, which `renderPage` renders.
   *
   * @param key - the block's key, or undefined for an old `<!-- embed -->` block
   * @param text - what is between its tags: its options and content
   * @param source - where it is, for warnings
   * @example
   * embeds.place("youtube", "https://youtu.be/x", "Embed"); // "<!--edaha-embed:0-->"
   */
  place(key: string | undefined, text: string, source: string): string {
    this.placed.push({ key, text, source });
    return `<!--edaha-embed:${this.placed.length - 1}-->`;
  }

  /**
   * Replace every embed block in markdown with a placeholder (see place), as its own block. Blocks in code blocks and
   * inline code are left as they are. Embed HTML put straight into markdown would end at its first blank line, so the
   * blocks are rendered with the page they are shown on (see renderPage).
   *
   * @param source - where the markdown is from, for warnings
   * @example
   * embeds.replaceBlocks("Hi\n<!-- embed:youtube -->https://youtu.be/x<!-- /embed:youtube -->", "news/hello");
   * // "Hi\n\n\n<!--edaha-embed:0-->\n\n"
   */
  replaceBlocks(markdown: string, source: string): string {
    return replaceOutsideCode(
      markdown,
      EMBED_BLOCK,
      ([, key, text]) => `\n\n${this.place(key, text as string, source)}\n\n`,
    );
  }

  /**
   * Give the embed blocks placed in HTML (e.g. an article's rendered body and excerpt) their article's headings, which
   * their `render` gets (see EmbedRenderContext.headings).
   *
   * @example
   * const body = renderMarkdown(embeds.replaceBlocks(source, "news/hello"));
   * embeds.setHeadings(body, htmlHeadings(body));
   */
  setHeadings(html: string, headings: readonly EmbedHeading[]): void {
    for (const [, , id] of html.matchAll(EMBED_PLACEHOLDER)) {
      const block = this.placed[Number(id)];
      if (block) block.headings = headings;
    }
  }

  /**
   * Render a page's embeds: each placeholder of a block (see place) in order, sharing each embed's state on the page,
   * then the HTML the page's embeds need in place of EMBED_PAGE_PARTS' placeholders. A block whose key has no plugin,
   * or whose plugin fails, is shown as it is (a link for a URL, otherwise as text), and one that isn't valid is left
   * out, with a warning (once, however many pages show it). An escaped placeholder (e.g. in a feed) gets escaped HTML,
   * and one in a JSON file HTML written as JSON text (see encodeEmbed).
   *
   * @param source - which page it is, for warnings
   * @param target - render for the website (default) or the editor
   * @param extension - the extension of the file the page is, e.g. "json" (default: "html")
   * @example
   * await embeds.renderPage('<head><!--edaha-embeds-head--></head><body><!--edaha-embed:0--></body>', "/news/hello/");
   */
  async renderPage(
    html: string,
    source: string,
    target: EmbedTarget = "build",
    extension = "html",
  ): Promise<string> {
    const page: EmbedPage = new Map();
    const rendered: string[] = [];
    // One after another, so each embed's state is changed in page order
    for (const [placeholder, open, id] of html.matchAll(EMBED_PLACEHOLDER)) {
      const block = this.placed[Number(id)];
      const embed = block
        ? await this.renderBlock(block, page, target)
        : undefined;
      rendered.push(
        embed === undefined
          ? placeholder
          : encodeEmbed(embed, open as string, extension),
      );
    }
    let index = 0;
    const withEmbeds = html.replace(
      EMBED_PLACEHOLDER,
      () => rendered[index++] as string,
    );
    if (
      !withEmbeds.includes(EMBED_PAGE_PARTS.head) &&
      !withEmbeds.includes(EMBED_PAGE_PARTS.foot)
    )
      return withEmbeds;
    const { head, foot } = await this.pageParts(page, source, target);
    return withEmbeds
      .replaceAll(EMBED_PAGE_PARTS.head, () => head)
      .replaceAll(EMBED_PAGE_PARTS.foot, () => foot);
  }

  /**
   * Why a block isn't valid, or nothing when it is: its key has no plugin, its options aren't the embed's (see
   * EmbedPlugin.options), or the embed's `validate` says its content (or options) isn't valid. The options are checked
   * with their defaults and without hidden ones. Used by the editor to check blocks before they are saved.
   *
   * @example
   * await embeds.validate("youtube", "https://example.com/"); // ["https://example.com/ is not a YouTube URL"]
   * await embeds.validate("bandcamp", url, { layout: "huge" }); // ['Layout must be one of "slim", "artwork-only", "large"']
   */
  async validate(
    key: string | undefined,
    content: string,
    options: EmbedOptionValues = {},
  ): Promise<string[]> {
    const plugin = key ? this.plugins.get(key) : undefined;
    return plugin
      ? this.check(plugin, content, resolveOptions(plugin, options))
      : [capitalise(missingPlugin(key))];
  }

  /** Why a block with its options resolved isn't valid (see validate), checked once */
  private check(
    plugin: EmbedPlugin,
    content: string,
    options: EmbedOptionValues,
  ): Promise<string[]> {
    const id = `${plugin.key}\0${JSON.stringify(options)}\0${content}`;
    let checked = this.checked.get(id);
    if (!checked) {
      const problems = this.optionProblems(plugin, options);
      checked = problems.length
        ? Promise.resolve(problems)
        : validateContent(plugin, content, options);
      this.checked.set(id, checked);
    }
    return checked;
  }

  /** Why a block's options (resolved) aren't the embed's, in plain words, e.g. 'Layout must be one of "slim", "large"' */
  private optionProblems(
    plugin: EmbedPlugin,
    options: EmbedOptionValues,
  ): string[] {
    let validate = this.optionValidators.get(plugin.key);
    if (!validate) {
      validate = createAjv().compile({
        type: "object",
        properties: plugin.options ?? {},
        additionalProperties: false,
      });
      this.optionValidators.set(plugin.key, validate);
    }
    if (validate(options)) return [];
    // Options that aren't valid always have errors
    return (validate.errors as ErrorObject[]).map((error) => {
      const unknown = (error.params as { additionalProperty?: string })
        .additionalProperty;
      if (unknown) return `"${unknown}" isn't one of the embed's options`;
      const [name, ...path] = error.instancePath.slice(1).split("/");
      const schema = plugin.options?.[name as string] as MetadataSchema;
      const label =
        schema.$edahaField?.title ?? schema.title ?? (name as string);
      return `${[label, ...path].join(" ")} ${plainMessage(error)}`;
    });
  }

  /** Warn about a block or page, unless that warning was given before */
  private warn(message: string): void {
    if (this.warned.has(message)) return;
    this.warned.add(message);
    this.options.logger.warn(message);
  }

  /** Render a block on a page: its HTML, a fallback, or nothing when it is left out (see renderPage) */
  private async renderBlock(
    { key, text, source, headings = [] }: PlacedEmbed,
    page: EmbedPage,
    target: EmbedTarget,
  ): Promise<string> {
    const { content, options, optionsError } = splitEmbed(text);
    const fallback = () =>
      /^https?:\/\/\S+$/.test(content)
        ? `<p class="embed-link"><a href="${escapeHtml(content)}">${escapeHtml(content)}</a></p>`
        : `<pre class="embed-text">${escapeHtml(content)}</pre>`;
    const plugin = key ? this.plugins.get(key) : undefined;
    if (!plugin) {
      this.warn(`${source}: ${missingPlugin(key)}; shown as it is`);
      return fallback();
    }
    const resolved = resolveOptions(plugin, options);
    const errors = optionsError
      ? [optionsError]
      : await this.check(plugin, content, resolved);
    if (errors.length) {
      // Left out, so the website doesn't show something broken; the rest of the page is still built
      this.warn(
        `${source}: ${plugin.name} embed isn't valid (${errors.join("; ")}); left out`,
      );
      return "";
    }
    const used = page.get(plugin.key) ?? { state: {}, options: [] };
    try {
      // The build's render is required, so a target always has one
      const render = renderersFor(plugin, target)
        .render as EmbedPlugin["build"]["render"];
      const html = await render(content, {
        fetch: this.options.fetch,
        state: used.state,
        options: resolved,
        headings,
      });
      used.options.push(resolved);
      page.set(plugin.key, used);
      return `<div class="embed embed-${plugin.key}">${html}</div>`;
    } catch (error) {
      this.warn(
        `${source}: ${plugin.name} embed failed (${(error as Error).message}); shown as it is`,
      );
      return fallback();
    }
  }

  /**
   * The HTML a page needs for the embeds it shows: each shown embed's `renderHead` and `renderFoot`, once, in the
   * order of the plugins. One that fails is left out with a warning.
   */
  private async pageParts(
    page: EmbedPage,
    source: string,
    target: EmbedTarget,
  ): Promise<EmbedPageParts> {
    const part = async (name: "renderHead" | "renderFoot") => {
      const html: string[] = [];
      for (const [key, plugin] of this.plugins) {
        const used = page.get(key);
        const fn = renderersFor(plugin, target)[name];
        if (!used || !fn) continue;
        try {
          html.push(await fn({ fetch: this.options.fetch, ...used }));
        } catch (error) {
          this.warn(
            `${source}: ${plugin.name} embed's ${name} failed (${(error as Error).message}); left out`,
          );
        }
      }
      return html.join("\n");
    };
    return { head: await part("renderHead"), foot: await part("renderFoot") };
  }
}

/** A block's options with their defaults, and without hidden ones (see EmbedPlugin.options) */
const resolveOptions = (
  plugin: EmbedPlugin,
  options: EmbedOptionValues,
): EmbedOptionValues =>
  plugin.options ? resolveFields(plugin.options, options).values : options;

/**
 * A fetch that fetches each address once (requests without other settings only), giving each caller a copy of the
 * response, e.g. so pages that show the same embed don't fetch it again.
 *
 * @example
 * const fetchOnce = cachedFetch(fetch);
 * await fetchOnce("https://example.com/"); // fetched
 * await fetchOnce("https://example.com/"); // the same response, not fetched again
 */
export const cachedFetch = (fetcher: typeof fetch): typeof fetch => {
  const responses = new Map<string, Promise<Response>>();
  return async (input, init) => {
    const url =
      typeof input === "string" || input instanceof URL ? String(input) : "";
    if (!url || init) return fetcher(input, init);
    let response = responses.get(url);
    if (!response) {
      response = fetcher(url);
      responses.set(url, response);
      // A failed request is tried again next time
      response.catch(() => responses.delete(url));
    }
    return (await response).clone();
  };
};

/** Why a block's key has no plugin */
const missingPlugin = (key: string | undefined) =>
  // An empty key is an old block without one, as the editor sends it
  !key
    ? "embed blocks need a key, e.g. <!-- embed:youtube -->...<!-- /embed:youtube -->"
    : `no embed plugin with the key "${key}"`;

/** A message with its first letter in capitals */
const capitalise = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The messages of an error thrown by an embed's `validate`: each of an `AggregateError`'s errors, or the error's own.
 *
 * @example
 * validationErrors(new AggregateError([new Error("No ID"), new Error("Too long")])); // ["No ID", "Too long"]
 */
export const validationErrors = (error: unknown): string[] => {
  const errors =
    error instanceof AggregateError && error.errors.length
      ? error.errors
      : [error];
  return errors.map((e) => (e instanceof Error ? e.message : String(e)));
};

/** Why a block's content isn't valid for its plugin, or nothing when it is */
const validateContent = async (
  plugin: EmbedPlugin,
  content: string,
  options: EmbedOptionValues,
): Promise<string[]> => {
  try {
    return (await plugin.validate?.(content, options)) === false
      ? [`The content isn't a valid ${plugin.name}`]
      : [];
  } catch (error) {
    return validationErrors(error);
  }
};
