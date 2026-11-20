import { html, LitElement } from "lit";
import type { EmbedInfo } from "../../../server/types/index.ts";
import {
  embedIcon,
  type EmbedValidator,
  type EmbedValue,
} from "../../embeds/index.ts";
import { icon } from "../../icons/index.ts";
import { defineElement } from "../define/index.ts";

/**
 * The embed dialog: asks for an embed block's kind (one of the site's embed plugins, with its description) and its
 * content (e.g. a video's URL, or a diagram's code). With a validator, the content is checked before it is saved, and
 * any problems are shown under it. Rendered in the light DOM.
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
    errors: { state: true },
    checking: { state: true },
    kind: { state: true },
  };

  /** The site's embed plugins */
  declare embeds: readonly EmbedInfo[];
  /** The chosen kind of embed */
  declare key: string;
  /** The embed's content */
  declare content: string;
  /** Whether an existing embed is being changed (rather than a new one added) */
  declare changing: boolean;
  /** Why the content isn't valid, from the last check */
  declare errors: string[];
  /** Whether the content is being checked */
  declare checking: boolean;
  /** The embed's kind, when it is known as the dialog opens (only its content is asked for then) */
  declare kind: EmbedInfo | undefined;

  /** Resolves the open `edit` call */
  private editing: ((value: EmbedValue | undefined) => void) | undefined;
  /** Checks the content of the open `edit` call */
  private validator: EmbedValidator | undefined;

  constructor() {
    super();
    this.embeds = [];
    this.key = "";
    this.content = "";
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

  /**
   * Open the dialog to add an embed of a kind (`adding`, with empty content), or change an embed block. For a kind
   * the site has a plugin for, only its content is asked for; otherwise (e.g. an old block without a key), its kind
   * too. Resolves with the kind and content, or undefined if the dialog is closed without saving.
   *
   * @param validate - gives why an embed's content isn't valid (none when it is), checked before it is saved
   * @example
   * const embed = await dialog.edit(embeds, { key: "youtube", content: "" }, true, ({ key, content }) => api.validateEmbed(key, content));
   */
  async edit(
    embeds: readonly EmbedInfo[],
    value: EmbedValue,
    adding: boolean,
    validate?: EmbedValidator,
  ): Promise<EmbedValue | undefined> {
    this.finish(undefined);
    this.embeds = embeds;
    this.validator = validate;
    this.errors = [];
    this.kind = embeds.find((embed) => embed.key === value.key);
    // Without a known kind, it starts as the only kind there is, if there is just one
    this.key =
      this.kind?.key ??
      (embeds.length === 1 ? (embeds[0] as EmbedInfo).key : "");
    this.content = value.content;
    this.changing = !adding;
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

  /** Save the embed, if it has a kind and content that are valid; otherwise show why not */
  private async save(event: Event): Promise<void> {
    event.preventDefault();
    const value = { key: this.key, content: this.content.trim() };
    if (!value.key || !value.content || this.checking) return;
    if (this.validator) {
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
        value.key !== this.key || value.content !== this.content.trim();
      if (changed) this.errors = [];
      if (changed || this.errors.length) {
        this.querySelector<HTMLTextAreaElement>(
          "#embed-dialog-content",
        )?.focus();
        return;
      }
    }
    this.finish(value);
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
            ${this.changing ? "Change" : "Add"} ${this.kind?.name ?? "embed"}
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
            this.kind
              ? html`<p class="embed-dialog-about">
                  ${embedIcon(this.kind)}
                  <span>${this.kind.description ?? ""}</span>
                </p>`
              : this.embeds.length
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
                            @change=${() => {
                              this.key = embed.key;
                              this.errors = [];
                            }}
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
          <p id="embed-dialog-content-hint" class="embed-dialog-hint">
            ${
              chosen
                ? `What the ${chosen.name} shows, e.g. a URL or code.`
                : "Choose a kind of embed, then paste or write what it shows, e.g. a URL or code."
            }
          </p>
        </div>
        <div class="embed-dialog-actions">
          <button
            type="submit"
            class="btn"
            ?disabled=${!this.embeds.length}
            aria-disabled=${this.checking ? "true" : "false"}
          >
            ${this.checking ? "Checking…" : this.changing ? "Save" : "Add"}
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
