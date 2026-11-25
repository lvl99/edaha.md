import { html, LitElement, nothing } from "lit";
import { resolveFields } from "@lvl99dotcom/edaha.md/generator/fields";
import type { MetadataSchema } from "@lvl99dotcom/edaha.md/generator/metadata";
import type { EmbedInfo } from "../../../server/types/index.ts";
import {
  embedIcon,
  type EmbedValidator,
  type EmbedValue,
} from "../../embeds/index.ts";
import { icon } from "../../icons/index.ts";
import { setAt } from "../../metadataForm/index.ts";
import { defineElement } from "../define/index.ts";
import "../edaha-metadata-field/index.ts";
import type { MetadataChange } from "../edaha-metadata-field/index.ts";

/** What the content's hint says when the embed doesn't say what its content is */
export const DEFAULT_EMBED_INFO =
  "Provide the embed's content, e.g. a URL or code";

/** The path of the options' group of fields, so their IDs don't clash with the article's settings */
const OPTIONS_PATH = "embed-options";

/**
 * The embed dialog: asks for the content of an embed of one kind (e.g. a YouTube video's URL, or a diagram's code),
 * showing what the kind embeds, with its options' fields (if it has options) above the content. Its kind can't be
 * changed here: each kind has its own toolbar button. Option fields show their defaults and show or hide by their
 * conditions; the embed is saved with every shown option's value. With a validator, the content and options are
 * checked before they are saved, and any problems are shown under them. Rendered in the light DOM.
 *
 * @example
 * html`<edaha-embed-dialog></edaha-embed-dialog>`
 * const value = await dialog.edit(youtube, { key: "youtube", content: "", options: {} }, true);
 */
export class EdahaEmbedDialog extends LitElement {
  static override properties = {
    embed: { state: true },
    content: { state: true },
    options: { state: true },
    changing: { state: true },
    errors: { state: true },
    checking: { state: true },
  };

  /** The kind of embed whose content is asked for */
  declare embed: EmbedInfo | undefined;
  /** The embed's content */
  declare content: string;
  /** The embed's options as set (hidden options' values are kept until it is saved, and defaults aren't filled in) */
  declare options: Record<string, unknown>;
  /** Whether an existing embed is being changed (rather than a new one added) */
  declare changing: boolean;
  /** Why the content isn't valid, from the last check */
  declare errors: string[];
  /** Whether the content is being checked */
  declare checking: boolean;

  /** Resolves the open `edit` call */
  private editing: ((value: EmbedValue | undefined) => void) | undefined;
  /** Checks the content of the open `edit` call */
  private validator: EmbedValidator | undefined;

  constructor() {
    super();
    this.content = "";
    this.options = {};
    this.changing = false;
    this.errors = [];
    this.checking = false;
  }

  protected override createRenderRoot() {
    return this;
  }

  /** The dialog, once rendered */
  private get dialog(): HTMLDialogElement | null {
    return this.querySelector("dialog");
  }

  /** The content's text box, once rendered */
  private get textarea(): HTMLTextAreaElement | null {
    return this.querySelector("#embed-dialog-content");
  }

  /**
   * Open the dialog to add an embed of a kind (`adding`), or change an embed block's content and options. Resolves with
   * the embed, or undefined if the dialog is closed without saving.
   *
   * @param validate - gives why an embed's content or options aren't valid (none when they are), checked before it is
   * saved
   * @example
   * const value = await dialog.edit(youtube, block, false, ({ key, content, options }) => api.validateEmbed(key, content, options));
   */
  async edit(
    embed: EmbedInfo,
    { content, options }: EmbedValue,
    adding: boolean,
    validate?: EmbedValidator,
  ): Promise<EmbedValue | undefined> {
    this.finish(undefined);
    this.embed = embed;
    this.content = content;
    this.options = options;
    this.changing = !adding;
    this.validator = validate;
    this.errors = [];
    const result = new Promise<EmbedValue | undefined>(
      (resolve) => (this.editing = resolve),
    );
    await this.updateComplete;
    this.dialog?.showModal();
    this.textarea?.focus();
    return result;
  }

  /** Give the result to the open `edit` call, if there is one */
  private finish(value: EmbedValue | undefined): void {
    const editing = this.editing;
    this.editing = undefined;
    editing?.(value);
  }

  /** The options' values with their defaults and without hidden ones, and which are hidden (see resolveFields) */
  private resolvedOptions() {
    return resolveFields(this.embed?.options ?? {}, this.options);
  }

  /** Close the dialog without saving */
  close(): void {
    this.dialog?.close();
  }

