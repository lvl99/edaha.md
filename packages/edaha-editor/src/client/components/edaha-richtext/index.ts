import type { Editor } from "@tiptap/core";
import {
  html,
  LitElement,
  render as renderTemplate,
  type PropertyValues,
} from "lit";
import {
  embedButton,
  type EmbedTools,
  type EmbedValue,
} from "../../embeds/index.ts";
import {
  createRichtextEditor,
  type FileAddress,
} from "../../richtext/editor/index.ts";
import {
  EMBED_EDIT_EVENT,
  EMBED_REFRESH_EVENT,
} from "../../richtext/extensions/index.ts";
import { defineElement } from "../define/index.ts";
import { toolbarButtonContent } from "../../icons/index.ts";
import type { ChosenFile, FileChooser } from "../edaha-file-browser/index.ts";

/** Uploads an image and returns the URL to show it at */
export type ImageUploader = (file: File) => Promise<string>;

/** A toolbar button: its label and what it does */
interface ToolbarAction {
  label: string;
  run: (editor: Editor) => unknown;
  /** Whether the button shows as pressed */
  active?: (editor: Editor) => boolean;
  /** Whether the button can be used now (default: always) */
  enabled?: (editor: Editor) => boolean;
}

/** A toggle for a heading level, labelled e.g. "Heading 1" */
const headingAction = (level: 1 | 2 | 3): ToolbarAction => ({
  label: `Heading ${level}`,
  run: (e) => e.chain().focus().toggleHeading({ level }).run(),
  active: (e) => e.isActive("heading", { level }),
});

/** Render a toolbar button for an action, pressed when it is active, and disabled until the editor is ready */
const actionButton = (action: ToolbarAction, editor: Editor | undefined) =>
  html`<button
    type="button"
    class="btn btn-toolbar"
    data-action=${action.label}
    title=${action.label}
    ?disabled=${!editor || (action.enabled ? !action.enabled(editor) : false)}
    aria-pressed=${editor && action.active ? String(action.active(editor)) : "false"}
    @click=${() => editor && action.run(editor)}
  >
    ${toolbarButtonContent(action.label)}
  </button>`;

/** Whether the cursor is in a table */
const inTable = (editor: Editor) => editor.isActive("table");

/**
 * Rich text editor for an article body (Tiptap) with a toolbar. Rendered in the light DOM, as ProseMirror needs
 * document selection APIs. Fires `richtext-change` when the content changes (not `input`, which typing in the
 * editable area fires too); read the HTML from `value`.
 *
 * @example
 * html`<edaha-richtext .value=${body} .uploadImage=${upload} @richtext-change=${onChange}></edaha-richtext>`
 */
export class EdahaRichtext extends LitElement {
  static override properties = {
    value: { attribute: false },
    uploadImage: { attribute: false },
    chooseFile: { attribute: false },
    embedTools: { attribute: false },
    fileAddress: { attribute: false },
  };

  /** The content as HTML */
  declare value: string;

  /** Uploads an image file; without it, the upload button is disabled */
  declare uploadImage?: ImageUploader | undefined;

  /** Lets the user choose an existing file, giving the URL to show it at; without it, its button is disabled */
  declare chooseFile?: FileChooser | undefined;

  /** The site's embeds, the embed dialog, and embed blocks' frames */
  declare embedTools?: EmbedTools | undefined;
  /** The address images in the body are shown from, for their `src` (e.g. on another page's editor server) */
  declare fileAddress?: FileAddress | undefined;

  /** The Tiptap editor, once rendered */
  editor?: Editor;

  /**
   * The toolbar that floats above selected text, with its format buttons. The editor shows it and moves it into the
   * editable area's box while text is selected, so it is rendered here rather than in the component's template.
   */
  readonly formatMenu: HTMLElement;

  /** Asks for a URL (replaceable for tests) */
  prompt: (message: string, value?: string) => string | null = (
    message,
    value,
  ) => window.prompt(message, value);

