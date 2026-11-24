import { html, LitElement, nothing } from "lit";
import type { FilesUploadTo } from "@lvl99dotcom/edaha.md/generator/config";
import {
  fileFolderName,
  isShared,
  SHARED_FILES_TYPE,
  type ArticleOrder,
  type ArticleTypeLabels,
  type FileChange,
  type FileFilters,
  type FileKind,
  type FilePage,
  type FileSort,
  type FileSummary,
  type UploadResult,
} from "../../../server/types/index.ts";
import type {
  ArticleLocation,
  EditorApi,
  FileLocation,
} from "../../editorApi/index.ts";
import { icon } from "../../icons/index.ts";
import {
  FILE_KIND_ICONS,
  FILE_KINDS,
  formatFileSize,
} from "../../fileLabels/index.ts";
import { nextSort, sortHeading } from "../../sortTable/index.ts";
import { ARTICLE_CHOOSE_EVENT } from "../edaha-article-browser/index.ts";
import { defineElement } from "../define/index.ts";
import "../edaha-file-conflict/index.ts";
import {
  saveResolvingConflicts,
  type EdahaFileConflict,
} from "../edaha-file-conflict/index.ts";

export { FILE_KIND_ICONS, FILE_KINDS, formatFileSize };

/** The results' sortable columns (Operations isn't sortable) */
export const FILE_COLUMNS: readonly { sort: FileSort; label: string }[] = [
  { sort: "name", label: "Name" },
  { sort: "kind", label: "Type" },
  { sort: "size", label: "Size" },
  { sort: "location", label: "Location" },
];

/** The event fired after files are uploaded, moved, replaced or deleted (detail: the file and what changed) */
export const FILES_CHANGED_EVENT = "files-changed";

/** Detail of the `files-changed` event */
export interface FilesChanged extends FileChange {
  /** The file that was replaced, deleted or moved, or the folder files were uploaded to (as an uploaded file) */
  file: FileLocation;
}

/** Lets the user choose an article (e.g. to upload or move a file to); undefined if none was chosen */
export type ArticleChooser = () => Promise<ArticleLocation | undefined>;

/** A file chosen for an article: how the article refers to it, its name, and its kind */
export interface ChosenFile {
  /** How the article refers to it (or, in the rich text editor, the URL showing it) */
  url: string;
  name: string;
  kind: FileKind;
}

/** Lets the user choose an existing file (first showing files of a kind, if given); undefined if none was chosen */
export type FileChooser = (kind?: FileKind) => Promise<ChosenFile | undefined>;

/**
 * The kind of files a file input's `accept` takes, when it only takes images.
 *
 * @example
 * acceptedKind("image/png, image/jpeg"); // "image"
 * acceptedKind("image/png, application/pdf"); // undefined
 */
export const acceptedKind = (accept = ""): FileKind | undefined =>
  accept && accept.split(",").every((type) => type.trim().startsWith("image/"))
    ? "image"
    : undefined;

/** "1 article" or "2 articles" */
const articles = (count: number) =>
  `${count} ${count === 1 ? "article" : "articles"}`;

/**
 * The file browser: a dialog listing the files in the articles' folders, 50 at a time, found by name and filtered by
 * kind and article type, in a table whose column headings sort it. Each file can be opened, its website path copied,
 * replaced with another file, or deleted; replacing and deleting update references to it in every article, and fire
 * `files-changed` (detail: {@link FilesChanged}). Files in the articles' folders can be moved to the shared files
 * folder, and any file into an article's folder (chosen with `pickArticle`). Upload file uploads files where the
 * config file's `files.uploadTo` says: the shared files folder, or the open `article`'s folder (or one chosen). A file
 * with the same name where a file goes is resolved with the file conflict dialog. A file's location (its article)
 * closes the browser and fires `article-choose` (detail: the article's location), unless clicked with a modifier key.
 * Rendered in the light DOM.
 *
 * Opened with `pick`, it also lets the user choose a file (e.g. to insert into an article), and gives the chosen file.
 *
 * @example
 * html`<edaha-file-browser .api=${api} .types=${types}></edaha-file-browser>`
 * browser.show();
 * const file = await browser.pick("image");
 */
