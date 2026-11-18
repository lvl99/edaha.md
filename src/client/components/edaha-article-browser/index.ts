import { html, LitElement, nothing } from "lit";
import type {
  ArticleFilters,
  ArticlePage,
  ArticleSort,
  ArticleStatus,
  ArticleSummary,
  ArticleTypeLabels,
} from "../../../server/types/index.ts";
import type { ArticleLocation, EditorApi } from "../../editorApi/index.ts";
import { icon } from "../../icons/index.ts";
import { defineElement } from "../define/index.ts";

/** What the article browser starts with when it opens */
export interface ArticleBrowserOptions {
  /** Text the titles contain */
  search?: string | undefined;
  type?: string | undefined;
}

/** The statuses to filter by */
export const STATUS_FILTERS: readonly {
  value: ArticleStatus;
  label: string;
}[] = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "unlisted", label: "Unlisted" },
];

/** The ways to sort */
export const SORTS: readonly { value: ArticleSort; label: string }[] = [
  { value: "date", label: "Date (newest first)" },
  { value: "title", label: "Title (A–Z)" },
];

/** The event fired when an article is chosen (detail: its location) */
export const ARTICLE_CHOOSE_EVENT = "article-choose";

/**
 * A type's singular label, or its name if it isn't configured.
 *
 * @example
 * typeLabel({ news: { labelSingle: "News item", labelPlural: "News" } }, "news"); // "News item"
 */
export const typeLabel = (
  types: Record<string, ArticleTypeLabels>,
  type: string,
): string => types[type]?.labelSingle ?? type;

/**
 * The article browser: a dialog that finds articles by title, filters them by type, author, tag and status, sorts them
 * by date or title, and shows them 50 at a time. Choosing one closes it and fires `article-choose` (detail: the
 * article's location). Rendered in the light DOM.
 *
 * @example
 * html`<edaha-article-browser .api=${api} .types=${types} @article-choose=${open}></edaha-article-browser>`
 * browser.show({ type: "news" });
 */
export class EdahaArticleBrowser extends LitElement {
  static override properties = {
    api: { attribute: false },
    types: { attribute: false },
    search: { state: true },
    type: { state: true },
    author: { state: true },
    tag: { state: true },
    status: { state: true },
    sort: { state: true },
    page: { state: true },
    result: { state: true },
    filters: { state: true },
    loading: { state: true },
    error: { state: true },
  };

  declare api: EditorApi;
  /** The configured article types' labels */
  declare types: Record<string, ArticleTypeLabels>;

  declare search: string;
  declare type: string;
  declare author: string;
  declare tag: string;
  declare status: string;
  declare sort: ArticleSort;
  declare page: number;
  /** The articles found, once loaded */
  declare result?: ArticlePage | undefined;
  /** The filters' choices */
  declare filters: ArticleFilters;
  declare loading: boolean;
  declare error: string;

  /** How long to wait after typing in the search before searching, in ms (replaceable for tests) */
  searchDelay = 250;

  /** The waiting search, if any */
  private searchTimer?: ReturnType<typeof setTimeout> | undefined;

  /** Counts searches, so only the latest one's result is shown */
  private searches = 0;

