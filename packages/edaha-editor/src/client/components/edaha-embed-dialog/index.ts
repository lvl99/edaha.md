import { html, LitElement } from "lit";
import type { EmbedInfo } from "../../../server/types/index.ts";
import { embedIcon, type EmbedValidator } from "../../embeds/index.ts";
import { icon } from "../../icons/index.ts";
import { defineElement } from "../define/index.ts";

/**
 * The embed dialog: asks for the content of an embed of one kind (e.g. a YouTube video's URL, or a diagram's code),
 * showing what the kind embeds. Its kind can't be changed here: each kind has its own toolbar button. With a
 * validator, the content is checked before it is saved, and any problems are shown under it. Rendered in the light
 * DOM.
 *
 * @example
 * html`<edaha-embed-dialog></edaha-embed-dialog>`
 * const content = await dialog.edit(youtube, "", true);
 */
export class EdahaEmbedDialog extends LitElement {
  static override properties = {
    embed: { state: true },
    content: { state: true },
    changing: { state: true },
    errors: { state: true },
    checking: { state: true },
  };

  /** The kind of embed whose content is asked for */
  declare embed: EmbedInfo | undefined;
  /** The embed's content */
  declare content: string;
  /** Whether an existing embed is being changed (rather than a new one added) */
  declare changing: boolean;
  /** Why the content isn't valid, from the last check */
  declare errors: string[];
  /** Whether the content is being checked */
  declare checking: boolean;

  /** Resolves the open `edit` call */
  private editing: ((content: string | undefined) => void) | undefined;
  /** Checks the content of the open `edit` call */
  private validator: EmbedValidator | undefined;

  constructor() {
    super();
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

  /** The content's text box, once rendered */
  private get textarea(): HTMLTextAreaElement | null {
    return this.querySelector("#embed-dialog-content");
  }

  /**
   * Open the dialog to add an embed of a kind (`adding`), or change an embed block's content. Resolves with the
   * content, or undefined if the dialog is closed without saving.
   *
   * @param validate - gives why an embed's content isn't valid (none when it is), checked before it is saved
   * @example
   * const content = await dialog.edit(youtube, "", true, ({ key, content }) => api.validateEmbed(key, content));
   */
  async edit(
    embed: EmbedInfo,
    content: string,
    adding: boolean,
    validate?: EmbedValidator,
  ): Promise<string | undefined> {
    this.finish(undefined);
    this.embed = embed;
    this.content = content;
    this.changing = !adding;
    this.validator = validate;
    this.errors = [];
    const result = new Promise<string | undefined>(
      (resolve) => (this.editing = resolve),
    );
    await this.updateComplete;
    this.dialog?.showModal();
    this.textarea?.focus();
    return result;
  }

  /** Give the result to the open `edit` call, if there is one */
  private finish(content: string | undefined): void {
    const editing = this.editing;
    this.editing = undefined;
    editing?.(content);
  }

  /** Close the dialog without saving */
  close(): void {
    this.dialog?.close();
  }

  /** Save the content, if there is some and it is valid; otherwise show why not */
  private async save(event: Event): Promise<void> {
    event.preventDefault();
    const content = this.content.trim();
    if (!this.embed || !content || this.checking) return;
    if (this.validator) {
      this.checking = true;
      try {
        this.errors = await this.validator({ key: this.embed.key, content });
      } catch (error) {
        this.errors = [
          `The content couldn't be checked: ${(error as Error).message}`,
        ];
      }
      this.checking = false;
      // Changed while it was checked: it is checked again when saved again
      const changed = content !== this.content.trim();
      if (changed) this.errors = [];
      if (changed || this.errors.length) {
        this.textarea?.focus();
        return;
      }
    }
    this.finish(content);
    this.close();
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
            class="btn-icon"
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
            What the ${embed?.name ?? "embed"} shows, e.g. a URL or code.
          </p>
        </div>
        <div class="embed-dialog-actions">
          <button
            type="submit"
            class="btn"
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