export class EdahaFileBrowser extends LitElement {
  static override properties = {
    api: { attribute: false },
    types: { attribute: false },
    uploadTo: { attribute: false },
    article: { attribute: false },
    pickArticle: { attribute: false },
    search: { state: true },
    kind: { state: true },
    type: { state: true },
    sort: { state: true },
    order: { state: true },
    page: { state: true },
    result: { state: true },
    filters: { state: true },
    loading: { state: true },
    message: { state: true },
    error: { state: true },
    picking: { state: true },
  };

  declare api: EditorApi;
  /** The configured article types' labels */
  declare types: Record<string, ArticleTypeLabels>;
  /** Where uploads go (the config file's `files.uploadTo`) */
  declare uploadTo: FilesUploadTo;
  /** The article open in the editor, which uploads go to when they go to articles' folders */
  declare article?: ArticleLocation | undefined;
  /** Lets the user choose an article to move a file or upload files to (moving to articles needs it) */
  declare pickArticle?: ArticleChooser | undefined;

  declare search: string;
  declare kind: string;
  declare type: string;
  /** The column the results are sorted by (undefined: by location, then name) */
  declare sort?: FileSort | undefined;
  declare order?: ArticleOrder | undefined;
  declare page: number;
  /** The files found, once loaded */
  declare result?: FilePage | undefined;
  declare filters: FileFilters;
  declare loading: boolean;
  /** What the last operation did, e.g. "Copied /news/hello/photo.png" */
  declare message: string;
  declare error: string;
  /** While choosing a file with `pick`: gives the chosen file (or undefined) */
  declare picking?: ((file?: FileSummary) => void) | undefined;

  /** How long to wait after typing in the search before searching, in ms (replaceable for tests) */
  searchDelay = 250;

  /** Asks to confirm replacing or deleting (replaceable for tests) */
  confirm: (message: string) => boolean = (message) => window.confirm(message);

