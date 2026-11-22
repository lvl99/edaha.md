import { html, LitElement, nothing } from "lit";
import type {
  ArticleOrder,
  ArticleTypeLabels,
  FileChange,
  FileFilters,
  FileKind,
  FilePage,
  FileSort,
  FileSummary,
} from "../../../server/types/index.ts";
import type { EditorApi } from "../../editorApi/index.ts";
import { icon } from "../../icons/index.ts";
import { nextSort, sortHeading } from "../../sortTable/index.ts";
import { defineElement } from "../define/index.ts";

/** The kinds of files, as the file browser names them */
export const FILE_KINDS: readonly { value: FileKind; label: string }[] = [
  { value: "image", label: "Image" },
  { value: "document", label: "Document" },
  { value: "archive", label: "Archive" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "other", label: "Other" },
];

/** The results' sortable columns (Operations isn't sortable) */
export const FILE_COLUMNS: readonly { sort: FileSort; label: string }[] = [
  { sort: "name", label: "Name" },
  { sort: "kind", label: "Type" },
  { sort: "size", label: "Size" },
  { sort: "location", label: "Location" },
];

/** The event fired after a file is replaced or deleted (detail: the file and what changed) */
export const FILES_CHANGED_EVENT = "files-changed";

/** Detail of the `files-changed` event */
export interface FilesChanged extends FileChange {
  /** The file that was replaced or deleted */
  file: FileSummary;
}

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

/** The units file sizes are shown in */
const SIZE_UNITS = ["B", "KB", "MB", "GB"];

/**
 * A file size for people: bytes, kilobytes, megabytes or gigabytes (1 KB = 1024 bytes), with one decimal below 10.
 *
 * @example
 * formatFileSize(512); // "512 B"
 * formatFileSize(1536); // "1.5 KB"
 * formatFileSize(5 * 1024 ** 3); // "5 GB"
 */
export const formatFileSize = (bytes: number): string => {
  const unit = Math.min(
    Math.max(Math.floor(Math.log(bytes) / Math.log(1024)), 0),
    SIZE_UNITS.length - 1,
  );
  const value = bytes / 1024 ** unit;
  const rounded =
    unit && value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded} ${SIZE_UNITS[unit]}`;
};

/** "1 article" or "2 articles" */
const articles = (count: number) =>
  `${count} ${count === 1 ? "article" : "articles"}`;

/**
 * The file browser: a dialog listing the files in the articles' folders, 50 at a time, found by name and filtered by
 * kind and article type, in a table whose column headings sort it. Each file can be opened, its website path copied,
 * replaced with another file, or deleted; replacing and deleting update references to it in every article, and fire
 * `files-changed` (detail: {@link FilesChanged}). Rendered in the light DOM.
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

  /** Tell the editor a file was replaced or deleted, and show the files again */
  private async changed(file: FileSummary, change: FileChange) {
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
          `Replace ${file.name} in ${file.type}/${file.slug} with ${replacement.name}?${references.length ? ` ${articles(references.length)} will refer to the new file if its name differs.` : ""}`,
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
          `Delete ${file.name} from ${file.type}/${file.slug}?${references.length ? ` It will also be removed from ${articles(references.length)}.` : ""}`,
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

  /** Render an operation's icon button, named for screen readers and as a tooltip */
  private renderOperation(
    label: string,
    name: Parameters<typeof icon>[0],
    run: () => unknown,
  ) {
    return html`<button
      type="button"
      class="btn-icon"
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
          const location = `${file.type}/${file.slug}`;
          return html`<tr>
            <td>
              <a
                href=${this.api.url(
                  `/files/${location}/${encodeURIComponent(file.name)}`,
                )}
                target="_blank"
                >${file.name}</a
              >
            </td>
            <td>${kindLabels[file.kind]}</td>
            <td>${formatFileSize(file.size)}</td>
            <td>
              <a href=${this.api.url(`/#${location}`)} target="_blank"
                >${location}</a
              >
            </td>
            <td class="file-browser-operations">
              ${
                this.picking
                  ? html`<button
                      type="button"
                      class="btn"
                      @click=${() => this.chooseFile(file)}
                    >
                      Choose<span class="visually-hidden"> ${file.name}</span>
                    </button>`
                  : nothing
              }
              ${this.renderOperation(
                `Copy URL of ${file.name}`,
                "content_copy",
                () => void this.copyUrl(file),
              )}
              ${this.renderOperation(
                `Replace ${file.name}…`,
                "find_replace",
                () => this.chooseReplacement(file),
              )}
              ${this.renderOperation(
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
        class="btn"
        ?disabled=${result.page <= 1}
        @click=${() => void this.goTo(result.page - 1)}
      >
        Previous
      </button>
      <span>Page ${result.page} of ${result.pages}</span>
      <button
        type="button"
        class="btn"
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
      label: this.types[value]?.labelPlural ?? value,
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
        <button
          type="button"
          class="btn-icon"
          title="Close"
          @click=${() => this.close()}
        >
          ${icon("close")}<span class="visually-hidden">Close</span>
        </button>
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
    </dialog>`;
  }
}

defineElement("edaha-file-browser", EdahaFileBrowser);
