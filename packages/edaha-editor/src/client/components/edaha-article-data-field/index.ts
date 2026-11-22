import { html, LitElement, nothing } from "lit";
import { defineElement } from "../define/index.ts";
import "../edaha-markdown/index.ts";
import "../edaha-richtext/index.ts";
import type { ImageUploader } from "../edaha-richtext/index.ts";
import type { EmbedTools } from "../../embeds/index.ts";
import type { FileAddress } from "../../richtext/editor/index.ts";
import { acceptedKind, type FileChooser } from "../edaha-file-browser/index.ts";

/** Kinds of field */
export type FieldType =
  | "text"
  | "email"
  | "url"
  | "datetime-local"
  | "textarea"
  | "select"
  | "file"
  | "richtext"
  | "markdown";

/** An option of a select field */
export interface FieldOption {
  value: string;
  label: string;
}

/** Detail of the `field-change` event */
export interface FieldChange {
  name: string;
  value: string;
}

/** Image file extensions that get a preview */
const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i;

/**
 * One article data field: a label and an input of the given type. Rendered in the light DOM. A `changed` field's label
 * ends with an asterisk, to show it isn't saved yet.
 *
 * Fires `field-change` (detail: {@link FieldChange}) when the value changes, and for file fields `field-file`
 * (detail: the chosen File) so the article can upload it and set the value to the saved file name. With `chooseFile`,
 * a file field can also be set to an existing file.
 *
 * @example
 * html`<edaha-article-data-field name="title" type="text" label="Title" .value=${title}></edaha-article-data-field>`
 */
export class EdahaArticleDataField extends LitElement {
  static override properties = {
    name: {},
    type: {},
    label: {},
    placeholder: {},
    accept: {},
    rows: { type: Number },
    value: { attribute: false },
    options: { attribute: false },
    previewUrl: { attribute: false },
    uploadImage: { attribute: false },
    chooseFile: { attribute: false },
    embedTools: { attribute: false },
    fileAddress: { attribute: false },
    preview: { type: Boolean },
    allowchange: { type: Boolean },
    allowclear: { type: Boolean },
    disabled: { type: Boolean },
    changed: { type: Boolean },
  };

  declare name: string;
  declare type: FieldType;
  declare label: string;
  declare placeholder: string;
  /** File types a file field accepts */
  declare accept: string;
  /** Rows of a textarea */
  declare rows: number;
  declare value: string;
  /** Options of a select field */
  declare options: FieldOption[];
  /** For file fields: the URL to preview the current file at */
  declare previewUrl?: string | undefined;
  /** For rich text and Markdown fields: uploads images inserted into the text */
  declare uploadImage?: ImageUploader | undefined;
  /** For file, rich text and Markdown fields: lets the user choose an existing file */
  declare chooseFile?: FileChooser | undefined;
  /** For rich text and Markdown fields: the site's embeds, the embed dialog, and embed blocks' frames */
  declare embedTools?: EmbedTools | undefined;
  /** For rich text: the address images in the body are shown from, for their `src` */
  declare fileAddress?: FileAddress | undefined;
  /** For file fields: show an image preview */
  declare preview: boolean;
  /** For file fields: allow choosing a new file when one is set */
  declare allowchange: boolean;
  /** Show a button that clears the value */
  declare allowclear: boolean;
  declare disabled: boolean;
  /** Whether the value differs from the saved one (the label gets an asterisk) */
  declare changed: boolean;

  constructor() {
    super();
    this.name = "";
    this.type = "text";
    this.label = "";
    this.placeholder = "";
    this.accept = "";
    this.rows = 3;
    this.value = "";
    this.options = [];
    this.preview = false;
    this.allowchange = false;
    this.allowclear = false;
    this.disabled = false;
    this.changed = false;
  }

  protected override createRenderRoot() {
    return this;
  }

  /** Set the value and announce the change */
  private change(value: string) {
    this.value = value;
    this.dispatchEvent(
      new CustomEvent<FieldChange>("field-change", {
        detail: { name: this.name, value },
        bubbles: true,
      }),
    );
  }

  /** The input's id, linking it to its label */
  private get inputId() {
    return `field-${this.name.replace(/[^a-z0-9-]/gi, "-")}`;
  }

