import { escapeHtml } from "../generator/format/index.ts";
import type { Logger } from "../generator/types/index.ts";
import { bandcamp } from "./bandcamp/index.ts";
import type { EmbedContext, EmbedRenderer } from "./types/index.ts";
import { youtube } from "./youtube/index.ts";

export type { EmbedContext, EmbedRenderer } from "./types/index.ts";

/** All embed renderers, tried in order */
export const EMBED_RENDERERS: readonly EmbedRenderer[] = [youtube, bandcamp];

/** `<!-- embed -->URL<!-- /embed -->` blocks in article markdown */
export const EMBED_BLOCK = /<!--\s*embed\s*-->([\s\S]*?)<!--\s*\/embed\s*-->/g;

/** Options for resolving embeds */
export interface EmbedOptions extends EmbedContext {
  /** Renderers to try (defaults to all) */
  renderers?: readonly EmbedRenderer[];
  /** Where to report embeds that can't be rendered */
  logger: Logger;
}

/**
 * Renders embed URLs to HTML, rendering each URL only once.
 *
 * @example
 * const embeds = new EmbedResolver({ fetch, logger: console });
 * const markdown = await embeds.replaceBlocks(source, "article/hello");
 */
export class EmbedResolver {
  private readonly options: EmbedOptions;
  private readonly cache = new Map<string, Promise<string>>();

  constructor(options: EmbedOptions) {
    this.options = options;
  }

  /**
   * Render one URL to embed HTML wrapped in `<div class="embed">`. If no renderer matches, or it fails,
   * warn and render a plain link instead.
   *
   * @param source - where the embed is, for warnings
   */
  render(rawUrl: string, source: string): Promise<string> {
    const cached = this.cache.get(rawUrl);
    if (cached) return cached;
    const result = this.renderUncached(rawUrl, source);
    this.cache.set(rawUrl, result);
    return result;
  }

  /**
   * Replace every `<!-- embed -->URL<!-- /embed -->` block in markdown with its rendered HTML, as its own block.
   *
   * @param source - where the markdown is from, for warnings
   */
  async replaceBlocks(markdown: string, source: string): Promise<string> {
    const urls = [...markdown.matchAll(EMBED_BLOCK)].map(([, url]) =>
      (url as string).trim(),
    );
    const html = await Promise.all(urls.map((url) => this.render(url, source)));
    let index = 0;
    return markdown.replace(
      EMBED_BLOCK,
      () => `\n\n${html[index++] as string}\n\n`,
    );
  }

  private async renderUncached(rawUrl: string, source: string) {
    const { renderers = EMBED_RENDERERS, logger } = this.options;
    const fallback = () =>
      `<p class="embed-link"><a href="${escapeHtml(rawUrl)}">${escapeHtml(rawUrl)}</a></p>`;
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      logger.warn(`${source}: embed "${rawUrl}" is not a valid URL`);
      return fallback();
    }
    const renderer = renderers.find((r) => r.match(url));
    if (!renderer) {
      logger.warn(
        `${source}: no embed renderer for ${rawUrl}; rendered as a link`,
      );
      return fallback();
    }
    try {
      const html = await renderer.render(url, this.options);
      return `<div class="embed embed-${renderer.name.toLowerCase()}">${html}</div>`;
    } catch (error) {
      logger.warn(
        `${source}: ${renderer.name} embed failed for ${rawUrl} (${(error as Error).message}); rendered as a link`,
      );
      return fallback();
    }
  }
}
