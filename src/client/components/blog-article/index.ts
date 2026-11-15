import { html, LitElement, nothing, type PropertyValues } from "lit";
import { slugify } from "../../../generator/slug/index.ts";
import type {
  EditorArticle,
  EditorArticleData,
  EditorAttachment,
} from "../../../server/types/index.ts";
import type { ArticleLocation, EditorApi } from "../../editorApi/index.ts";
import { fromLocalInput, toLocalInput } from "../../dates/index.ts";
import { defineElement } from "../define/index.ts";
import "../blog-article-data-field/index.ts";
import "../blog-article-data-group/index.ts";
import type {
  FieldChange,
  FieldOption,
} from "../blog-article-data-field/index.ts";
import { showToast } from "../blog-toasts/index.ts";

const STATUS_OPTIONS: FieldOption[] = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "unlisted", label: "Unlisted" },
];

/** How the body is shown: the rich text editor, its Markdown in a text box, or rendered as the website would */
export type BodyMode = "wysiwyg" | "markdown" | "preview";

/** The body modes' buttons */
export const BODY_MODES: readonly { mode: BodyMode; label: string }[] = [
  { mode: "wysiwyg", label: "WYSIWYG" },
  { mode: "markdown", label: "Markdown" },
  { mode: "preview", label: "Preview" },
];

/**
 * Data for a new, empty article (a draft dated now).
 */
export const newArticleData = (now = new Date()): EditorArticleData => ({
  type: "article",
  slug: "",
  status: "draft",
  date: now.toISOString(),
  title: "",
  author: undefined,
  excerpt: undefined,
  thumbnail: undefined,
  tags: [],
  attachments: [],
  bodyHtml: "",
});

/**
 * Apply a field change to article data. Field names follow the form, e.g. "title", "author[name]", "tags[0]",
 * "attachments[1][url]".
 *
 * @example
 * applyFieldChange(data, "author[email]", "matt@lvl99.com");
 */
export const applyFieldChange = (
  data: EditorArticleData,
  name: string,
  value: string,
): EditorArticleData => {
  const author = /^author\[(name|email|url)\]$/.exec(name);
  if (author) {
    const next = {
      name: "",
      ...data.author,
      [author[1] as string]: value || undefined,
    };
    return {
      ...data,
      author:
        next.name || next.email || next.url
          ? { ...next, name: next.name ?? "" }
          : undefined,
    };
  }
  const tag = /^tags\[(\d+)\]$/.exec(name);
  if (tag) {
    const tags = [...data.tags];
    tags[Number(tag[1])] = value;
    return { ...data, tags };
  }
  const attachment = /^attachments\[(\d+)\]\[(url|name|thumbnail)\]$/.exec(
    name,
  );
  if (attachment) {
    const attachments = [...data.attachments];
    const index = Number(attachment[1]);
    const field = attachment[2] as keyof EditorAttachment;
    const current = attachments[index] ?? { url: "" };
    attachments[index] =
      field === "url"
        ? { ...current, url: value }
        : { ...current, [field]: value || undefined };
    return { ...data, attachments };
  }
  switch (name) {
    case "date":
      return { ...data, date: fromLocalInput(value) || data.date };
    case "body":
      return { ...data, bodyHtml: value };
    case "excerpt":
    case "thumbnail":
      return { ...data, [name]: value || undefined };
    case "template":
      // "single" is the default, so it isn't written to the article
      return { ...data, template: value === "single" ? undefined : value };
    case "title":
    case "slug":
    case "type":
    case "status":
      return { ...data, [name]: value } as EditorArticleData;
    default:
      return data;
  }
};

/**
 * Remove empty tags and attachments without a URL, and fill in the slug from the title if it is empty.
 */
export const cleanArticleData = (
  data: EditorArticleData,
): EditorArticleData => ({
  ...data,
  slug: data.slug.trim() || slugify(data.title),
  title: data.title.trim(),
  tags: data.tags.map((tag) => tag.trim()).filter(Boolean),
  attachments: data.attachments.filter((attachment) => attachment.url.trim()),
});

/** The fields compared to find changes, other than the body (groups are compared as a whole) */
const COMPARED_FIELDS = [
  "title",
  "type",
  "template",
  "status",
  "slug",
  "date",
  "author",
  "excerpt",
  "thumbnail",
  "tags",
  "attachments",
] as const satisfies readonly (keyof EditorArticleData)[];