  constructor() {
    super();
    this.value = "";
    this.formatMenu = document.createElement("div");
    this.formatMenu.className = "editor-toolbar format-menu";
    this.formatMenu.setAttribute("role", "toolbar");
    this.formatMenu.setAttribute("aria-label", "Text format");
    // Pressing a button keeps the text selected
    this.formatMenu.addEventListener("mousedown", (event) =>
      event.preventDefault(),
    );
    // Escape goes back to the text
    this.formatMenu.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.editor?.commands.focus();
    });
  }

  protected override createRenderRoot() {
    return this;
  }

  /** The floating toolbar's buttons, for formatting selected text */
  private readonly formatActions: ToolbarAction[] = [
    {
      label: "Bold",
      run: (e) => e.chain().focus().toggleBold().run(),
      active: (e) => e.isActive("bold"),
    },
    {
      label: "Italic",
      run: (e) => e.chain().focus().toggleItalic().run(),
      active: (e) => e.isActive("italic"),
    },
    {
      label: "Underline",
      run: (e) => e.chain().focus().toggleUnderline().run(),
      active: (e) => e.isActive("underline"),
    },
    {
      label: "Strikethrough",
      run: (e) => e.chain().focus().toggleStrike().run(),
      active: (e) => e.isActive("strike"),
    },
    {
      label: "Link",
      run: (e) => this.editLink(e),
      active: (e) => e.isActive("link"),
    },
    headingAction(1),
    headingAction(2),
    headingAction(3),
  ];

  /** The toolbar's buttons */
  private readonly actions: ToolbarAction[] = [
    {
      label: "Bold",
      run: (e) => e.chain().focus().toggleBold().run(),
      active: (e) => e.isActive("bold"),
    },
    {
      label: "Italic",
      run: (e) => e.chain().focus().toggleItalic().run(),
      active: (e) => e.isActive("italic"),
    },
    {
      label: "Underline",
      run: (e) => e.chain().focus().toggleUnderline().run(),
      active: (e) => e.isActive("underline"),
    },
    {
      label: "Strikethrough",
      run: (e) => e.chain().focus().toggleStrike().run(),
      active: (e) => e.isActive("strike"),
    },
    {
      label: "Small",
      run: (e) => e.chain().focus().toggleMark("small").run(),
      active: (e) => e.isActive("small"),
    },
    {
      label: "Big",
      run: (e) => e.chain().focus().toggleMark("big").run(),
      active: (e) => e.isActive("big"),
    },
    {
      label: "Link",
      run: (e) => this.editLink(e),
      active: (e) => e.isActive("link"),
    },
    {
      label: "Main heading",
      run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
      active: (e) => e.isActive("heading", { level: 1 }),
    },
    {
      label: "Heading",
      run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
      active: (e) => e.isActive("heading", { level: 2 }),
    },
    {
      label: "Subheading",
      run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
      active: (e) => e.isActive("heading", { level: 3 }),
    },
    {
      label: "Bullet list",
      run: (e) => e.chain().focus().toggleBulletList().run(),
      active: (e) => e.isActive("bulletList"),
    },
    {
      label: "Numbered list",
      run: (e) => e.chain().focus().toggleOrderedList().run(),
      active: (e) => e.isActive("orderedList"),
    },
    {
      label: "Quote",
      run: (e) => e.chain().focus().toggleBlockquote().run(),
      active: (e) => e.isActive("blockquote"),
    },
    {
      label: "Code",
      run: (e) => e.chain().focus().toggleCodeBlock().run(),
      active: (e) => e.isActive("codeBlock"),
    },
    {
      label: "Details",
      // Wraps the selected blocks in a collapsible block, or unwraps it
      run: (e) =>
        e.isActive("details")
          ? e.chain().focus().unsetDetails().run()
          : e.chain().focus().setDetails().run(),
      active: (e) => e.isActive("details"),
    },
    { label: "Image URL", run: (e) => this.insertImageUrl(e) },
    {
      label: "Table",
      run: (e) =>
        e
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
      active: inTable,
    },
    {
      label: "Add row",
      run: (e) => e.chain().focus().addRowAfter().run(),
      enabled: inTable,
    },
    {
      label: "Add column",
      run: (e) => e.chain().focus().addColumnAfter().run(),
      enabled: inTable,
    },
    {
      label: "Remove row",
      run: (e) => e.chain().focus().deleteRow().run(),
      enabled: inTable,
    },
    {
      label: "Remove column",
      run: (e) => e.chain().focus().deleteColumn().run(),
      enabled: inTable,
    },
    {
      label: "Remove table",
      run: (e) => e.chain().focus().deleteTable().run(),
      enabled: inTable,
    },
    {
      label: "Raw",
      // Text shown exactly as it is written, with no formatting
      run: (e) => e.chain().focus().toggleRaw().run(),
      active: (e) => e.isActive("raw"),
    },
    {
      label: "Read more",
      // A selected break is removed; otherwise one is inserted at the cursor
      run: (e) =>
        e.isActive("readmore")
          ? e.chain().focus().deleteSelection().run()
          : e.chain().focus().setReadmore().run(),
      active: (e) => e.isActive("readmore"),
    },
  ];

  /**
   * Add, change or remove (empty URL) the link on the selection.
   */
  private editLink(editor: Editor) {
    const url = this.prompt(
      "Link URL (empty to remove)",
      editor.getAttributes("link").href as string | undefined,
    );
    if (url === null) return;
    if (url.trim() === "") editor.chain().focus().unsetLink().run();
    else
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: url.trim() })
        .run();
  }

  /**
   * Insert an image by URL.
   */
  private insertImageUrl(editor: Editor) {
    const url = this.prompt("Image URL")?.trim();
    if (url) editor.chain().focus().setImage({ src: url }).run();
  }

  /**
   * Ask for an embed's content in the embed dialog: a new embed of a kind (from its toolbar button), inserted after the
   * selected block, or the selected embed block (from its "Edit" button, or its kind's toolbar button).
   *
   * @param key - the kind of embed to add, from its toolbar button
   */
  private async editEmbed(editor: Editor, key?: string) {
    const selected = editor.isActive("embed")
      ? (editor.getAttributes("embed") as EmbedValue)
      : undefined;
    const adding = key !== undefined && selected?.key !== key;
    const current = adding ? { key, content: "", options: {} } : selected;
    if (!this.embedTools || !current) return;
    const value = await this.embedTools.edit(current, adding);
    if (!value) editor.commands.focus();
    else if (adding) editor.chain().focus().insertEmbed(value).run();
    else editor.chain().focus().setEmbed(value).run();
  }

  /**
   * Upload the chosen image and insert it.
   */
  private async onImageFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !this.uploadImage || !this.editor) return;
    try {
      const src = await this.uploadImage(file);
      this.editor.chain().focus().setImage({ src, alt: "" }).run();
    } catch {
      // The uploader reports its own errors
    }
  }

  /**
   * Insert a file: an image as an image, anything else as a link (on the selection, or named after the file).
   */
  insertFile({ url, name, kind }: ChosenFile): void {
    const chain = this.editor?.chain().focus();
    if (!chain) return;
    if (kind === "image") chain.setImage({ src: url, alt: "" }).run();
    else if (this.editor?.state.selection.empty)
      chain
        .insertContent({
          type: "text",
          text: name,
          marks: [{ type: "link", attrs: { href: url } }],
        })
        .run();
    else chain.setLink({ href: url }).run();
  }

  /** Let the user choose an existing file, and insert it */
  private async onChooseFile() {
    const file = await this.chooseFile?.();
    if (file) this.insertFile(file);
  }

  protected override firstUpdated(): void {
    const element = this.querySelector(".richtext-content") as HTMLElement;
    this.editor = createRichtextEditor(
      element,
      this.value,
      (value) => {
        this.value = value;
        this.dispatchEvent(new Event("richtext-change", { bubbles: true }));
        // Refresh the toolbar's pressed states
        this.requestUpdate();
      },
      // Read when embed blocks are shown, so the tools can be set after the editor is created
      () => this.embedTools,
      this.formatMenu,
      // Read when an image is shown, so it can be set after the editor is created
      (src) => this.fileAddress?.(src) ?? src,
    );
    // An embed block's "Edit" button selects it, then asks for its new kind and content here
    element.addEventListener(EMBED_EDIT_EVENT, () => {
      if (this.editor) void this.editEmbed(this.editor);
    });
    this.editor.on("selectionUpdate", () => this.requestUpdate());
    this.requestUpdate();
  }

  protected override updated(changed: PropertyValues<this>): void {
    // The floating toolbar's buttons show what the selected text has
    renderTemplate(
      this.formatActions.map((action) => actionButton(action, this.editor)),
      this.formatMenu,
    );
    // Replace the content when a different value is set from outside (e.g. another article is loaded)
    if (
      changed.has("value") &&
      this.editor &&
      this.editor.getHTML() !== this.value
    )
      this.editor.commands.setContent(this.value, { emitUpdate: false });
    // Embed blocks show their kind and frame once the embeds are known
    if (changed.has("embedTools"))
      for (const block of this.querySelectorAll(".embed-block"))
        block.dispatchEvent(new Event(EMBED_REFRESH_EVENT));
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.editor?.destroy();
    this.editor = undefined;
  }

  override render() {
    const editor = this.editor;
    return html`
      <div
        class="editor-toolbar richtext-toolbar"
        role="toolbar"
        aria-label="Formatting"
      >
        ${this.actions.map((action) => actionButton(action, editor))}
        ${this.embedTools?.embeds.map((embed) =>
          embedButton(embed, {
            pressed: !!editor?.isActive("embed", { key: embed.key }),
            disabled: !editor,
            onClick: () => editor && void this.editEmbed(editor, embed.key),
          }),
        )}
        <label
          class="btn btn-toolbar btn-upload"
          title="Upload image"
          ?data-disabled=${!editor || !this.uploadImage}
        >
          ${toolbarButtonContent("Upload image")}
          <input
            type="file"
            class="visually-hidden"
            accept="image/png, image/jpeg, image/gif, image/webp"
            ?disabled=${!editor || !this.uploadImage}
            @change=${(event: Event) => void this.onImageFile(event)}
          />
        </label>
        <button
          type="button"
          class="btn btn-toolbar"
          data-action="Choose file"
          title="Choose file"
          ?disabled=${!editor || !this.chooseFile}
          @click=${() => void this.onChooseFile()}
        >
          ${toolbarButtonContent("Choose file")}
        </button>
      </div>
      <div class="richtext-content"></div>
    `;
  }
}

defineElement("edaha-richtext", EdahaRichtext);
