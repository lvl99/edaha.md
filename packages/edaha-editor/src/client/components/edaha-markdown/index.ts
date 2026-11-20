import { html, LitElement } from "lit";
import { live } from "lit/directives/live.js";
import { defineElement } from "../define/index.ts";
import type { ImageUploader } from "../edaha-richtext/index.ts";
import type { FileChooser } from "../edaha-file-browser/index.ts";
import {
  embedButton,
  type EmbedTools,
  type EmbedValue,
} from "../../embeds/index.ts";
import { toolbarButtonContent } from "../../icons/index.ts";
import {
  addTableColumn,
  addTableRow,
  insertTable,
  insertFile,
  insertText,
  removeTable,
  removeTableColumn,
  removeTableRow,
  insertEmbed,
  selectedEmbed,
  selectedLinkUrl,
  setEmbed,
  setLink,
  tableAt,
  textChange,
  toggleBulletList,
  toggleHeading,
  toggleNumberedList,
  toggleQuote,
  toggleReadmore,
  wrapInline,
  wrapLines,
  type TextEdit,
} from "../../markdown/index.ts";

/** A toolbar button: its label and the edit it makes (undefined to change nothing) */
interface MarkdownAction {
  label: string;
  run: (edit: TextEdit) => TextEdit | undefined;
  /** Whether the button can be used now (default: always) */
  enabled?: (edit: TextEdit) => boolean;
}

/** Whether the cursor is in a table */
const inTable = (edit: TextEdit) => tableAt(edit) !== undefined;

/**
 * Markdown editor for an article body: a text box with a toolbar that has the same buttons as the rich text editor's.
 * The buttons write Markdown, or HTML where Markdown has nothing for it (small and big text, details blocks). Rendered
 * in the light DOM, so its text box can be labelled by the field's label (give it `textareaId`). Fires
 * `markdown-change` when the text changes; read it from `value`.
 *
 * @example
 * html`<edaha-markdown .value=${markdown} .textareaId=${"field-body"} @markdown-change=${onChange}></edaha-markdown>`
 */
export class EdahaMarkdown extends LitElement {
  static override properties = {
    value: { attribute: false },
    textareaId: { attribute: false },
    uploadImage: { attribute: false },
    chooseFile: { attribute: false },
    embedTools: { attribute: false },
  };

  /** The Markdown */
  declare value: string;

  /** The text box's id, for its label */
  declare textareaId: string;

  /** Uploads an image file and returns how to refer to it in Markdown; without it, the upload button is disabled */
  declare uploadImage?: ImageUploader | undefined;

  /** Lets the user choose an existing file, giving how to refer to it; without it, its button is disabled */
  declare chooseFile?: FileChooser | undefined;

  /** The site's embeds and the embed dialog; without them, the embed button is disabled */
  declare embedTools?: EmbedTools | undefined;

  /** Asks for a URL (replaceable for tests) */
  prompt: (message: string, value?: string) => string | null = (
    message,
    value,
  ) => window.prompt(message, value);

  constructor() {
    super();
    this.value = "";
    this.textareaId = "";
  }

  protected override createRenderRoot() {
    return this;
  }

  /** The toolbar's buttons, in the same order as the rich text editor's */
  private readonly actions: MarkdownAction[] = [
    { label: "Bold", run: (e) => wrapInline(e, "**", "**") },
    { label: "Italic", run: (e) => wrapInline(e, "_", "_") },
    { label: "Small", run: (e) => wrapInline(e, "<small>", "</small>") },
    { label: "Big", run: (e) => wrapInline(e, "<big>", "</big>") },
    {
      label: "Link",
      run: (e) => {
        const url = this.prompt(
          "Link URL (empty to remove)",
          selectedLinkUrl(e),
        );
        return url === null ? undefined : setLink(e, url.trim());
      },
    },
    { label: "Heading", run: (e) => toggleHeading(e, 2) },
    { label: "Subheading", run: (e) => toggleHeading(e, 3) },
    { label: "Bullet list", run: toggleBulletList },
    { label: "Numbered list", run: toggleNumberedList },
    { label: "Quote", run: toggleQuote },
    { label: "Code", run: (e) => wrapLines(e, "```", "```") },
    {
      label: "Details",
      // A collapsible block, written as HTML with its content as Markdown
      run: (e) =>
        wrapLines(e, "<details>\n<summary>Summary</summary>\n", "\n</details>"),
    },
    {
      label: "Image URL",
      run: (e) => {
        const url = this.prompt("Image URL")?.trim();
        return url ? insertText(e, `![](${url})`) : undefined;
      },
    },
    { label: "Table", run: insertTable },
    { label: "Add row", run: addTableRow, enabled: inTable },
    { label: "Add column", run: addTableColumn, enabled: inTable },
    { label: "Remove row", run: removeTableRow, enabled: inTable },
    { label: "Remove column", run: removeTableColumn, enabled: inTable },
    { label: "Remove table", run: removeTable, enabled: inTable },
    {
      label: "Raw",
      // Text shown exactly as it is written, with no formatting
      run: (e) => wrapLines(e, "<!-- raw -->", "<!-- /raw -->"),
    },
    { label: "Read more", run: toggleReadmore },
  ];