/** A value with object keys sorted and undefined properties left out, so equal values compare equal */
const normalise = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, normalise(item)]),
    );
  return value;
};

/**
 * The fields (and groups: "author", "tags" and "attachments") whose values differ between an article's data and its
 * saved data. The body isn't compared, as its HTML is reformatted by the editor (see `BlogArticle.bodyChanged`).
 *
 * @example
 * changedFields({ ...saved, title: "New" }, saved); // Set { "title" }
 */
export const changedFields = (
  data: EditorArticleData,
  saved: EditorArticleData,
): Set<string> =>
  new Set(
    COMPARED_FIELDS.filter(
      (name) =>
        JSON.stringify(normalise(data[name])) !==
        JSON.stringify(normalise(saved[name])),
    ),
  );

/** Asked before putting back the last saved version */
export const RESET_QUESTION =
  "Reset this article to how it was last saved? Your changes will be lost.";

/**
 * The article form: title and body, with its configuration (type, status, slug, date, author, excerpt, thumbnail, tags
 * and attachments) beside it. The body can be edited as rich text ("WYSIWYG") or Markdown, or previewed as the website
 * would show the article with its type's "single" template. Saving a changed type or slug moves the article's folder.
 * Fields changed since the last save are marked with an asterisk, and "Reset…" puts back the last saved version.
 *
 * Fires `article-saved` (detail: the article's location), `article-deleted`, and `blog-toast` for success and error
 * messages (see `showToast`).
 *
 * @example
 * html`<blog-article .api=${api} .article=${article} .typeOptions=${[{ value: "article", label: "Article" }]}></blog-article>`
 */
export class BlogArticle extends LitElement {
  static override properties = {
    api: { attribute: false },
    article: { attribute: false },
    typeOptions: { attribute: false },
    data: { state: true },
    files: { state: true },
    location: { state: true },
    busy: { state: true },
    message: { state: true },
    error: { state: true },
    templates: { state: true },
    mode: { state: true },
    bodyMarkdown: { state: true },
    previewUrl: { state: true },
    savedData: { state: true },
    bodyChanged: { state: true },
  };

  declare api: EditorApi;
  /** The loaded article, or undefined for a new one */
  declare article?: EditorArticle | undefined;
  /** Article types to choose from */
  declare typeOptions: FieldOption[];

  declare data: EditorArticleData;
  /** Files in the article's folder */
  declare files: string[];
  /** Where the article is saved (undefined until a new article is first saved) */
  declare location?: ArticleLocation | undefined;
  declare busy: boolean;
  declare message: string;
  declare error: string;
  /** Template names for the article's type */
  declare templates: string[];
  /** How the body is shown */
  declare mode: BodyMode;
  /** The body's Markdown, while edited in Markdown mode */
  declare bodyMarkdown: string;
  /** The URL of the article as the website would show it (a temporary page), in Preview mode */
  declare previewUrl: string;
  /** The data as last saved (or loaded; empty for a new article), which changes are found against */
  declare savedData: EditorArticleData;
  /** Whether the body differs from the saved one, compared as Markdown */
  declare bodyChanged: boolean;

  /** How long to wait after a body edit before checking whether it changed, in ms (replaceable for tests) */
  bodyCheckDelay = 300;

  /** The saved body as Markdown (undefined until known; a new article's is empty) */
  private savedBodyMarkdown?: string | undefined = "";

  /** Counts body checks and saved-body updates, so only the latest one is used */
  private bodyChecks = 0;
  private savedBodies = 0;

  /** The waiting body check, if any */
  private bodyTimer?: ReturnType<typeof setTimeout> | undefined;

  /** The type whose templates were last loaded */
  private templatesType = "";

  /** Asks to confirm deleting or resetting (replaceable for tests) */
  confirm: (message: string) => boolean = (message) => window.confirm(message);

  constructor() {
    super();
    this.typeOptions = [];
    this.data = newArticleData();
    this.files = [];
    this.busy = false;
    this.message = "";
    this.error = "";
    this.templates = [];
    this.mode = "wysiwyg";
    this.bodyMarkdown = "";
    this.previewUrl = "";
    // A copy, so both have the same date
    this.savedData = structuredClone(this.data);
    this.bodyChanged = false;
  }