  constructor() {
    super();
    this.types = {};
    this.search = "";
    this.type = "";
    this.author = "";
    this.tag = "";
    this.status = "";
    this.sort = "date";
    this.page = 1;
    this.filters = { types: [], authors: [], tags: [] };
    this.loading = false;
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

  /**
   * Open the browser with a search and type (other filters are cleared), on the first page, with focus in the search
   * field.
   */
  async show(options: ArticleBrowserOptions = {}): Promise<void> {
    this.search = options.search ?? "";
    this.type = options.type ?? "";
    this.author = "";
    this.tag = "";
    this.status = "";
    this.page = 1;
    await this.updateComplete;
    if (!this.open) this.dialog?.showModal();
    this.querySelector<HTMLInputElement>("#article-browser-search")?.focus();
    await Promise.all([this.loadFilters(), this.load()]);
  }

  /** Close the browser */
  close(): void {
    clearTimeout(this.searchTimer);
    if (this.open) this.dialog?.close();
  }

  /** Load the filters' choices (keeping the last ones if it fails) */
  private async loadFilters(): Promise<void> {
    try {
      this.filters = await this.api.filters();
    } catch {
      // The filters keep their last choices
    }
  }

  /** Find the articles for the current search, filters, sort and page */
  async load(): Promise<void> {
    clearTimeout(this.searchTimer);
    const search = ++this.searches;
    this.loading = true;
    try {
      const result = await this.api.query({
        search: this.search,
        type: this.type,
        author: this.author,
        tag: this.tag,
        status: (this.status || undefined) as ArticleStatus | undefined,
        sort: this.sort,
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

  /** Change a filter or the sort, going back to the first page */
  private choose(name: "type" | "author" | "tag" | "status", value: string) {
    this[name] = value;
    this.page = 1;
    void this.load();
  }

  /** Search once typing pauses, from the first page */
  private onSearch(value: string) {
    this.search = value;
    this.page = 1;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.load(), this.searchDelay);
  }

  /** Show another page, from its top */
  private async goTo(page: number) {
    this.page = page;
    await this.load();
    this.querySelector(".article-browser-results")?.scrollTo?.(0, 0);
  }

  /** Choose an article: close the browser and tell the editor */
  private chooseArticle(article: ArticleSummary) {
    this.close();
    this.dispatchEvent(
      new CustomEvent<ArticleLocation>(ARTICLE_CHOOSE_EVENT, {
        detail: { type: article.type, slug: article.slug },
        bubbles: true,
      }),
    );
  }

  /** Render a select filter with an "any" choice first */
  private renderSelect(
    name: "type" | "author" | "tag" | "status",
    label: string,
    any: string,
    options: readonly { value: string; label: string }[],
  ) {
    const id = `article-browser-${name}`;
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

  /** Render the found articles */
  private renderResults() {
    const result = this.result;
    if (!result) return nothing;
    if (!result.articles.length)
      return html`<p class="article-browser-empty">No articles found.</p>`;
    return html`<ul class="article-browser-list">
      ${result.articles.map(
        (article) =>
          html`<li>
            <a
              href="#${article.type}/${article.slug}"
              @click=${(event: Event) => {
                event.preventDefault();
                this.chooseArticle(article);
              }}
              >${article.title}</a
            >
            <small class="article-browser-meta"
              >${[
                typeLabel(this.types, article.type),
                article.status,
                article.date.slice(0, 10),
                article.author,
              ]
                .filter(Boolean)
                .join(" · ")}</small
            >
            ${article.error ? html`<small class="error">${article.error}</small>` : nothing}
          </li>`,
      )}
    </ul>`;
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

  /** What the status line says: loading, an error, or how many articles were found */
  private statusText(): string {
    if (this.error) return this.error;
    if (this.loading || !this.result) return "Loading…";
    const { total } = this.result;
    return `${total} ${total === 1 ? "article" : "articles"} found`;
  }

  override render() {
    const toOptions = (values: string[]) =>
      values.map((value) => ({ value, label: value }));
    // Configured types first, in the config file's order, then the other types articles use
    const types = [
      ...new Set([...Object.keys(this.types), ...this.filters.types]),
    ].map((value) => ({ value, label: typeLabel(this.types, value) }));
    return html`<dialog
      class="article-browser"
      aria-labelledby="article-browser-title"
      @close=${() => clearTimeout(this.searchTimer)}
    >
      <div class="article-browser-header">
        <h2 id="article-browser-title">All articles</h2>
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
          <label for="article-browser-search">Search titles</label>
          <input
            type="search"
            id="article-browser-search"
            .value=${this.search}
            @input=${(event: Event) =>
              this.onSearch((event.target as HTMLInputElement).value)}
          />
        </div>
        ${this.renderSelect("type", "Type", "All types", types)}
        ${this.renderSelect(
          "author",
          "Author",
          "Any author",
          toOptions(this.filters.authors),
        )}
        ${this.renderSelect(
          "tag",
          "Tag",
          "Any tag",
          toOptions(this.filters.tags),
        )}
        ${this.renderSelect("status", "Status", "Any status", STATUS_FILTERS)}
        <div class="article-browser-field">
          <label for="article-browser-sort">Sort by</label>
          <select
            id="article-browser-sort"
            @change=${(event: Event) => {
              this.sort = (event.target as HTMLSelectElement)
                .value as ArticleSort;
              this.page = 1;
              void this.load();
            }}
          >
            ${SORTS.map(
              (sort) =>
                html`<option
                  value=${sort.value}
                  ?selected=${this.sort === sort.value}
                >
                  ${sort.label}
                </option>`,
            )}
          </select>
        </div>
      </div>
      <p
        class="article-browser-status ${this.error ? "error" : ""}"
        role="status"
      >
        ${this.statusText()}
      </p>
      <div class="article-browser-results">
        ${this.renderResults()} ${this.renderPages()}
      </div>
    </dialog>`;
  }
}

defineElement("edaha-article-browser", EdahaArticleBrowser);
