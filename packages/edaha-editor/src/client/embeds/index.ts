import { html, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { EmbedFrame, EmbedInfo } from "../../server/types/index.ts";

/** An embed block's kind (its plugin's key) and content */
export interface EmbedValue {
  /** The embed plugin's key, e.g. "youtube" (empty for an old block without one) */
  key: string;
  /** The block's content, e.g. a URL or a diagram's code */
  content: string;
}

/** What the rich text and Markdown editors need for embed blocks */
export interface EmbedTools {
  /** The site's embed plugins */
  embeds: readonly EmbedInfo[];
  /** Ask for an embed's kind and content (changing the given one): undefined if cancelled */
  edit(current?: EmbedValue): Promise<EmbedValue | undefined>;
  /** Render an embed block for its frame in the rich text body */
  loadFrame(value: EmbedValue): Promise<EmbedFrame>;
}

/**
 * An embed plugin's name, or a label for a key without a plugin.
 *
 * @example
 * embedName(embeds, "youtube"); // "YouTube video"
 * embedName(embeds, ""); // "Embed without a kind"
 */
export const embedName = (embeds: readonly EmbedInfo[], key: string): string =>
  embeds.find((embed) => embed.key === key)?.name ??
  (key ? `Unknown embed "${key}"` : "Embed without a kind");

/**
 * Render an embed plugin's icon, hidden from screen readers (its name is shown beside it), or nothing without one.
 * Icons come from the site's own plugins, so their markup is trusted.
 *
 * @example
 * html`${embedIcon(youtubeInfo)} YouTube video`
 */
export const embedIcon = (
  embed: EmbedInfo | undefined,
): TemplateResult | string =>
  embed?.icon
    ? html`<span class="icon embed-icon" aria-hidden="true"
        >${unsafeHTML(embed.icon)}</span
      >`
    : "";