  protected override createRenderRoot() {
    return this;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("article")) {
      const { files, ...data }: EditorArticle = this.article ?? {
        ...newArticleData(),
        files: [],
      };
      this.data = data;
      this.files = files;
      this.location = this.article
        ? { type: this.article.type, slug: this.article.slug }
        : undefined;
      this.message = "";
      this.error = "";
      this.mode = "wysiwyg";
      this.savedData = structuredClone(data);
      this.bodyChanged = false;
      // A new article's body is empty
      void this.rememberBody(data.bodyHtml, this.article ? undefined : "");
    }
    // Load the templates for the article's type when it changes
    if (this.api && this.data.type !== this.templatesType) {
      const type = this.data.type;
      this.templatesType = type;
      this.api.templates(type).then(
        (templates) => {
          if (this.data.type === type) this.templates = templates;
        },
        () => {
          if (this.data.type === type) this.templates = [];
        },
      );
    }
  }

  /** The URL a file in the saved article folder is served at */
  private fileUrl(name: string | undefined) {
    if (!name || !this.location || /^[a-z][a-z0-9+.-]*:/i.test(name))
      return name;
    return `/files/${this.location.type}/${this.location.slug}/${name}`;
  }

  /** Run an API call, showing errors and a busy state */
  private async run<T>(action: () => Promise<T>): Promise<T | undefined> {
    this.busy = true;
    this.error = "";
    this.message = "";
    try {
      return await action();
    } catch (error) {
      this.error = (error as Error).message;
      showToast(this, { kind: "error", message: this.error });
      return undefined;
    } finally {
      this.busy = false;
    }
  }

  /**
   * Upload a file into the article's folder. Returns the saved file name.
   */
  private async upload(file: File): Promise<string | undefined> {
    const location = this.location;
    if (!location) return undefined;
    const result = await this.run(() => this.api.upload(location, file));
    if (result && !this.files.includes(result.name))
      this.files = [...this.files, result.name].sort();
    return result?.name;
  }

  /** Images inserted into the body are uploaded and shown from the article folder */
  private readonly uploadImage = async (file: File) => {
    const name = await this.upload(file);
    if (!name) throw new Error("Upload failed");
    return this.fileUrl(name) as string;
  };

  /** Embed blocks in the body preview their embeds as the website shows them */
  private readonly loadEmbedPreview = (url: string) =>
    this.api.embedPreview(url);

  /** Apply a field change */
  private onFieldChange(event: CustomEvent<FieldChange>) {
    const { name, value } = event.detail;
    if (name === "bodyMarkdown") this.bodyMarkdown = value;
    else this.data = applyFieldChange(this.data, name, value);
    if (name === "body" || name === "bodyMarkdown") this.scheduleBodyCheck();
  }

  /** The body as Markdown now: as typed in Markdown mode, otherwise converted from the rich text by the server */
  private async currentBodyMarkdown(): Promise<string> {
    return this.mode === "markdown"
      ? this.bodyMarkdown
      : this.api.toMarkdown(this.data.bodyHtml, this.location);
  }

  /** Check whether the body changed once editing pauses */
  private scheduleBodyCheck(): void {
    clearTimeout(this.bodyTimer);
    this.bodyTimer = setTimeout(
      () => void this.checkBody(),
      this.bodyCheckDelay,
    );
  }

  /**
   * Check now whether the body differs from the saved one. Leaves `bodyChanged` as it is if the body can't be converted
   * or the saved body isn't known yet.
   */
  private async checkBody(): Promise<void> {
    clearTimeout(this.bodyTimer);
    const check = ++this.bodyChecks;
    const markdown = await this.currentBodyMarkdown().catch(() => undefined);
    if (
      check !== this.bodyChecks ||
      markdown === undefined ||
      this.savedBodyMarkdown === undefined
    )
      return;
    this.bodyChanged = markdown !== this.savedBodyMarkdown;
  }

  /**
   * Remember a body as the saved one, as Markdown (converted from its HTML unless given), then check the current body
   * against it.
   */
  private async rememberBody(html: string, markdown?: string): Promise<void> {
    const saved = ++this.savedBodies;
    let converted = markdown;
    try {
      converted ??= await this.api.toMarkdown(html, this.location);
    } catch {
      // The body can't be compared until it is saved
    }
    if (saved !== this.savedBodies) return;
    this.savedBodyMarkdown = converted;
    await this.checkBody();
  }

  /** Whether any field or the body differs from the saved article (as last checked) */
  get dirty(): boolean {
    return (
      this.bodyChanged || changedFields(this.data, this.savedData).size > 0
    );
  }

  /**
   * Whether the article has changes that aren't saved, checking the body first (as its last check may be waiting).
   */
  async hasChanges(): Promise<boolean> {
    await this.checkBody();
    return this.dirty;
  }

  /** Upload a file chosen in a file field and set the field to its name */
  private async onFieldFile(event: CustomEvent<File>) {
    const field = (event.target as HTMLElement & { name: string }).name;
    const name = await this.upload(event.detail);
    if (name) this.data = applyFieldChange(this.data, field, name);
  }

  /**
   * Bring the body's HTML up to date with its Markdown, when it is edited in Markdown mode. Returns whether it is up to
   * date (false if converting failed, which shows the error).
   */
  private async syncBody(): Promise<boolean> {
    if (this.mode !== "markdown") return true;
    const html = await this.run(() =>
      this.api.toHtml(this.bodyMarkdown, this.location),
    );
    if (html === undefined) return false;
    this.data = { ...this.data, bodyHtml: html };
    return true;
  }

  /**
   * Show the body another way: as rich text, as Markdown (converted from the rich text), or rendered as the website
   * would show the unsaved article. Stays in the current mode if converting or rendering fails, showing the error.
   */
  async setMode(mode: BodyMode): Promise<void> {
    if (mode === this.mode || !(await this.syncBody())) return;
    if (mode === "markdown") {
      const markdown = await this.run(() =>
        this.api.toMarkdown(this.data.bodyHtml, this.location),
      );
      if (markdown === undefined) return;
      this.bodyMarkdown = markdown;
    } else if (mode === "preview") {
      const url = await this.run(() =>
        this.api.preview(cleanArticleData(this.data), this.location),
      );
      if (url === undefined) return;
      this.previewUrl = url;
    }
    this.mode = mode;
  }

  /**
   * Save the article (creating or moving it as needed). Returns whether it was saved.
   */
  async save(): Promise<boolean> {
    if (!(await this.syncBody())) return false;
    const data = cleanArticleData(this.data);
    const from = this.location;
    const location = await this.run(() =>
      from ? this.api.save(from, data) : this.api.create(data),
    );
    if (!location) return false;
    this.data = data;
    this.savedData = structuredClone(data);
    this.location = location;
    this.message = "Saved";
    showToast(this, { kind: "success", message: this.message });
    this.bodyChanged = false;
    void this.rememberBody(
      data.bodyHtml,
      this.mode === "markdown" ? this.bodyMarkdown : undefined,
    );
    this.dispatchEvent(
      new CustomEvent<ArticleLocation>("article-saved", {
        detail: location,
        bubbles: true,
      }),
    );
    return true;
  }

  /**
   * Put back the last saved version of the article (or an empty one for a new article) after confirming. The body is
   * shown as rich text.
   */
  reset(): void {
    if (!this.confirm(RESET_QUESTION)) return;
    clearTimeout(this.bodyTimer);
    this.bodyChecks++;
    this.data = structuredClone(this.savedData);
    this.mode = "wysiwyg";
    this.bodyChanged = false;
    this.error = "";
    this.message = "Reset to the last saved version";
    showToast(this, { kind: "success", message: this.message });
  }

  /**
   * Delete the article after confirming.
   */
  async deleteArticle(): Promise<void> {
    const location = this.location;
    if (
      !location ||
      !this.confirm(`Delete "${this.data.title}" and all its files?`)
    )
      return;
    const deleted = await this.run(async () => {
      await this.api.remove(location);
      return true;
    });
    if (!deleted) return;
    showToast(this, {
      kind: "success",
      message: `Deleted "${this.data.title}"`,
    });
    this.dispatchEvent(new CustomEvent("article-deleted", { bubbles: true }));
  }

  /** Whether a field or group differs from the saved article */
  private isChanged(name: string): boolean {
    return changedFields(this.data, this.savedData).has(name);
  }

  /** Render the author fields */
  private renderAuthor() {
    const author = this.data.author;
    return html`<blog-article-data-group
      name="author"
      label="Author"
      ?changed=${this.isChanged("author")}
      allowclear
      @group-clear=${() => (this.data = { ...this.data, author: undefined })}
    >
      <blog-article-data-field
        name="author[name]"
        label="Name"
        placeholder="Defaults to the blog name"
        .value=${author?.name ?? ""}
      ></blog-article-data-field>
      <blog-article-data-field
        name="author[email]"
        type="email"
        label="Email address"
        .value=${author?.email ?? ""}
      ></blog-article-data-field>
      <blog-article-data-field
        name="author[url]"
        type="url"
        label="Homepage"
        placeholder="https://example.com"
        .value=${author?.url ?? ""}
      ></blog-article-data-field>
    </blog-article-data-group>`;
  }

  /** Render the tag fields */
  private renderTags() {
    return html`<blog-article-data-group
      name="tags"
      label="Tags"
      ?changed=${this.isChanged("tags")}
      multiple
      @group-add=${() => (this.data = { ...this.data, tags: [...this.data.tags, ""] })}
    >
      ${this.data.tags.map(
        (tag, i) =>
          html`<div class="tag">
            <blog-article-data-field
              name="tags[${i}]"
              .value=${tag}
            ></blog-article-data-field>
            <button
              type="button"
              class="remove"
              @click=${() =>
                (this.data = {
                  ...this.data,
                  tags: this.data.tags.filter((_, t) => t !== i),
                })}
            >
              Remove tag
            </button>
          </div>`,
      )}
    </blog-article-data-group>`;
  }

  /** Render the attachment fields */
  private renderAttachments() {
    const noUploads = !this.location;
    return html`<blog-article-data-group
      name="attachments"
      label="Attachments"
      ?changed=${this.isChanged("attachments")}
      multiple
      @group-add=${() =>
        (this.data = {
          ...this.data,
          attachments: [...this.data.attachments, { url: "" }],
        })}
    >
      ${this.data.attachments.map(
        (attachment, i) =>
          html`<blog-article-data-group name="attachments[${i}]">
            <blog-article-data-field
              name="attachments[${i}][url]"
              type="file"
              label="Upload file"
              accept="image/png, image/jpeg, image/gif, application/zip, application/pdf"
              .value=${attachment.url}
              preview
              .previewUrl=${this.fileUrl(attachment.url)}
              allowchange
              ?disabled=${noUploads}
            ></blog-article-data-field>
            <blog-article-data-field
              name="attachments[${i}][url]"
              type="text"
              label="File name or link"
              placeholder="https://example.com/file.pdf"
              .value=${attachment.url}
            ></blog-article-data-field>
            <blog-article-data-field
              name="attachments[${i}][name]"
              label="Name"
              placeholder="Defaults to the file name"
              .value=${attachment.name ?? ""}
              allowclear
            ></blog-article-data-field>
            <button
              type="button"
              class="remove"
              @click=${() =>
                (this.data = {
                  ...this.data,
                  attachments: this.data.attachments.filter((_, a) => a !== i),
                })}
            >
              Remove attachment
            </button>
          </blog-article-data-group>`,
      )}
    </blog-article-data-group>`;
  }

  /** Render the body in its mode, with the buttons switching modes */
  private renderBody() {
    let body;
    if (this.mode === "markdown")
      body = html`<blog-article-data-field
        name="bodyMarkdown"
        type="textarea"
        label="Body"
        rows="20"
        ?changed=${this.bodyChanged}
        .value=${this.bodyMarkdown}
      ></blog-article-data-field>`;
    else if (this.mode === "preview")
      // Served from the editor's own address, so the page loads its stylesheet, fonts and images like the website. It
      // isn't sandboxed (a sandboxed page can't load anything from 127.0.0.1): its server sends a Content Security
      // Policy that forbids scripts, which is what keeps it from using the editor's API (`PREVIEW_CSP`)
      body = html`<iframe
        class="preview"
        title="Preview"
        src=${this.previewUrl}
      ></iframe>`;
    else
      body = html`<blog-article-data-field
        name="body"
        type="richtext"
        label="Body"
        ?changed=${this.bodyChanged}
        .value=${this.data.bodyHtml}
        .uploadImage=${this.location ? this.uploadImage : undefined}
        .loadEmbedPreview=${this.loadEmbedPreview}
      ></blog-article-data-field>`;
    return html`<div class="body-modes" role="group" aria-label="Body mode">
        ${BODY_MODES.map(
          ({ mode, label }) =>
            html`<button
              type="button"
              data-mode=${mode}
              aria-pressed=${this.mode === mode ? "true" : "false"}
              ?disabled=${this.busy}
              @click=${() => void this.setMode(mode)}
            >
              ${label}
            </button>`,
        )}
      </div>
      ${body}`;
  }

  override render() {
    const { data } = this;
    const changed = changedFields(data, this.savedData);
    // The article's own type is always offered, even if it isn't configured
    const typeOptions = this.typeOptions.some(
      (option) => option.value === data.type,
    )
      ? this.typeOptions
      : [...this.typeOptions, { value: data.type, label: data.type }];
    return html`<form
      @field-change=${this.onFieldChange}
      @field-file=${(event: CustomEvent<File>) => void this.onFieldFile(event)}
      @submit=${(event: Event) => {
        event.preventDefault();
        void this.save();
      }}
    >
      <main>
        <blog-article-data-field
          name="title"
          label="Title"
          ?changed=${changed.has("title")}
          placeholder="New article title"
          .value=${data.title}
        ></blog-article-data-field>
        ${this.renderBody()}
      </main>
      <aside>
        <div class="blog-article-controls">
          <button type="submit" ?disabled=${this.busy}>Save</button>
          <button
            type="button"
            class="reset"
            ?disabled=${this.busy || !this.dirty}
            @click=${() => this.reset()}
          >
            Reset…
          </button>
          ${
            this.location
              ? html`<button
                  type="button"
                  class="delete"
                  ?disabled=${this.busy}
                  @click=${() => void this.deleteArticle()}
                >
                  Delete…
                </button>`
              : nothing
          }
        </div>
        <h2>Configuration</h2>
        <blog-article-data-field
          name="type"
          ?changed=${changed.has("type")}
          type="select"
          label="Type"
          .options=${typeOptions}
          .value=${data.type}
        ></blog-article-data-field>
        <blog-article-data-field
          name="template"
          ?changed=${changed.has("template")}
          type="select"
          label="Template"
          .options=${[
            ...new Set([
              "single",
              ...this.templates,
              data.template ?? "single",
            ]),
          ].map((template) => ({ value: template, label: template }))}
          .value=${data.template ?? "single"}
        ></blog-article-data-field>
        <blog-article-data-field
          name="status"
          ?changed=${changed.has("status")}
          type="select"
          label="Status"
          .options=${STATUS_OPTIONS}
          .value=${data.status}
        ></blog-article-data-field>
        <blog-article-data-field
          name="slug"
          ?changed=${changed.has("slug")}
          label="Slug"
          placeholder=${slugify(data.title) || "title-converted-to-slug"}
          .value=${data.slug}
        ></blog-article-data-field>
        <blog-article-data-field
          name="date"
          ?changed=${changed.has("date")}
          type="datetime-local"
          label="Publication date"
          .value=${toLocalInput(data.date)}
        ></blog-article-data-field>
        ${this.renderAuthor()}
        <blog-article-data-field
          name="excerpt"
          ?changed=${changed.has("excerpt")}
          type="textarea"
          label="Excerpt"
          placeholder="Defaults to the text before the read more break"
          .value=${data.excerpt ?? ""}
          allowclear
        ></blog-article-data-field>
        <blog-article-data-field
          name="thumbnail"
          ?changed=${changed.has("thumbnail")}
          type="file"
          label="Thumbnail"
          accept="image/png, image/jpeg"
          .value=${data.thumbnail ?? ""}
          preview
          .previewUrl=${this.fileUrl(data.thumbnail)}
          allowchange
          allowclear
          ?disabled=${!this.location}
        ></blog-article-data-field>
        ${this.renderTags()} ${this.renderAttachments()}
        ${this.location ? nothing : html`<p class="hint">Save the article before uploading files.</p>`}
        ${
          this.files.length
            ? html`<details class="files">
                <summary>
                  Files in this article's folder (${this.files.length})
                </summary>
                <ul>
                  ${this.files.map((file) => html`<li><a href=${this.fileUrl(file) as string} target="_blank">${file}</a></li>`)}
                </ul>
              </details>`
            : nothing
        }
      </aside>
    </form>`;
  }
}

defineElement("blog-article", BlogArticle);