  /** Render the input for the field's type */
  private renderInput() {
    const onInput = (event: Event) =>
      this.change((event.target as HTMLInputElement).value);
    switch (this.type) {
      case "textarea":
        return html`<textarea
          id=${this.inputId}
          rows=${this.rows}
          placeholder=${this.placeholder}
          ?disabled=${this.disabled}
          .value=${this.value}
          @input=${onInput}
        ></textarea>`;
      case "select":
        return html`<select
          id=${this.inputId}
          ?disabled=${this.disabled}
          @change=${onInput}
        >
          ${this.options.map(
            (option) =>
              html`<option
                value=${option.value}
                ?selected=${option.value === this.value}
              >
                ${option.label}
              </option>`,
          )}
        </select>`;
      case "richtext":
        return html`<edaha-richtext
          id=${this.inputId}
          .value=${this.value}
          .uploadImage=${this.uploadImage}
          .chooseFile=${this.chooseFile}
          .embedTools=${this.embedTools}
          .fileAddress=${this.fileAddress}
          @richtext-change=${(event: Event) => {
            event.stopPropagation();
            this.change(
              (event.currentTarget as HTMLElement & { value: string }).value,
            );
          }}
        ></edaha-richtext>`;
      case "markdown":
        return html`<edaha-markdown
          .textareaId=${this.inputId}
          .value=${this.value}
          .uploadImage=${this.uploadImage}
          .chooseFile=${this.chooseFile}
          .embedTools=${this.embedTools}
          @markdown-change=${(event: Event) => {
            event.stopPropagation();
            this.change(
              (event.currentTarget as HTMLElement & { value: string }).value,
            );
          }}
        ></edaha-markdown>`;
      case "file":
        return this.renderFile();
      default:
        return html`<input
          id=${this.inputId}
          type=${this.type}
          placeholder=${this.placeholder}
          ?disabled=${this.disabled}
          .value=${this.value}
          @input=${onInput}
        />`;
    }
  }

  /** Let the user choose an existing file (of the kind the field accepts), and set the value to it */
  private async chooseExisting() {
    const file = await this.chooseFile?.(acceptedKind(this.accept));
    if (file) this.change(file.url);
  }

  /** Render a file field: the current file (with a preview), a file chooser, and a button choosing an existing file */
  private renderFile() {
    const showChooser = !this.value || this.allowchange;
    return html`
      ${
        this.value
          ? html`<p class="file-current">
              ${
                this.preview && this.previewUrl && IMAGE.test(this.value)
                  ? html`<img src=${this.previewUrl} alt="" width="120" />`
                  : nothing
              }
              <span>${this.value}</span>
            </p>`
          : nothing
      }
      ${
        showChooser
          ? html`<input
                id=${this.inputId}
                type="file"
                accept=${this.accept}
                ?disabled=${this.disabled}
                @change=${(event: Event) => {
                  const input = event.target as HTMLInputElement;
                  const file = input.files?.[0];
                  input.value = "";
                  if (file)
                    this.dispatchEvent(
                      new CustomEvent<File>("field-file", {
                        detail: file,
                        bubbles: true,
                      }),
                    );
                }}
              />${
                this.chooseFile
                  ? html`<button
                      type="button"
                      class="btn btn-choose-file"
                      @click=${() => void this.chooseExisting()}
                    >
                      Choose existing file…<span class="visually-hidden">
                        for ${this.label}</span
                      >
                    </button>`
                  : nothing
              }`
          : nothing
      }
    `;
  }

  override render() {
    return html`
      ${
        this.label
          ? html`<label for=${this.inputId}
              >${this.label}${
                this.changed
                  ? html`<span
                      class="changed"
                      title="Changed since it was saved"
                    >
                      *</span
                    >`
                  : nothing
              }</label
            >`
          : nothing
      }
      ${this.renderInput()}
      ${
        this.allowclear && this.value
          ? html`<button
              type="button"
              class="btn clear"
              ?disabled=${this.disabled}
              @click=${() => this.change("")}
            >
              Clear
            </button>`
          : nothing
      }
    `;
  }
}

defineElement("edaha-article-data-field", EdahaArticleDataField);
