import { html, LitElement, nothing, type PropertyValues } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import { slugify } from "@lvl99dotcom/edaha.md/generator/slug";
import type {
  MetadataInfo,
  EditorArticle,
  EditorAuthor,
  SiteInfo,
  EditorArticleData,
  EditorAttachment,
  FileKind,
  FileSummary,
} from "../../../server/types/index.ts";
import type { FileChooser } from "../edaha-file-browser/index.ts";
import {
  ApiError,
  type ArticleLocation,
  type EditorApi,
} from "../../editorApi/index.ts";
import { fromLocalInput, toLocalInput } from "../../dates/index.ts";
import { defineElement } from "../define/index.ts";
import "../edaha-article-data-field/index.ts";
import "../edaha-article-data-group/index.ts";
import type {
  EdahaArticleDataField,
  FieldChange,
  FieldOption,
} from "../edaha-article-data-field/index.ts";
import { showToast } from "../edaha-toasts/index.ts";
import "../edaha-embed-dialog/index.ts";
import type { EdahaEmbedDialog } from "../edaha-embed-dialog/index.ts";
import { previewAddress, type EmbedTools } from "../../embeds/index.ts";
import "../edaha-metadata-field/index.ts";
import type { MetadataChange } from "../edaha-metadata-field/index.ts";
import {
  MetadataValidator,
  typeMetadataKeys,
  type MetadataDefinitions,
  type MetadataProblem,
  type MetadataSchema,
} from "@lvl99dotcom/edaha.md/generator/metadata";
import { setAt } from "../../metadataForm/index.ts";
import { icon } from "../../icons/index.ts";
import {
  BUILT_IN_GROUPS,
  type MetadataGroup,
} from "@lvl99dotcom/edaha.md/generator/metadataGroups";

const STATUS_OPTIONS: FieldOption[] = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "unlisted", label: "Unlisted" },
];

/** How the body is shown: the rich text editor, its Markdown in a text box, or rendered as the website would */
export type BodyMode = "wysiwyg" | "markdown" | "preview";

/** The body modes' tabs */
export const BODY_MODES: readonly { mode: BodyMode; label: string }[] = [
  { mode: "wysiwyg", label: "WYSIWYG" },
  { mode: "markdown", label: "Markdown" },
  { mode: "preview", label: "Preview" },
];

/** The widths the preview can be shown at: the panel's full width, or a narrower page centred in it */
export const PREVIEW_WIDTHS = [
  { value: "full", label: "Full", width: "100%" },
  { value: "900", label: "900px", width: "900px" },
  { value: "600", label: "600px", width: "600px" },
  { value: "320", label: "320px", width: "320px" },
] as const;

/** A width the preview can be shown at */
export type PreviewWidth = (typeof PREVIEW_WIDTHS)[number]["value"];

/** The id of a body mode's tab */
const bodyTabId = (mode: BodyMode) => `body-tab-${mode}`;

/**
 * The index of the tab a key moves focus to among `count` tabs, from the tab at `current`: the arrow keys move to the
 * previous or next tab (wrapping around), Home and End to the first or last. Undefined for other keys.
 *
 * @example
 * nextTabIndex("ArrowRight", 2, 3); // 0
 */