  /** The text box, once rendered */
  private get textarea(): HTMLTextAreaElement | null {
    return this.querySelector("textarea");
  }

  /** The text and its selection now */
  private get selection(): TextEdit {
    const textarea = this.textarea;
    return textarea
      ? {
          value: textarea.value,
          start: textarea.selectionStart,
          end: textarea.selectionEnd,
        }
      : { value: this.value, start: 0, end: 0 };
  }

  /** Take the text box's text as the value, announcing it if it changed */
  private sync(): void {
    // Only called once the text box is rendered
    const text = (this.textarea as HTMLTextAreaElement).value;
    if (text === this.value) return;
    this.value = text;
    this.dispatchEvent(new Event("markdown-change", { bubbles: true }));
  }

  /**
   * Make an edit in the text box: replace only the part that changed, then select what the edit selects. The change is
   * typed in where the browser supports it, so it can be undone like typing.
   */
  apply(edit: TextEdit | undefined): void {
    const textarea = this.textarea;
    if (!edit || !textarea) return;
    textarea.focus();
    if (edit.value !== textarea.value) {
      const { start, end, text } = textChange(textarea.value, edit.value);
      textarea.setSelectionRange(start, end);
      if (typeof document.execCommand === "function")
        document.execCommand(text ? "insertText" : "delete", false, text);
      // Where typing isn't supported, the text is replaced (which can't be undone)
      if (textarea.value !== edit.value) textarea.value = edit.value;
    }
    textarea.setSelectionRange(edit.start, edit.end);
    this.sync();
    // Refresh which buttons can be used
    this.requestUpdate();
  }

  /** Upload the chosen image and insert it at the cursor */
  private async onImageFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !this.uploadImage) return;
    const selection = this.selection;
    try {
      const src = await this.uploadImage(file);
      this.apply(insertText(selection, `![](${src})`));
    } catch {
      // The uploader reports its own errors
    }
  }

  /**
   * Ask for an embed's content in the embed dialog (where the selection was when asked): a new embed of a kind,
   * inserted after the selection, or the selected embed block when it is of that kind.
   */
  private async editEmbed(selection: TextEdit, key: string) {
    const selected = selectedEmbed(selection);
    const adding = selected?.key !== key;
    const value = await this.embedTools?.edit(
      adding ? { key, content: "", options: {} } : (selected as EmbedValue),
      adding,
    );
    if (!value) this.textarea?.focus();
    else this.apply((adding ? insertEmbed : setEmbed)(selection, value));
  }

  /** Let the user choose an existing file, and insert it where the selection was when asked */
  private async onChooseFile() {
    const selection = this.selection;
    const file = await this.chooseFile?.();
    if (file)
      this.apply(
        insertFile(selection, file.url, file.name, file.kind === "image"),
      );
  }

  override render() {
    const selection = this.selection;
    // Moving the cursor changes which buttons can be used (e.g. the table buttons)
    const refresh = () => this.requestUpdate();
    return html`
      <div
        class="editor-toolbar markdown-toolbar"
        role="toolbar"
        aria-label="Formatting"
      >
        ${this.actions.map(
          (action) =>
            html`<button
              type="button"
              class="toolbar-button"
              data-action=${action.label}
              title=${action.label}
              ?disabled=${action.enabled ? !action.enabled(selection) : false}
              @click=${() => this.apply(action.run(this.selection))}
            >
              ${toolbarButtonContent(action.label)}
            </button>`,
        )}
        ${this.embedTools?.embeds.map((embed) =>
          embedButton(embed, {
            pressed: selectedEmbed(selection)?.key === embed.key,
            disabled: false,
            onClick: () => void this.editEmbed(this.selection, embed.key),
          }),
        )}
        <label
          class="toolbar-button toolbar-upload"
          title="Upload image"
          ?data-disabled=${!this.uploadImage}
        >
          ${toolbarButtonContent("Upload image")}
          <input
            type="file"
            class="visually-hidden"
            accept="image/png, image/jpeg, image/gif, image/webp"
            ?disabled=${!this.uploadImage}
            @change=${(event: Event) => void this.onImageFile(event)}
          />
        </label>
        <button
          type="button"
          class="toolbar-button"
          data-action="Choose file"
          title="Choose file"
          ?disabled=${!this.chooseFile}
          @click=${() => void this.onChooseFile()}
        >
          ${toolbarButtonContent("Choose file")}
        </button>
      </div>
      <textarea
        id=${this.textareaId}
        .value=${live(this.value)}
        @input=${() => this.sync()}
        @keyup=${refresh}
        @click=${refresh}
        @select=${refresh}
      ></textarea>
    `;
  }
}

defineElement("edaha-markdown", EdahaMarkdown);