  /** Save the content and options, if there is content (or it is optional) and they are valid; otherwise show why not */
  private async save(event: Event): Promise<void> {
    event.preventDefault();
    const content = this.content.trim();
    if (
      !this.embed ||
      (!content && !this.embed.contentOptional) ||
      this.checking
    )
      return;
    const value = {
      key: this.embed.key,
      content,
      options: this.resolvedOptions().values,
    };
    if (this.validator) {
      const options = this.options;
      this.checking = true;
      try {
        this.errors = await this.validator(value);
      } catch (error) {
        this.errors = [
          `The content couldn't be checked: ${(error as Error).message}`,
        ];
      }
      this.checking = false;
      // Changed while it was checked: it is checked again when saved again
      const changed =
        content !== this.content.trim() || options !== this.options;
      if (changed) this.errors = [];
      if (changed || this.errors.length) {
        this.textarea?.focus();
        return;
      }
    }
    this.finish(value);
    this.close();
  }

  /** Change an option (or a value inside one), from its field */
  private onOptionChange(event: CustomEvent<MetadataChange>): void {
    event.stopPropagation();
    // The fields' paths start with the options' group's
    const path = event.detail.path.split("/").slice(1);
    this.options = setAt(this.options, path, event.detail.value) as Record<
      string,
      unknown
    >;
    this.errors = [];
  }

  /** Render the embed's options' fields as a group, or nothing when it has none */
  private renderOptionFields() {
    const options = this.embed?.options ?? {};
    if (!Object.keys(options).length) return nothing;
    const { values, hidden } = this.resolvedOptions();
    const schema: MetadataSchema = {
      title: "Options",
      type: "object",
      properties: options,
    };
    return html`<edaha-metadata-field
      class="embed-dialog-options"
      path=${OPTIONS_PATH}
      .schema=${schema}
      .value=${values}
      .hiddenFields=${new Set([...hidden].map((path) => `${OPTIONS_PATH}.${path}`))}
      @metadata-change=${this.onOptionChange}
      @metadata-blur=${(event: Event) => event.stopPropagation()}
    ></edaha-metadata-field>`;
  }

  override render() {
    const { embed } = this;
    return html`<dialog
      class="article-browser embed-dialog"
      aria-labelledby="embed-dialog-title"
      @close=${() => this.finish(undefined)}
    >
      <form @submit=${this.save}>
        <div class="article-browser-header">
          <h2 id="embed-dialog-title">
            ${this.changing ? "Change" : "Add"} ${embed?.name ?? "embed"}
          </h2>
          <button
            type="button"
            class="btn btn-icon btn-close"
            title="Close"
            @click=${() => this.close()}
          >
            ${icon("close")}<span class="visually-hidden">Close</span>
          </button>
        </div>
        <div class="embed-dialog-body">
          <p class="embed-dialog-about">
            ${embedIcon(embed)} <span>${embed?.description ?? ""}</span>
          </p>
          <label for="embed-dialog-content">Content</label>
          <p id="embed-dialog-content-hint" class="embed-dialog-hint">
            ${embed?.info ?? DEFAULT_EMBED_INFO}
          </p>
          <textarea
            id="embed-dialog-content"
            rows="8"
            ?required=${!embed?.contentOptional}
            spellcheck="false"
            aria-describedby=${
              this.errors.length
                ? "embed-dialog-errors embed-dialog-content-hint"
                : "embed-dialog-content-hint"
            }
            aria-invalid=${this.errors.length ? "true" : "false"}
            .value=${this.content}
            @input=${(event: Event) => {
              this.content = (event.target as HTMLTextAreaElement).value;
              this.errors = [];
            }}
          ></textarea>
          <div
            id="embed-dialog-errors"
            class="embed-dialog-errors"
            role="alert"
          >
            ${
              this.errors.length
                ? html`<ul>
                    ${this.errors.map((error) => html`<li>${error}</li>`)}
                  </ul>`
                : ""
            }
          </div>
          ${this.renderOptionFields()}
        </div>
        <div class="dialog-actions embed-dialog-actions">
          <button
            type="submit"
            class="btn btn-save"
            aria-disabled=${this.checking ? "true" : "false"}
          >
            ${this.checking ? "Checking…" : this.changing ? "Save" : "Add"}
          </button>
          <button
            type="button"
            class="btn btn-cancel"
            @click=${() => this.close()}
          >
            Cancel
          </button>
        </div>
      </form>
    </dialog>`;
  }
}

defineElement("edaha-embed-dialog", EdahaEmbedDialog);