  /**
   * Copy text to the clipboard: with the Clipboard API, or where it isn't allowed, by selecting the text in a hidden
   * text box inside the dialog (the page behind it can't be focused). Rejects if neither works.
   */
  copy = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Try selecting it instead
    }
    const box = document.createElement("textarea");
    box.value = text;
    box.className = "visually-hidden";
    box.setAttribute("aria-hidden", "true");
    (this.dialog ?? this).append(box);
    box.select();
    const copied = document.execCommand("copy");
    box.remove();
    if (!copied) throw new Error("Can't copy");
  };

  /** The waiting search, if any */
  private searchTimer?: ReturnType<typeof setTimeout> | undefined;

  /** Counts searches, so only the latest one's result is shown */
  private searches = 0;

  /** The file being replaced, while its replacement is chosen */
  private replacing?: FileSummary | undefined;

  constructor() {
    super();
    this.types = {};
    this.uploadTo = "article";
    this.search = "";
    this.kind = "";
    this.type = "";
    this.page = 1;
    this.filters = { kinds: [], types: [] };
    this.loading = false;
    this.message = "";
    this.error = "";
  }

  protected override createRenderRoot() {
    return this;
  }

  /** The dialog, once rendered */
  private get dialog(): HTMLDialogElement | null {
    return this.querySelector("dialog");
  }

  /** The file conflict dialog, once rendered */
  private get conflictDialog(): EdahaFileConflict {
    return this.querySelector("edaha-file-conflict") as EdahaFileConflict;
  }

  /** Whether the browser is open */
  get open(): boolean {
    return this.dialog?.open ?? false;
  }

  /** Open the browser with its filters cleared, on the first page, with focus in the search field */
  async show(): Promise<void> {
    this.finishPicking();
    await this.openWith("");
  }

  /** Open the browser with its filters cleared but for the kind, on the first page, with focus in the search field */
  private async openWith(kind: FileKind | ""): Promise<void> {
    this.search = "";
    this.kind = kind;
    this.type = "";
    this.page = 1;
    this.message = "";
    await this.updateComplete;
    if (!this.open) this.dialog?.showModal();
    this.querySelector<HTMLInputElement>("#file-browser-search")?.focus();
    await Promise.all([this.loadFilters(), this.load()]);
  }

  /**
   * Open the browser to choose a file (first showing files of a kind, if given). Resolves with the chosen file, or
   * undefined if the browser is closed without choosing one.
   *
   * @example
   * const image = await browser.pick("image");
   */
  async pick(kind: FileKind | "" = ""): Promise<FileSummary | undefined> {
    this.finishPicking();
    const chosen = new Promise<FileSummary | undefined>(
      (resolve) => (this.picking = resolve),
    );
    await this.openWith(kind);
    return chosen;
  }

  /** Stop choosing a file, giving the chosen one (or undefined) */
  private finishPicking(file?: FileSummary): void {
    const picking = this.picking;
    this.picking = undefined;
    picking?.(file);
  }

  /** Choose a file while picking, closing the browser */
  private chooseFile(file: FileSummary): void {
    this.finishPicking(file);
    this.close();
  }

  /**
   * Open a file's article in the editor, closing the browser, when its location is clicked; a click with a modifier
   * key (or another button) is left to the browser, e.g. to open it in a new tab.
   */
  private onLocationClick(event: MouseEvent, { type, slug }: FileSummary) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    this.finishPicking();
    this.close();
    this.dispatchEvent(
      new CustomEvent<ArticleLocation>(ARTICLE_CHOOSE_EVENT, {
        detail: { type, slug },
        bubbles: true,
      }),
    );
  }

  /** Close the browser */
  close(): void {
    clearTimeout(this.searchTimer);
    if (this.open) this.dialog?.close();
  }

  /** Load the filters' choices (keeping the last ones if it fails) */
  private async loadFilters(): Promise<void> {
    try {
      this.filters = await this.api.fileFilters();
    } catch {
      // The filters keep their last choices
    }
  }

  /** Find the files for the current search, filters, sort and page */
  async load(): Promise<void> {
    clearTimeout(this.searchTimer);
    const search = ++this.searches;
    this.loading = true;
    try {
      const result = await this.api.queryFiles({
        search: this.search,
        kind: (this.kind || undefined) as FileKind | undefined,
        type: this.type,
        sort: this.sort,
        order: this.order,
        page: this.page,
      });
      if (search !== this.searches) return;
      this.result = result;
      this.error = "";
    } catch (error) {
      if (search !== this.searches) return;
      this.error = (error as Error).message;
    }
    this.loading = false;
  }

  /** Change a filter, going back to the first page */
  private choose(name: "kind" | "type", value: string) {
    this[name] = value;
    this.page = 1;
    this.message = "";
    void this.load();
  }

  /** Search once typing pauses, from the first page */
  private onSearch(value: string) {
    this.search = value;
    this.page = 1;
    this.message = "";
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.load(), this.searchDelay);
  }

  /** Sort by a column (see `nextSort`), going back to the first page */
  private sortBy(column: FileSort) {
    ({ sort: this.sort, order: this.order } = nextSort(
      { sort: this.sort, order: this.order },
      column,
    ));
    this.page = 1;
    this.message = "";
    void this.load();
  }

  /** Show another page, from its top */
  private async goTo(page: number) {
    this.page = page;
    this.message = "";
    await this.load();
    this.querySelector(".file-browser-results")?.scrollTo?.(0, 0);
  }

  /** Show what an operation did, or its error */
  private report(message: string, error = "") {
    this.message = message;
    this.error = error;
  }

  /** Copy a file's path on the website */
  async copyUrl(file: FileSummary): Promise<void> {
    try {
      await this.copy(file.url);
      this.report(`Copied ${file.url}`);
    } catch {
      this.report("", `Couldn't copy ${file.url}`);
    }
  }

  /** Choose a file to replace another with (it is replaced once chosen) */
  private chooseReplacement(file: FileSummary) {
    this.replacing = file;
    const input = this.querySelector<HTMLInputElement>(
      "#file-browser-replacement",
    );
    input?.click();
  }

  /** Tell the editor files changed (see `FilesChanged`), and show the files again */
  private async changed(file: FileLocation, change: FileChange) {
    this.dispatchEvent(
      new CustomEvent<FilesChanged>(FILES_CHANGED_EVENT, {
        detail: { file, ...change },
        bubbles: true,
      }),
    );
    await Promise.all([this.loadFilters(), this.load()]);
  }

  /**
   * Replace a file with another, after confirming (saying how many articles refer to it, which then refer to the new
   * file if its name differs).
   */
  async replace(file: FileSummary, replacement: File): Promise<void> {
    try {
      const references = await this.api.fileReferences(file);
      if (
        !this.confirm(
          `Replace ${file.name} in ${fileFolderName(file)} with ${replacement.name}?${references.length ? ` ${articles(references.length)} will refer to the new file if its name differs.` : ""}`,
        )
      )
        return;
      const change = await this.api.replaceFile(file, replacement);
      this.report(
        change.name === file.name
          ? `Replaced ${file.name}`
          : `Replaced ${file.name} with ${change.name as string}${change.articles.length ? `, updating ${articles(change.articles.length)}` : ""}`,
      );
      await this.changed(file, change);
    } catch (error) {
      this.report("", (error as Error).message);
    }
  }

  /**
   * Delete a file after confirming (saying how many articles refer to it, which then don't).
   */
  async delete(file: FileSummary): Promise<void> {
    try {
      const references = await this.api.fileReferences(file);
      if (
        !this.confirm(
          `Delete ${file.name} from ${fileFolderName(file)}?${references.length ? ` It will also be removed from ${articles(references.length)}.` : ""}`,
        )
      )
        return;
      const change = await this.api.deleteFile(file);
      this.report(
        `Deleted ${file.name}${change.articles.length ? `, updating ${articles(change.articles.length)}` : ""}`,
      );
      await this.changed(file, change);
    } catch (error) {
      this.report("", (error as Error).message);
    }
  }

  /** The conflict dialog's options for a file being moved or uploaded */
  private conflictOptions(action: "move" | "upload", incomingUrl?: string) {
    return {
      action,
      incomingUrl,
      address: (url: string) => this.api.url(url),
      // Renaming the existing file changed its references
      onExistingRenamed: (
        existing: FileLocation,
        { articles }: { articles: ArticleLocation[] },
      ) => void this.changed(existing, { articles }),
    };
  }

  /**
   * Choose files to upload: the file chooser opens at once (browsers only allow that straight after a click), and the
   * files are uploaded once chosen (see `upload`).
   */
  private chooseUploads() {
    this.querySelector<HTMLInputElement>("#file-browser-upload")?.click();
  }

  /**
   * Upload files where the config file says: the shared files folder, or the open article's folder (or, without one,
   * an article the user chooses). A file with the name of one already there is resolved with the conflict dialog.
   */
  async upload(files: File[]): Promise<void> {
    let article: ArticleLocation | undefined;
    if (this.uploadTo === "article") {
      article = this.article ?? (await this.pickArticle?.());
      if (!article) return;
    }
    const uploaded: UploadResult[] = [];
    let failure = "";
    try {
      for (const file of files) {
        const incomingUrl = file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined;
        try {
          const result = await saveResolvingConflicts(
            this.conflictDialog,
            this.api,
            (options) => this.api.upload(article, file, options),
            this.conflictOptions("upload", incomingUrl),
          );
          if (result) uploaded.push(result);
        } finally {
          if (incomingUrl) URL.revokeObjectURL(incomingUrl);
        }
      }
    } catch (error) {
      failure = (error as Error).message;
    }
    const [first] = uploaded;
    // The files shown again first, so what happened is reported after
    if (first) await this.changed(first, { articles: [] });
    if (failure) this.report("", failure);
    else if (first)
      this.report(
        uploaded.length === 1
          ? `Uploaded ${first.name} to ${fileFolderName(first)}`
          : `Uploaded ${uploaded.length} files to ${fileFolderName(first)}`,
      );
  }

  /**
   * Move a file into an article's folder or the shared files folder (`{ type: "@shared", slug: "" }`), updating
   * references to it. A file with its name there is resolved with the conflict dialog.
   */
  async move(file: FileSummary, to: ArticleLocation): Promise<void> {
    try {
      const moved = await saveResolvingConflicts(
        this.conflictDialog,
        this.api,
        (options) => this.api.moveFile(file, to, options),
        this.conflictOptions("move"),
      );
      if (!moved) return;
      const count = moved.articles.length;
      this.report(
        `Moved ${file.name} to ${fileFolderName(moved)}${moved.name === file.name ? "" : ` as ${moved.name}`}${count ? `, updating ${articles(count)}` : ""}`,
      );
      // The article it went into has another file
      await this.changed(file, {
        name: moved.name,
        articles: isShared(moved)
          ? moved.articles
          : [...moved.articles, { type: moved.type, slug: moved.slug }],
      });
    } catch (error) {
      this.report("", (error as Error).message);
    }
  }

  /** Move a file into the folder of an article the user chooses */
  private async moveToArticle(file: FileSummary) {
    const article = await this.pickArticle?.();
    if (article) await this.move(file, article);
  }

  /** Render a select filter with an "any" choice first */
  private renderSelect(
    name: "kind" | "type",
    label: string,
    any: string,
    options: readonly { value: string; label: string }[],
  ) {
    const id = `file-browser-${name}`;
    return html`<div class="article-browser-field">
      <label for=${id}>${label}</label>
      <select
        id=${id}
        @change=${(event: Event) =>
          this.choose(name, (event.target as HTMLSelectElement).value)}
      >
        <option value="" ?selected=${!this[name]}>${any}</option>
        ${options.map(
          (option) =>
            html`<option
              value=${option.value}
              ?selected=${this[name] === option.value}
            >
              ${option.label}
            </option>`,
        )}
      </select>
    </div>`;
  }

  /**
   * Render an operation's icon button, named for screen readers and as a tooltip, with a class for its purpose (e.g.
   * "delete" gives `btn-delete`)
   */
  private renderOperation(
    purpose: string,
    label: string,
    name: Parameters<typeof icon>[0],
    run: () => unknown,
  ) {
    return html`<button
      type="button"
      class="btn btn-icon btn-${purpose}"
      title=${label}
      @click=${run}
    >
      ${icon(name)}<span class="visually-hidden">${label}</span>
    </button>`;
  }

  /** Render the found files as a table */
  private renderResults() {
    const result = this.result;
    if (!result) return nothing;
    if (!result.files.length)
      return html`<p class="article-browser-empty">No files found.</p>`;
    const kindLabels = Object.fromEntries(
      FILE_KINDS.map(({ value, label }) => [value, label]),
    ) as Record<FileKind, string>;
    return html`<table class="article-browser-table file-browser-table">
      <thead>
        <tr>
          <th scope="col" class="file-browser-thumbnail">
            <span class="visually-hidden">Thumbnail</span>
          </th>
          ${FILE_COLUMNS.map(({ sort, label }) =>
            sortHeading(
              sort,
              label,
              { sort: this.sort, order: this.order },
              (column) => this.sortBy(column),
            ),
          )}
          <th scope="col">Operations</th>
        </tr>
      </thead>
      <tbody>
        ${result.files.map((file) => {
          const shared = isShared(file);
          const location = `${file.type}/${file.slug}`;
          // Shared files are shown at their path on the website
          const fileUrl = this.api.url(
            shared
              ? file.url
              : `/files/${location}/${encodeURIComponent(file.name)}`,
          );
          return html`<tr>
            <td class="file-browser-thumbnail">
              ${
                file.kind === "image"
                  ? html`<img
                      class="checkerboard"
                      src=${fileUrl}
                      alt=""
                      loading="lazy"
                      width="48"
                      height="48"
                    />`
                  : html`<span class="file-browser-icon"
                      >${icon(FILE_KIND_ICONS[file.kind])}</span
                    >`
              }
            </td>
            <td>
              <a href=${fileUrl} target="_blank">${file.name}</a>
            </td>
            <td>${kindLabels[file.kind]}</td>
            <td>${formatFileSize(file.size)}</td>
            <td>
              ${
                shared
                  ? fileFolderName(file)
                  : html`<a
                      href=${this.api.url(`/#${location}`)}
                      target="_blank"
                      @click=${(event: MouseEvent) =>
                        this.onLocationClick(event, file)}
                      >${location}</a
                    >`
              }
            </td>
            <td class="file-browser-operations">
              ${
                this.picking
                  ? html`<button
                      type="button"
                      class="btn btn-choose"
                      @click=${() => this.chooseFile(file)}
                    >
                      Choose<span class="visually-hidden"> ${file.name}</span>
                    </button>`
                  : nothing
              }
              ${this.renderOperation(
                "copy-url",
                `Copy URL of ${file.name}`,
                "content_copy",
                () => void this.copyUrl(file),
              )}
              ${
                shared
                  ? nothing
                  : this.renderOperation(
                      "move-to-files",
                      `Move ${file.name} to shared files`,
                      "drive_file_move",
                      () =>
                        void this.move(file, {
                          type: SHARED_FILES_TYPE,
                          slug: "",
                        }),
                    )
              }
              ${
                this.pickArticle
                  ? this.renderOperation(
                      "move-to-article",
                      `Move ${file.name} to an article…`,
                      "folder_open",
                      () => void this.moveToArticle(file),
                    )
                  : nothing
              }
              ${this.renderOperation(
                "replace",
                `Replace ${file.name}…`,
                "find_replace",
                () => this.chooseReplacement(file),
              )}
              ${this.renderOperation(
                "delete",
                `Delete ${file.name}…`,
                "delete",
                () => void this.delete(file),
              )}
            </td>
          </tr>`;
        })}
      </tbody>
    </table>`;
  }

  /** Render the page buttons, when there is more than one page */
  private renderPages() {
    const result = this.result;
    if (!result || result.pages < 2) return nothing;
    return html`<nav class="article-browser-pages" aria-label="Pages">
      <button
        type="button"
        class="btn btn-previous"
        ?disabled=${result.page <= 1}
        @click=${() => void this.goTo(result.page - 1)}
      >
        Previous
      </button>
      <span>Page ${result.page} of ${result.pages}</span>
      <button
        type="button"
        class="btn btn-next"
        ?disabled=${result.page >= result.pages}
        @click=${() => void this.goTo(result.page + 1)}
      >
        Next
      </button>
    </nav>`;
  }

  /** What the status line says: an error, what an operation did, loading, or how many files were found */
  private statusText(): string {
    if (this.error) return this.error;
    if (this.message) return this.message;
    if (this.loading || !this.result) return "Loading…";
    const { total } = this.result;
    return `${total} ${total === 1 ? "file" : "files"} found`;
  }

  override render() {
    const kinds = FILE_KINDS.filter(({ value }) =>
      this.filters.kinds.includes(value),
    );
    const types = this.filters.types.map((value) => ({
      value,
      label:
        value === SHARED_FILES_TYPE
          ? "Shared files"
          : (this.types[value]?.labelPlural ?? value),
    }));
    return html`<dialog
      class="article-browser file-browser"
      aria-labelledby="file-browser-title"
      @close=${() => {
        clearTimeout(this.searchTimer);
        this.finishPicking();
      }}
    >
      <div class="article-browser-header">
        <h2 id="file-browser-title">
          ${this.picking ? "Choose a file" : "Files"}
        </h2>
        <div class="file-browser-header-actions">
          <button
            type="button"
            class="btn btn-upload-file"
            @click=${() => this.chooseUploads()}
          >
            ${icon("upload_file")} Upload file
          </button>
          <button
            type="button"
            class="btn btn-icon btn-close"
            title="Close"
            @click=${() => this.close()}
          >
            ${icon("close")}<span class="visually-hidden">Close</span>
          </button>
        </div>
      </div>
      <div class="article-browser-controls" role="search">
        <div class="article-browser-field article-browser-search">
          <label for="file-browser-search">Search names</label>
          <input
            type="search"
            id="file-browser-search"
            .value=${this.search}
            @input=${(event: Event) =>
              this.onSearch((event.target as HTMLInputElement).value)}
          />
        </div>
        ${this.renderSelect("kind", "Type", "All types", kinds)}
        ${this.renderSelect("type", "Article type", "All article types", types)}
      </div>
      <p
        class="article-browser-status ${this.error ? "error" : ""}"
        role="status"
      >
        ${this.statusText()}
      </p>
      <div class="article-browser-results file-browser-results">
        ${this.renderResults()} ${this.renderPages()}
      </div>
      <!-- Chooses the files to upload -->
      <input
        type="file"
        id="file-browser-upload"
        class="visually-hidden"
        tabindex="-1"
        aria-hidden="true"
        multiple
        @change=${(event: Event) => {
          const input = event.target as HTMLInputElement;
          const files = [...(input.files as FileList)];
          input.value = "";
          if (files.length) void this.upload(files);
        }}
      />
      <!-- Chooses the replacement for the file being replaced -->
      <input
        type="file"
        id="file-browser-replacement"
        class="visually-hidden"
        tabindex="-1"
        aria-hidden="true"
        @change=${(event: Event) => {
          const input = event.target as HTMLInputElement;
          const replacement = input.files?.[0];
          const file = this.replacing;
          input.value = "";
          this.replacing = undefined;
          if (file && replacement) void this.replace(file, replacement);
        }}
      />
      <edaha-file-conflict></edaha-file-conflict>
    </dialog>`;
  }
}

defineElement("edaha-file-browser", EdahaFileBrowser);
