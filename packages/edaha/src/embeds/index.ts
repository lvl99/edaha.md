import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { escapeHtml, replaceOutsideCode } from "../generator/format/index.ts";
import { EMBED_BLOCK, embedContent } from "./blocks/index.ts";
import type { Logger } from "../generator/types/index.ts";
import type {
  EmbedContext,
  EmbedPageParts,
  EmbedPlugin,
  EmbedRenderers,
  EmbedSources,
  EmbedTarget,
  EmbedUsage,
} from "./types/index.ts";

export type * from "./types/index.ts";
export { EMBED_BLOCK, embedBlock, embedContent } from "./blocks/index.ts";

/** Where `replaceBlocks` put an embed's HTML, for `restore` */
const EMBED_PLACEHOLDER = /<!--edaha-embed:(\d+)-->/g;

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
 * `description`, `sources` and `editor` renderers.
 *
 * @example
 * isEmbedPlugin({ key: "quote", name: "Quote", build: { render: async (text) => text } }); // true
 */
export const isEmbedPlugin = (value: unknown): value is EmbedPlugin => {
  if (!value || typeof value !== "object") return false;
  const { key, name, description, sources, validate, build, editor } =
    value as Record<string, unknown>;
  return (
    typeof key === "string" &&
    EMBED_KEY.test(key) &&
    typeof name === "string" &&
    name.trim() !== "" &&
    (description === undefined || typeof description === "string") &&
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
 * Check a list of embed plugins: each must be valid (see isEmbedPlugin), with a key of its own. Throws describing the
 * first problem.
 *
 * @example
 * checkEmbedPlugins([youtube, bandcamp]); // [youtube, bandcamp]
 */
export const checkEmbedPlugins = (plugins: unknown[]): EmbedPlugin[] => {
  const keys = new Set<string>();
  for (const plugin of plugins) {
    if (!isEmbedPlugin(plugin))
      throw new Error(
        `"plugins" must be embed plugins ({ key, name, description?, sources?, validate?, build: { render, renderHead?, renderFoot? }, editor? }, with a lowercase kebab-case key and https origins), got ${JSON.stringify(plugin) ?? String(plugin)}`,
      );
    if (keys.has(plugin.key))
      throw new Error(
        `"plugins" has more than one embed with the key "${plugin.key}"`,
      );
    keys.add(plugin.key);
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

/** A rendered embed block, and what it needs once per page */
export interface RenderedEmbed {
  /** The embed's HTML, wrapped in `<div class="embed embed-<key>">` (or a plain fallback) */
  html: string;
  /** The embed's key and what its render pushed to `renders`, unless it fell back */
  usage?: { key: string; renders: unknown[] } | undefined;
}

/** The renderers to use for a target: the editor's fall back to the website's, one by one */
const renderersFor = (
  plugin: EmbedPlugin,
  target: EmbedTarget,
): EmbedRenderers =>
  target === "editor" ? { ...plugin.build, ...plugin.editor } : plugin.build;

/**
 * Renders embed blocks to HTML with embed plugins, rendering each block's content once, and the HTML each page that
 * uses them needs once (see pageParts).
 *
 * @example
 * const embeds = new EmbedResolver({ fetch, logger: console, plugins: [youtube] });
 * const usage: EmbedUsage = new Map();
 * const markdown = await embeds.replaceBlocks(source, "article/hello", usage);
 * const { head, foot } = await embeds.pageParts([usage]);
 */
export class EmbedResolver {
  private readonly options: EmbedOptions;
  private readonly plugins: Map<string, EmbedPlugin>;
  private readonly cache = new Map<string, Promise<RenderedEmbed>>();
  /** Rendered embeds' HTML, by their placeholders' IDs (see replaceBlocks) */
  private readonly placed = new Map<number, string>();

  constructor(options: EmbedOptions) {
    this.options = options;
    this.plugins = new Map(
      options.plugins.map((plugin) => [plugin.key, plugin]),
    );
  }

  /**
   * Render one embed block's content. If its key has no plugin, or the plugin fails, warn and render a fallback
   * instead: a link for a URL, otherwise the content as text.
   *
   * @param key - the block's key, or undefined for an old `<!-- embed -->` block
   * @param source - where the embed is, for warnings
   * @param target - render for the website (default) or the editor
   */
  render(
    key: string | undefined,
    content: string,
    source: string,
    target: EmbedTarget = "build",
  ): Promise<RenderedEmbed> {
    const id = `${target}\0${key ?? ""}\0${content}`;
    const cached = this.cache.get(id);
    if (cached) return cached;
    const result = this.renderUncached(key, content, source, target);
    this.cache.set(id, result);
    return result;
  }

  /**
   * Replace every embed block in markdown with a placeholder for its rendered HTML, as its own block, recording the
   * embeds used in `usage`. Blocks in code blocks and inline code are left as they are. Render the markdown, then put
   * the HTML in its place with `restore` (embed HTML put straight into markdown would end at its first blank line).
   *
   * @param source - where the markdown is from, for warnings
   * @example
   * const html = embeds.restore(renderMarkdown(markdown, await embeds.replaceBlocks(source, "news/hello"), "/news/hello/"));
   */
  async replaceBlocks(
    markdown: string,
    source: string,
    usage: EmbedUsage = new Map(),
    target: EmbedTarget = "build",
  ): Promise<string> {
    const blocks: { key: string | undefined; content: string }[] = [];
    replaceOutsideCode(markdown, EMBED_BLOCK, ([, key, content]) => {
      blocks.push({ key, content: embedContent(content as string) });
      return "";
    });
    const rendered = await Promise.all(
      blocks.map(({ key, content }) =>
        this.render(key, content, source, target),
      ),
    );
    for (const { usage: used } of rendered) addUsage(usage, used);
    let index = 0;
    return replaceOutsideCode(markdown, EMBED_BLOCK, () => {
      const id = this.placed.size;
      this.placed.set(id, (rendered[index++] as RenderedEmbed).html);
      return `\n\n<!--edaha-embed:${id}-->\n\n`;
    });
  }

  /**
   * Put rendered embeds' HTML in place of their placeholders in HTML rendered from `replaceBlocks`' markdown.
   *
   * @example
   * embeds.restore("<p>Intro</p>\n<!--edaha-embed:0-->\n"); // '<p>Intro</p>\n<div class="embed embed-youtube">...</div>\n'
   */
  restore(html: string): string {
    return html.replace(
      EMBED_PLACEHOLDER,
      (placeholder, id: string) => this.placed.get(Number(id)) ?? placeholder,
    );
  }

  /**
   * The HTML a page needs for the embeds it uses: each used embed's `renderHead` and `renderFoot`, once, in the order
   * of the plugins. One that fails is left out with a warning.
   *
   * @param usages - the embeds used by each part of the page (e.g. an article's body, or the excerpts on a list page)
   * @param source - which page it is, for warnings
   */
  async pageParts(
    usages: readonly EmbedUsage[],
    source: string,
    target: EmbedTarget = "build",
  ): Promise<EmbedPageParts> {
    const used: EmbedUsage = new Map();
    for (const usage of usages)
      for (const [key, renders] of usage) addUsage(used, { key, renders });
    const part = async (name: "renderHead" | "renderFoot") => {
      const html: string[] = [];
      for (const [key, plugin] of this.plugins) {
        const renderers = renderersFor(plugin, target);
        const renders = used.get(key);
        const fn = renderers[name];
        if (!renders || !fn) continue;
        try {
          html.push(await fn({ fetch: this.options.fetch, renders }));
        } catch (error) {
          this.options.logger.warn(
            `${source}: ${plugin.name} embed's ${name} failed (${(error as Error).message}); left out`,
          );
        }
      }
      return html.join("\n");
    };
    return { head: await part("renderHead"), foot: await part("renderFoot") };
  }

  /**
   * Why a block's content isn't valid (see EmbedPlugin.validate), or nothing when it is: also when its key has no
   * plugin. Used by the editor to check content before it is saved.
   *
   * @example
   * await embeds.validate("youtube", "https://example.com/"); // ["https://example.com/ is not a YouTube URL"]
   */
  async validate(key: string | undefined, content: string): Promise<string[]> {
    const plugin = key === undefined ? undefined : this.plugins.get(key);
    return plugin
      ? validateContent(plugin, content)
      : [capitalise(missingPlugin(key))];
  }

  private async renderUncached(
    key: string | undefined,
    content: string,
    source: string,
    target: EmbedTarget,
  ): Promise<RenderedEmbed> {
    const { logger } = this.options;
    const fallback = () => ({
      html: /^https?:\/\/\S+$/.test(content)
        ? `<p class="embed-link"><a href="${escapeHtml(content)}">${escapeHtml(content)}</a></p>`
        : `<pre class="embed-text">${escapeHtml(content)}</pre>`,
    });
    const plugin = key === undefined ? undefined : this.plugins.get(key);
    if (!plugin) {
      logger.warn(`${source}: ${missingPlugin(key)}; shown as it is`);
      return fallback();
    }
    const errors = await validateContent(plugin, content);
    if (errors.length) {
      // Left out, so the website doesn't show something broken; the rest of the page is still built
      logger.warn(
        `${source}: ${plugin.name} embed isn't valid (${errors.join("; ")}); left out`,
      );
      return { html: "" };
    }
    const renders: unknown[] = [];
    try {
      // The build's render is required, so a target always has one
      const render = renderersFor(plugin, target)
        .render as EmbedPlugin["build"]["render"];
      const html = await render(content, {
        fetch: this.options.fetch,
        renders,
      });
      return {
        html: `<div class="embed embed-${plugin.key}">${html}</div>`,
        usage: { key: plugin.key, renders },
      };
    } catch (error) {
      logger.warn(
        `${source}: ${plugin.name} embed failed (${(error as Error).message}); shown as it is`,
      );
      return fallback();
    }
  }
}

/** Why a block's key has no plugin */
const missingPlugin = (key: string | undefined) =>
  key === undefined
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
): Promise<string[]> => {
  try {
    return (await plugin.validate?.(content)) === false
      ? [`The content isn't a valid ${plugin.name}`]
      : [];
  } catch (error) {
    return validationErrors(error);
  }
};

/** Add an embed's renders to a page's usage */
const addUsage = (usage: EmbedUsage, used: RenderedEmbed["usage"]): void => {
  if (!used) return;
  const renders = usage.get(used.key) ?? [];
  renders.push(...used.renders);
  usage.set(used.key, renders);
};