export const nextTabIndex = (
  key: string,
  current: number,
  count: number,
): number | undefined => {
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return undefined;
  }
};

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
    // Typing an author replaces "no author"
    const next = {
      name: "",
      ...(data.author || {}),
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
  "meta",
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
 * saved data. The body isn't compared, as its HTML is reformatted by the editor (see `EdahaArticle.bodyChanged`).
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

/** The settings the article form shows itself, by the keys the settings groups list them with */
const CORE_SETTINGS = [
  "type",
  "status",
  "slug",
  "date",
  "author",
  "tags",
  "excerpt",
  "template",
  "thumbnail",
  "attachments",
  "uploaded",
] as const;

/** A setting the article form shows itself */
type CoreSetting = (typeof CORE_SETTINGS)[number];

/** Whether a settings group's key is a setting the article form shows itself */
const isCoreSetting = (key: string): key is CoreSetting =>
  (CORE_SETTINGS as readonly string[]).includes(key);

/** Text read by screen readers only, e.g. which setting a Remove button removes */
const hiddenText = (text: string) =>
  html`<span class="visually-hidden">${text}</span>`;

/** The keys of the groups that start open */
const openedByDefault = (groups: readonly MetadataGroup[]) =>
  new Set(
    groups.filter((group) => group.openedByDefault).map((group) => group.key),
  );

/** Said when custom metadata values aren't valid */
export const METADATA_ERRORS =
  "Some values aren't valid. Fix the fields marked ⚠️ in the settings.";

/** Asked before putting back the last saved version */
export const RESET_QUESTION =
  "Reset this article to how it was last saved? Your changes will be lost.";

/**
 * The article form: title and body, with its configuration (type, status, slug, date, author, excerpt, thumbnail, tags
 * and attachments) beside it. The body can be edited as rich text ("WYSIWYG") or Markdown, or previewed as the website
 * would show the article with its type's "single" template. Saving a changed type or slug moves the article's folder.
 * Fields changed since the last save are marked with an asterisk, and "Reset…" puts back the last saved version.
 *
 * Fires `article-saved` (detail: the article's location), `article-deleted`, `edaha-toast` for success and error
 * messages (see `showToast`), and `focus-mode-change` (detail: whether focus mode should be on) from the focus mode
 * button at the top right of the title and body. In the compact layout (`compact`, see `edaha-editor`) the settings
 * open full screen from a bar at the bottom of the screen.
 *
 * @example
 * html`<edaha-article .api=${api} .article=${article} .typeOptions=${[{ value: "article", label: "Article" }]}></edaha-article>`
 */
export class EdahaArticle extends LitElement {
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
    previewWidth: { state: true },
    metadataOpen: { state: true },
    savedData: { state: true },
    bodyChanged: { state: true },
    metadata: { attribute: false },
    site: { attribute: false },
    metaProblems: { state: true },
    openGroups: { state: true },
    compact: { attribute: false },
    focusMode: { attribute: false },
    pickFile: { attribute: false },
    embedTools: { state: true },
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
  /** The width the preview is shown at */
  declare previewWidth: PreviewWidth;
  /** Whether the article's settings are open full screen (in the compact layout) */
  declare metadataOpen: boolean;
  /** The data as last saved (or loaded; empty for a new article), which changes are found against */
  declare savedData: EditorArticleData;
  /** Whether the body differs from the saved one, compared as Markdown */
  declare bodyChanged: boolean;
  /** The website's default authors: its own, and its types' (the website's name is assumed until it's known) */
  declare site?: SiteInfo | undefined;
  /** The custom metadata fields, and which each type uses (none without it) */
  declare metadata?: MetadataInfo | undefined;
  /** Errors in the custom metadata values, from checking them or from the last save */
  declare metaProblems: MetadataProblem[];
  /** The keys of the settings groups that are open */
  declare openGroups: Set<string>;
  /** Whether the editor's layout is compact (on narrow screens, or in focus mode) */
  declare compact: boolean;
  /** Whether focus mode is on */
  declare focusMode: boolean;
  /** Lets the user choose an existing file (e.g. in the file browser); without it, existing files can't be chosen */
  declare pickFile?:
    ((kind?: FileKind) => Promise<FileSummary | undefined>) | undefined;

  /** The site's embeds, the embed dialog and embed blocks' frames, once the embeds are loaded */
  declare embedTools?: EmbedTools | undefined;

  /** Whether the groups' open state has been set from the config file's groups */
  private groupsOpened = false;

  /** The errors the article was loaded or last saved with, which resetting shows again */
  private savedProblems: MetadataProblem[] = [];

  /** Validates custom metadata values, for the definitions it was made for */
  private validatorFor?:
    | { definitions: MetadataDefinitions; validator: MetadataValidator }
    | undefined;

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
    this.previewWidth = "full";
    this.metadataOpen = false;
    // A copy, so both have the same date
    this.savedData = structuredClone(this.data);
    this.bodyChanged = false;
    this.metaProblems = [];
    this.openGroups = openedByDefault(BUILT_IN_GROUPS);
    this.compact = false;
    this.focusMode = false;
  }

  protected override createRenderRoot() {
    return this;
  }

  /** Ask the editor to turn focus mode on or off */
  private toggleFocusMode(): void {
    this.dispatchEvent(
      new CustomEvent<boolean>("focus-mode-change", {
        detail: !this.focusMode,
        bubbles: true,
        composed: true,
      }),
    );
  }

  override connectedCallback(): void {
    super.connectedCallback();
    void this.loadEmbeds();
  }

  /** A new article starts with focus in its title, ready to type */
  protected override async firstUpdated(): Promise<void> {
    if (this.article) return;
    const title = this.querySelector<EdahaArticleDataField>(
      'edaha-article-data-field[name="title"]',
    );
    await title?.updateComplete;
    title?.querySelector("input")?.focus();
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    // Leaving the compact layout closes the settings, which are then always shown beside the body
    if (changed.get("compact") && !this.compact) this.metadataOpen = false;
    // Groups start as the config file says, once it's known; after that, as they were left
    if (changed.has("metadata") && this.metadata && !this.groupsOpened) {
      this.groupsOpened = true;
      this.openGroups = openedByDefault(this.metadata.groups);
    }
    // Groups with errors open, so the errors can be seen
    if (changed.has("metaProblems")) {
      const withErrors = this.groupsWithErrors();
      if ([...withErrors].some((key) => !this.openGroups.has(key)))
        this.openGroups = new Set([...this.openGroups, ...withErrors]);
    }
    if (changed.has("article")) {
      const {
        files,
        problems = [],
        ...data
      }: EditorArticle = this.article ?? {
        ...newArticleData(),
        files: [],
      };
      // Warnings are worked out as the article changes; errors stay until checked again
      this.savedProblems = problems.filter(({ level }) => level === "error");
      this.metaProblems = this.savedProblems;
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

  /**
   * The URL a file in the saved article folder is served at. Addresses and paths on the website (e.g. another
   * article's file) are served as they are.
   */
  private fileUrl(name: string | undefined) {
    if (!name || !this.location || /^([a-z][a-z0-9+.-]*:|\/)/i.test(name))
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
      // Saving refused because of metadata errors shows them on their fields
      if (error instanceof ApiError && error.problems)
        this.metaProblems = error.problems;
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

  /** Images inserted into the body's Markdown are uploaded and referred to by their file name in the article folder */
  private readonly uploadMarkdownImage = async (file: File) => {
    const name = await this.upload(file);
    if (!name) throw new Error("Upload failed");
    return name;
  };

  /**
   * Let the user choose an existing file, referred to by its name when it's in the article's own folder, or else by
   * its path on the website.
   */
  private readonly chooseFile: FileChooser = async (kind) => {
    const file = await this.pickFile?.(kind);
    if (!file) return undefined;
    const own =
      file.type === this.location?.type && file.slug === this.location.slug;
    return {
      url: own ? file.name : file.url,
      name: file.name,
      kind: file.kind,
    };
  };

  /** Files chosen for the rich text body are shown from the URL the editor serves them at */
  private readonly chooseBodyFile: FileChooser = async (kind) => {
    const file = await this.chooseFile(kind);
    return file && { ...file, url: this.fileUrl(file.url) as string };
  };

  /** The file choosers, while existing files can be chosen */
  private choosers() {
    return this.pickFile
      ? { file: this.chooseFile, body: this.chooseBodyFile }
      : { file: undefined, body: undefined };
  }

  /**
   * Load the site's embeds, for the body's embed blocks and the embed dialog. Without them (e.g. the API is
   * unreachable), embed blocks show as they are written and can't be added.
   */
  private async loadEmbeds(): Promise<void> {
    try {
      const embeds = await this.api.embeds();
      this.embedTools = {
        embeds,
        edit: async ({ key, content }, adding) => {
          // Only embeds the site has a plugin for can be added or changed
          const embed = embeds.find((info) => info.key === key);
          const dialog = this.querySelector(
            "edaha-embed-dialog",
          ) as EdahaEmbedDialog;
          const changed =
            embed &&
            (await dialog.edit(embed, content, adding, (value) =>
              this.api.validateEmbed(value.key, value.content),
            ));
          return changed === undefined ? undefined : { key, content: changed };
        },
        loadFrame: ({ key, content }) => this.api.embedFrame(key, content),
      };
    } catch {
      this.embedTools = undefined;
    }
  }

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
    // Invalid custom metadata values aren't saved
    const errors = this.metadataKeys().flatMap((key) =>
      this.checkMetadata(key),
    );
    if (errors.length) {
      this.metaProblems = errors;
      showToast(this, { kind: "error", message: METADATA_ERRORS });
      return false;
    }
    if (!(await this.syncBody())) return false;
    const data = cleanArticleData(this.data);
    const from = this.location;
    const location = await this.run(() =>
      from ? this.api.save(from, data) : this.api.create(data),
    );
    if (!location) return false;
    this.data = data;
    this.savedData = structuredClone(data);
    this.savedProblems = [];
    this.metaProblems = [];
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
    this.metaProblems = this.savedProblems;
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

  /** The validator for the custom metadata definitions, made once for them */
  private validator(): MetadataValidator {
    // Only used for the type's custom fields, so the definitions are there
    const { definitions } = this.metadata as MetadataInfo;
    if (this.validatorFor?.definitions !== definitions)
      this.validatorFor = {
        definitions,
        validator: new MetadataValidator(definitions),
      };
    return this.validatorFor.validator;
  }

  /** The custom metadata fields the article's type uses */
  metadataKeys(): string[] {
    return typeMetadataKeys(
      this.metadata?.definitions ?? {},
      this.metadata?.types[this.data.type],
    );
  }

  /** The errors in a custom metadata field's value (none when it has no value) */
  private checkMetadata(key: string): MetadataProblem[] {
    const value = this.data.meta?.[key];
    return value === undefined ? [] : this.validator().validate(key, value);
  }

  /** Change a custom metadata value (or a value inside one) */
  private onMetadataChange(event: CustomEvent<MetadataChange>) {
    const { path, value } = event.detail;
    this.data = {
      ...this.data,
      meta: setAt(this.data.meta, path.split("/"), value) as Record<
        string,
        unknown
      >,
    };
  }

  /** Check a custom metadata field once focus leaves it, saying so when errors are found */
  private onMetadataBlur(event: CustomEvent<string>) {
    const key = event.detail.split("/")[0] as string;
    const isKey = (problem: MetadataProblem) =>
      problem.path.split("/")[0] === key;
    const hadErrors = this.metaProblems.some(isKey);
    const errors = this.checkMetadata(key);
    this.metaProblems = [
      ...this.metaProblems.filter((problem) => !isKey(problem)),
      ...errors,
    ];
    if (errors.length && !hadErrors)
      showToast(this, { kind: "error", message: METADATA_ERRORS });
  }

  /** Remove one of the article's other settings (it's gone once the article is saved) */
  removeSetting(key: string): void {
    this.data = {
      ...this.data,
      meta: setAt(this.data.meta, [key], undefined) as Record<string, unknown>,
    };
  }

  /** Warnings about the article's other settings: values of fields its type doesn't use, and unknown settings */
  private metadataWarnings(): MetadataProblem[] {
    const keys = this.metadataKeys();
    const definitions = this.metadata?.definitions ?? {};
    return Object.keys(this.data.meta ?? {})
      .filter((key) => !keys.includes(key))
      .map((key) => ({
        path: key,
        message:
          key in definitions
            ? "isn't used by this article's type"
            : "isn't a known setting",
        level: "warning",
      }));
  }

  /** Whether a field or group differs from the saved article */
  private isChanged(name: string): boolean {
    return changedFields(this.data, this.savedData).has(name);
  }

  /** Render the author fields */
  /**
   * The author the article has when it doesn't name one: its type's default, or the website's (undefined for none).
   */
  defaultAuthor(): EditorAuthor | undefined {
    if (!this.site) return undefined;
    const typeDefault = this.site.types[this.data.type];
    if (typeDefault !== undefined) return typeDefault || undefined;
    return this.site.author;
  }

  /** Render the author fields, with a choice of no author at all */
  private renderAuthor() {
    const noAuthor = this.data.author === false;
    const author = noAuthor
      ? undefined
      : (this.data.author as EditorAuthor | undefined);
    const fallback = this.defaultAuthor();
    // The default's details apply only when the article has no author of its own
    const shown = author || noAuthor ? undefined : fallback;
    const namePlaceholder = noAuthor
      ? ""
      : !this.site
        ? "Defaults to the site name"
        : fallback
          ? `Defaults to ${fallback.name}`
          : "No author unless you name one";
    return html`<edaha-article-data-group
      name="author"
      label="Author"
      ?changed=${this.isChanged("author")}
      allowclear
      @group-clear=${() => (this.data = { ...this.data, author: undefined })}
    >
      <label class="no-author">
        <input
          type="checkbox"
          .checked=${noAuthor}
          @change=${(event: Event) =>
            (this.data = {
              ...this.data,
              author: (event.target as HTMLInputElement).checked
                ? false
                : undefined,
            })}
        />
        No author
      </label>
      <edaha-article-data-field
        name="author[name]"
        label="Name"
        placeholder=${namePlaceholder}
        ?disabled=${noAuthor}
        .value=${author?.name ?? ""}
      ></edaha-article-data-field>
      <edaha-article-data-field
        name="author[email]"
        type="email"
        label="Email address"
        placeholder=${shown?.email ?? ""}
        ?disabled=${noAuthor}
        .value=${author?.email ?? ""}
      ></edaha-article-data-field>
      <edaha-article-data-field
        name="author[url]"
        type="url"
        label="Homepage"
        placeholder=${shown?.url ?? "https://example.com"}
        ?disabled=${noAuthor}
        .value=${author?.url ?? ""}
      ></edaha-article-data-field>
    </edaha-article-data-group>`;
  }

  /** Render the tag fields */
  private renderTags() {
    return html`<edaha-article-data-group
      name="tags"
      label="Tags"
      ?changed=${this.isChanged("tags")}
      multiple
      @group-add=${() => (this.data = { ...this.data, tags: [...this.data.tags, ""] })}
    >
      ${this.data.tags.map(
        (tag, i) =>
          html`<div class="tag">
            <edaha-article-data-field
              name="tags[${i}]"
              .value=${tag}
            ></edaha-article-data-field>
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
    </edaha-article-data-group>`;
  }

  /** Render the attachment fields */
  private renderAttachments() {
    const noUploads = !this.location;
    return html`<edaha-article-data-group
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
          html`<edaha-article-data-group name="attachments[${i}]">
            <edaha-article-data-field
              name="attachments[${i}][url]"
              type="file"
              label="Upload file"
              accept="image/png, image/jpeg, image/gif, application/zip, application/pdf"
              .value=${attachment.url}
              preview
              .previewUrl=${this.fileUrl(attachment.url)}
              .chooseFile=${this.choosers().file}
              allowchange
              ?disabled=${noUploads}
            ></edaha-article-data-field>
            <edaha-article-data-field
              name="attachments[${i}][url]"
              type="text"
              label="File name or link"
              placeholder="https://example.com/file.pdf"
              .value=${attachment.url}
            ></edaha-article-data-field>
            <edaha-article-data-field
              name="attachments[${i}][name]"
              label="Name"
              placeholder="Defaults to the file name"
              .value=${attachment.name ?? ""}
              allowclear
            ></edaha-article-data-field>
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
          </edaha-article-data-group>`,
      )}
    </edaha-article-data-group>`;
  }

  /** Render the body in its mode, in a tab panel under the tabs that switch modes */
  private renderBody() {
    let body;
    if (this.mode === "markdown")
      body = html`<edaha-article-data-field
        name="bodyMarkdown"
        type="markdown"
        label="Body"
        ?changed=${this.bodyChanged}
        .value=${this.bodyMarkdown}
        .uploadImage=${this.location ? this.uploadMarkdownImage : undefined}
        .chooseFile=${this.choosers().file}
        .embedTools=${this.embedTools}
      ></edaha-article-data-field>`;
    else if (this.mode === "preview")
      // Served by the editor's server, so the page loads its stylesheet, fonts and images like the website, but from
      // the previews' own origin (`previewAddress`), which keeps it, and the embeds' scripts in it, from using the
      // editor's API; its Content Security Policy sandboxes it too (`previewCsp`)
      body = html`<div class="preview-controls">
          <label for="preview-width">Width</label>
          <select
            id="preview-width"
            @change=${(event: Event) =>
              (this.previewWidth = (event.target as HTMLSelectElement)
                .value as PreviewWidth)}
          >
            ${PREVIEW_WIDTHS.map(
              ({ value, label }) =>
                html`<option
                  value=${value}
                  ?selected=${this.previewWidth === value}
                >
                  ${label}
                </option>`,
            )}
          </select>
        </div>
        <div class="preview-frame">
          <iframe
            class="preview"
            title="Preview"
            src=${previewAddress(this.previewUrl)}
            style=${styleMap({
              // Only the frame's width changes: the page isn't rendered again
              width: PREVIEW_WIDTHS.find(
                ({ value }) => value === this.previewWidth,
              )?.width,
            })}
          ></iframe>
        </div>`;
    else
      body = html`<edaha-article-data-field
        name="body"
        type="richtext"
        label="Body"
        ?changed=${this.bodyChanged}
        .value=${this.data.bodyHtml}
        .uploadImage=${this.location ? this.uploadImage : undefined}
        .chooseFile=${this.choosers().body}
        .embedTools=${this.embedTools}
      ></edaha-article-data-field>`;
    return html`<div
        class="body-tabs"
        role="tablist"
        aria-label="Body"
        @keydown=${this.onTabKey}
      >
        ${BODY_MODES.map(
          ({ mode, label }) =>
            html`<button
              type="button"
              role="tab"
              id=${bodyTabId(mode)}
              data-mode=${mode}
              aria-selected=${this.mode === mode ? "true" : "false"}
              aria-controls="body-panel"
              tabindex=${this.mode === mode ? 0 : -1}
              ?disabled=${this.busy}
              @click=${() => void this.setMode(mode)}
            >
              ${label}
            </button>`,
        )}
      </div>
      <div
        class="body-panel body-panel-${this.mode}"
        id="body-panel"
        role="tabpanel"
        aria-labelledby=${bodyTabId(this.mode)}
      >
        ${body}
      </div>`;
  }

  /**
   * Move between the body's tabs with the arrow keys, Home and End. Enter or Space then shows the focused tab, as
   * showing one can take a moment (converting or rendering the body).
   */
  private onTabKey(event: KeyboardEvent): void {
    const tabs = [
      ...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(
        '[role="tab"]',
      ),
    ];
    const current = tabs.indexOf(event.target as HTMLElement);
    const next = nextTabIndex(event.key, current, tabs.length);
    if (next === undefined) return;
    event.preventDefault();
    tabs[next]?.focus();
  }

  /** The groups settings are shown in, in order (the built-in ones until the config file's are known) */
  private groups(): readonly MetadataGroup[] {
    return this.metadata?.groups ?? BUILT_IN_GROUPS;
  }

  /** The groups holding a custom field with errors */
  private groupsWithErrors(): Set<string> {
    const keys = new Set(
      this.metaProblems
        .filter(({ level }) => level === "error")
        .map(({ path }) => path.split("/")[0] as string),
    );
    return new Set(
      this.groups()
        .filter((group) => group.fields.some((field) => keys.has(field)))
        .map((group) => group.key),
    );
  }

  /** Whether a setting differs from the saved article (custom ones by their own value) */
  private settingChanged(key: string, changed: Set<string>): boolean {
    if (changed.has(key)) return true;
    if (isCoreSetting(key)) return false;
    return (
      JSON.stringify(normalise(this.data.meta?.[key])) !==
      JSON.stringify(normalise(this.savedData.meta?.[key]))
    );
  }

  /** Render a core setting's field (or the files in the article's folder, "uploaded") */
  private renderSetting(
    key: CoreSetting,
    changed: Set<string>,
    typeOptions: FieldOption[],
  ) {
    const { data } = this;
    switch (key) {
      case "type":
        return html`<edaha-article-data-field
          name="type"
          ?changed=${changed.has("type")}
          type="select"
          label="Type"
          .options=${typeOptions}
          .value=${data.type}
        ></edaha-article-data-field>`;
      case "status":
        return html`<edaha-article-data-field
          name="status"
          ?changed=${changed.has("status")}
          type="select"
          label="Status"
          .options=${STATUS_OPTIONS}
          .value=${data.status}
        ></edaha-article-data-field>`;
      case "slug":
        return html`<edaha-article-data-field
          name="slug"
          ?changed=${changed.has("slug")}
          label="Slug"
          placeholder=${slugify(data.title) || "title-converted-to-slug"}
          .value=${data.slug}
        ></edaha-article-data-field>`;
      case "date":
        return html`<edaha-article-data-field
          name="date"
          ?changed=${changed.has("date")}
          type="datetime-local"
          label="Publication date"
          .value=${toLocalInput(data.date)}
        ></edaha-article-data-field>`;
      case "author":
        return this.renderAuthor();
      case "tags":
        return this.renderTags();
      case "excerpt":
        return html`<edaha-article-data-field
          name="excerpt"
          ?changed=${changed.has("excerpt")}
          type="textarea"
          label="Excerpt"
          placeholder="Defaults to the text before the read more break"
          .value=${data.excerpt ?? ""}
          allowclear
        ></edaha-article-data-field>`;
      case "template":
        return html`<edaha-article-data-field
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
        ></edaha-article-data-field>`;
      case "thumbnail":
        return html`<edaha-article-data-field
          name="thumbnail"
          ?changed=${changed.has("thumbnail")}
          type="file"
          label="Thumbnail"
          accept="image/png, image/jpeg"
          .value=${data.thumbnail ?? ""}
          preview
          .previewUrl=${this.fileUrl(data.thumbnail)}
          .chooseFile=${this.choosers().file}
          allowchange
          allowclear
          ?disabled=${!this.location}
        ></edaha-article-data-field>`;
      case "attachments":
        return this.renderAttachments();
      case "uploaded":
        return this.renderUploaded();
    }
  }

  /** Render the files in the article's folder, or that uploads need the article saved first */
  private renderUploaded() {
    if (!this.location)
      return html`<p class="hint">Save the article before uploading files.</p>`;
    if (!this.files.length) return nothing;
    return html`<div class="files">
      <h3 class="files-title">
        Files in this article's folder (${this.files.length})
      </h3>
      <ul>
        ${this.files.map((file) => html`<li><a href=${this.fileUrl(file) as string} target="_blank">${file}</a></li>`)}
      </ul>
    </div>`;
  }

  /** Render a custom field the article's type uses */
  private renderCustomField(key: string) {
    return html`<edaha-metadata-field
      path=${key}
      .schema=${(this.metadata as MetadataInfo).definitions[key] as MetadataSchema}
      .value=${this.data.meta?.[key]}
      .problems=${this.metaProblems}
      .uploadFile=${this.location ? this.uploadMarkdownImage : undefined}
      .chooseFile=${this.choosers().file}
      .fileUrl=${(name: string) => this.fileUrl(name)}
    ></edaha-metadata-field>`;
  }

  /**
   * Render the settings in their groups, as sections that open and close: each with its title (marked when a setting
   * in it changed, or a custom field in it has errors), its description, and its fields. Custom fields show for the
   * article's type only, and warnings about other settings show in the Custom group. Empty groups aren't shown.
   */
  private renderGroups(changed: Set<string>, typeOptions: FieldOption[]) {
    const customKeys = this.metadataKeys();
    const warnings = this.metadataWarnings();
    const withErrors = this.groupsWithErrors();
    return this.groups().map((group) => {
      const fields = group.fields
        .filter((key) => isCoreSetting(key) || customKeys.includes(key))
        .map((key) =>
          isCoreSetting(key)
            ? this.renderSetting(key, changed, typeOptions)
            : this.renderCustomField(key),
        )
        .filter((field) => field !== nothing);
      const groupWarnings = group.key === "custom" ? warnings : [];
      if (!fields.length && !groupWarnings.length) return nothing;
      const isChanged = group.fields.some((key) =>
        this.settingChanged(key, changed),
      );
      const hasErrors = withErrors.has(group.key);
      return html`<details
        class="settings-group ${classMap({ "has-errors": hasErrors })}"
        data-group=${group.key}
        ?open=${this.openGroups.has(group.key)}
        @toggle=${(event: Event) => {
          const open = (event.target as HTMLDetailsElement).open;
          const next = new Set(this.openGroups);
          if (open) next.add(group.key);
          else next.delete(group.key);
          this.openGroups = next;
        }}
      >
        <summary>
          ${group.title}${
            isChanged
              ? html`<span class="changed" title="Changed since it was saved"
                  >*</span
                >`
              : nothing
          }${
            hasErrors || groupWarnings.length
              ? html`<span class="settings-group-errors">
                  ⚠️<span class="visually-hidden">
                    ${hasErrors ? "has errors" : "has warnings"}</span
                  ></span
                >`
              : nothing
          }
        </summary>
        ${
          group.description
            ? html`<p class="settings-group-description">
                ${group.description}
              </p>`
            : nothing
        }
        ${fields}
        ${
          groupWarnings.length
            ? html`<ul class="metadata-warnings">
                ${groupWarnings.map(
                  ({ path, message }) =>
                    html`<li>
                      <span
                        >"${path}" ${message}; it is kept unless you remove
                        it.</span
                      >
                      <button
                        type="button"
                        class="btn btn-xs"
                        @click=${() => this.removeSetting(path)}
                      >
                        Remove${hiddenText(` "${path}"`)}
                      </button>
                    </li>`,
                )}
              </ul>`
            : nothing
        }
      </details>`;
    });
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
        @metadata-change=${this.onMetadataChange}
        @metadata-blur=${this.onMetadataBlur}
        @field-file=${(event: CustomEvent<File>) => void this.onFieldFile(event)}
        @submit=${(event: Event) => {
          event.preventDefault();
          void this.save();
        }}
      >
        <!-- Out of reach while the settings are open over it -->
        <main class="edaha-article-main" ?inert=${this.metadataOpen}>
          <div class="edaha-article-title">
            <edaha-article-data-field
              name="title"
              label="Title"
              ?changed=${changed.has("title")}
              placeholder="New article title"
              .value=${data.title}
            ></edaha-article-data-field>
            <!-- Only on wide screens: narrow screens always have the compact layout focus mode gives -->
            <button
              type="button"
              class="btn-icon btn-focus-mode"
              title="Focus mode"
              aria-pressed=${this.focusMode ? "true" : "false"}
              @click=${() => this.toggleFocusMode()}
            >
              ${icon(this.focusMode ? "fullscreen_exit" : "fullscreen")}<span
                class="visually-hidden"
                >Focus mode</span
              >
            </button>
          </div>
          ${
            // Files are saved in the article's folder, which it only has once saved
            this.location
              ? nothing
              : html`<p class="unsaved-notice">
                  ⚠️ Uploading images and attachments will require a title and
                  slug to be defined first
                </p>`
          }
          ${this.renderBody()}
        </main>
        <aside
          class="edaha-article-metadata ${classMap({ open: this.metadataOpen })}"
          aria-label="Article settings"
          @keydown=${(event: KeyboardEvent) => {
            if (event.key === "Escape") this.metadataOpen = false;
          }}
        >
          <!-- In the compact layout, a bar at the bottom of the screen that opens the settings full screen -->
          <div class="edaha-article-controls">
            <!-- Marked while there are unsaved changes, to show the article should be saved -->
            <button
              type="submit"
              class="btn btn-save ${classMap({ "btn-save-dirty": this.dirty })}"
              ?disabled=${this.busy}
            >
              Save
            </button>
            <button
              type="button"
              class="btn btn-reset"
              ?disabled=${this.busy || !this.dirty}
              @click=${() => this.reset()}
            >
              Reset…
            </button>
            ${
              this.location
                ? html`<button
                    type="button"
                    class="btn btn-delete"
                    ?disabled=${this.busy}
                    @click=${() => void this.deleteArticle()}
                  >
                    Delete…
                  </button>`
                : nothing
            }
            <button
              type="button"
              class="btn btn-metadata-toggle"
              title=${this.metadataOpen ? "Hide article settings" : "Show article settings"}
              aria-expanded=${this.metadataOpen ? "true" : "false"}
              aria-controls="article-metadata-fields"
              @click=${() => (this.metadataOpen = !this.metadataOpen)}
            >
              <span aria-hidden="true">${this.metadataOpen ? "︾" : "︽"}</span>
              <span class="visually-hidden">Article settings</span>
            </button>
          </div>
          <div
            class="edaha-article-metadata-fields"
            id="article-metadata-fields"
          >
            ${this.renderGroups(changed, typeOptions)}
          </div>
        </aside>
      </form>
      <!-- Outside the form, as it has its own -->
      <edaha-embed-dialog></edaha-embed-dialog>`;
  }
}

defineElement("edaha-article", EdahaArticle);
