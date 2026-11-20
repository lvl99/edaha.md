import { html, type TemplateResult } from "lit";
import { icon } from "../icons/index.ts";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { EmbedFrame, EmbedInfo } from "../../server/types/index.ts";

/** An embed block's kind (its plugin's key) and content */
export interface EmbedValue {
  /** The embed plugin's key, e.g. "youtube" (empty for an old block without one) */
  key: string;
  /** The block's content, e.g. a URL or a diagram's code */
  content: string;
}

/** Gives why an embed's content isn't valid for its kind (none when it is) */
export type EmbedValidator = (value: EmbedValue) => Promise<string[]>;

/** What the rich text and Markdown editors need for embed blocks */
export interface EmbedTools {
  /** The site's embed plugins */
  embeds: readonly EmbedInfo[];
  /**
   * Ask for an embed's content in the embed dialog, checking it is valid: for a new embed of a kind (`adding`, with
   * empty content), or a block to change. Its kind stays the same. Undefined if cancelled, or if the site has no
   * plugin for its kind.
   */
  edit(value: EmbedValue, adding: boolean): Promise<EmbedValue | undefined>;
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

/** What an embed's toolbar button does */
export interface EmbedButtonOptions {
  /** Whether a block of its kind is selected */
  pressed: boolean;
  disabled: boolean;
  /** Add an embed of its kind, or change the selected one */
  onClick: () => void;
}

/**
 * A toolbar button for adding an embed of a kind: its icon (or a general one), named by the embed's name for screen
 * readers and tooltips.
 *
 * @example
 * html`${embeds.map((embed) => embedButton(embed, { pressed: false, disabled: false, onClick: () => add(embed.key) }))}`
 */
export const embedButton = (
  embed: EmbedInfo,
  { pressed, disabled, onClick }: EmbedButtonOptions,
): TemplateResult =>
  html`<button
    type="button"
    class="toolbar-button toolbar-embed"
    data-embed=${embed.key}
    title=${embed.name}
    aria-pressed=${String(pressed)}
    ?disabled=${disabled}
    @click=${onClick}
  >
    ${embed.icon ? embedIcon(embed) : icon("smart_display")}<span
      class="visually-hidden"
      >${embed.name}</span
    >
  </button>`;
