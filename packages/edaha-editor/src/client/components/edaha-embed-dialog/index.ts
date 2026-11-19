import { html, LitElement } from "lit";
import type { EmbedInfo } from "../../../server/types/index.ts";
import { embedIcon, type EmbedValue } from "../../embeds/index.ts";
import { icon } from "../../icons/index.ts";
import { defineElement } from "../define/index.ts";

/**
 * The embed dialog: asks for an embed block's kind (one of the site's embed plugins, with its description) and its
 * content (e.g. a video's URL, or a diagram's code). Rendered in the light DOM.
 *
 * @example
 * html`<edaha-embed-dialog></edaha-embed-dialog>`
 * const embed = await dialog.edit(embeds, { key: "youtube", content: "https://youtu.be/aju_UB5VIf8" });
 */
export class EdahaEmbedDialog extends LitElement {
  static override properties = {
    embeds: { state: true },
    key: { state: true },
    content: { state: true },
    changing: { state: true },
  };

  /** The site's embed plugins */
  declare embeds: readonly EmbedInfo[];
  /** The chosen kind of embed */
  declare key: string;
  /** The embed's content */
  declare content: string;
  /** Whether an existing embed is being changed (rather than a new one added) */
  declare changing: boolean;

  /** Resolves the open `edit` call */
  private editing: ((value: EmbedValue | undefined) => void) | undefined;

  constructor() {
    super();
    this.embeds = [];
    this.key = "";
    this.content = "";
    this.changing = false;
  }

  protected override createRenderRoot() {
    return this;
  }

  /** The dialog, once rendered */
  private get dialog(): HTMLDialogElement | null {
    return this.querySelector("dialog");
  }

  /**
   * Open the dialog to add an embed, or change the given one. Resolves with the chosen kind and content, or undefined
   * if the dialog is closed without saving.
   *
   * @example
   * const embed = await dialog.edit(embeds);
   */
  async edit(
    embeds: readonly EmbedInfo[],
    current?: EmbedValue,
  ): Promise<EmbedValue | undefined> {
    this.finish(undefined);
    this.embeds = embeds;
    // A new embed starts as the only kind there is, if there is just one
    this.key =
      current?.key ?? (embeds.length === 1 ? (embeds[0] as EmbedInfo).key : "");
    this.content = current?.content ?? "";
    this.changing = current !== undefined;
    const result = new Promise<EmbedValue | undefined>(
      (resolve) => (this.editing = resolve),
    );
    await this.updateComplete;
    this.dialog?.showModal();
    // Start where there is something to do: choosing a kind, or writing the content
    (this.key
      ? this.querySelector<HTMLTextAreaElement>("#embed-dialog-content")
      : this.querySelector<HTMLInputElement>('[name="embed-kind"]')
    )?.focus();
    return result;
  }

  /** Give the result to the open `edit` call, if there is one */
  private finish(value: EmbedValue | undefined): void {
    const editing = this.editing;
    this.editing = undefined;
    editing?.(value);
  }

  /** Close the dialog without saving */
  close(): void {
    this.dialog?.close();
  }

  /** Save the embed, if it has a kind and content */
  private save(event: Event): void {
    event.preventDefault();
    const content = this.content.trim();
    if (!this.key || !content) return;
    this.finish({ key: this.key, content });
    this.close();
  }

  override render() {
    const chosen = this.embeds.find((embed) => embed.key === this.key);
    return html`<dialog
      class="article-browser embed-dialog"
      aria-labelledby="embed-dialog-title"
      @close=${() => this.finish(undefined)}
    >
      <form @submit=${this.save}>
        <div class="article-browser-header">
          <h2 id="embed-dialog-title">
            ${this.changing ? "Change embed" : "Add embed"}
          </h2>
          <button
            type="button"
            class="btn-icon"
            title="Close"
            @click=${() => this.close()}
          >
            ${icon("close")}<span class="visually-hidden">Close</span>
          </button>
        </div>
        <div class="embed-dialog-body">
          ${
            this.embeds.length
              ? html`<fieldset class="embed-dialog-kinds">
                  <legend>Kind of embed</legend>
                  ${this.embeds.map(
                    (embed) =>
                      html`<label class="embed-dialog-kind">
                        <input
                          type="radio"
                          name="embed-kind"
                          required
                          .value=${embed.key}
                          .checked=${embed.key === this.key}
                          @change=${() => (this.key = embed.key)}
                        />
                        ${embedIcon(embed)}
                        <span>
                          <strong>${embed.name}</strong>
                          ${
                            embed.description
                              ? html`<span class="embed-dialog-description"
                                  >${embed.description}</span
                                >`
                              : ""
                          }
                        </span>
                      </label>`,
                  )}
                </fieldset>`
              : html`<p class="error" role="alert">
                  This site has no embed plugins. Add them under
                  <code>plugins</code> in its config file.
                </p>`
          }
          <label for="embed-dialog-content">Content</label>
          <textarea
            id="embed-dialog-content"
            rows="8"
            required
            spellcheck="false"
            aria-describedby="embed-dialog-content-hint"
            .value=${this.content}
            @input=${(event: Event) =>
              (this.content = (event.target as HTMLTextAreaElement).value)}
          ></textarea>
          <p id="embed-dialog-content-hint" class="embed-dialog-hint">
            ${
              chosen
                ? `What the ${chosen.name} shows, e.g. a URL or code.`
                : "Choose a kind of embed, then paste or write what it shows, e.g. a URL or code."
            }
          </p>
        </div>
        <div class="embed-dialog-actions">
          <button type="submit" class="btn" ?disabled=${!this.embeds.length}>
            ${this.changing ? "Save" : "Add"}
          </button>
          <button type="button" class="btn" @click=${() => this.close()}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>`;
  }
}

defineElement("edaha-embed-dialog", EdahaEmbedDialog);
