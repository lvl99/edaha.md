import { html, LitElement, nothing } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { keyed } from "lit/directives/keyed.js";
import type {
  ArticlePage,
  ArticleSummary,
  ArticleTypeLabels,
  EditorArticle,
  RecentArticles,
} from "../../../server/types/index.ts";
import type { FieldOption } from "../edaha-article-data-field/index.ts";
import { EditorApi, type ArticleLocation } from "../../editorApi/index.ts";
import { defineElement } from "../define/index.ts";
import "../edaha-article/index.ts";
import type { EdahaArticle } from "../edaha-article/index.ts";
import { typeLabel } from "../edaha-article-browser/index.ts";
import "../edaha-file-browser/index.ts";
import type {
  EdahaFileBrowser,
  FilesChanged,
} from "../edaha-file-browser/index.ts";
import type {
  ArticleBrowserOptions,
  EdahaArticleBrowser,
} from "../edaha-article-browser/index.ts";
import "../edaha-toasts/index.ts";
import {
  TOAST_EVENT,
  type EdahaToasts,
  type ToastMessage,
} from "../edaha-toasts/index.ts";
import {
  onDeviceThemeChange,
  themeSwitcherLabel,
  toggleTheme,
} from "../../theme/index.ts";
import { icon } from "../../icons/index.ts";
import { onNarrowChange } from "../../narrow/index.ts";

/**
 * Describe an article in the list, e.g. "hello · published · 2026-10-19".
 */
const describe = (article: ArticleSummary) =>
  [article.slug, article.status, article.date.slice(0, 10)]
    .filter(Boolean)
    .join(" · ");

/** The choices when leaving an article with unsaved changes */
export type UnsavedChoice = "save" | "discard" | "cancel";

/** The question asked before leaving an article with unsaved changes */
export const UNSAVED_DIALOG = {
  heading: "Save changes first?",
  message: "This article has changes that aren't saved.",
  choices: [
    { value: "save", label: "Save" },
    { value: "discard", label: "Don't save" },
    { value: "cancel", label: "Cancel" },
  ],
} as const satisfies {
  heading: string;
  message: string;
  choices: readonly { value: UnsavedChoice; label: string }[];
};

/** How many of the most recently changed articles the welcome prompt shows */
export const WELCOME_COUNT = 6;

/** How many matches the nav's title search shows (the article browser shows them all) */
export const NAV_SEARCH_COUNT = 10;

/** A type's most recently changed articles, as the nav shows them */
export interface ArticleGroup {
  type: string;
  /** The type's plural label (its name if it isn't configured) */
  label: string;
  articles: ArticleSummary[];
  /** How many articles the type has in all */
  total: number;
}

/**
 * Label and order each type's most recently changed articles: configured types in the config file's order, then any
 * other types alphabetically.
 *
 * @example
 * groupRecent(recent, { news: { labelSingle: "News item", labelPlural: "News" } });
 * // [{ type: "news", label: "News", articles: [...], total: 120 }, ...]
 */
export const groupRecent = (
  recent: RecentArticles[],
  types: Record<string, ArticleTypeLabels>,
): ArticleGroup[] => {
  const order = Object.keys(types);
  const rank = (type: string) =>
    order.includes(type) ? order.indexOf(type) : order.length;
  return recent
    .map((group) => ({
      ...group,
      label: types[group.type]?.labelPlural ?? group.type,
    }))
    .sort(
      (a, b) => rank(a.type) - rank(b.type) || a.type.localeCompare(b.type),
    );
};

/**
 * The article editor: a nav with each type's most recently changed articles (including drafts), a title search and the
 * article browser for finding any article, the selected or new article's form, and toasts for success and error
 * messages. Opening another article or starting a new one
 * while the form has unsaved changes asks whether to save them first; closing or reloading the page gets the browser's
 * own question. On narrow screens, the article list opens over the page from a menu button.
 *
 * @example
 * html`<edaha-editor></edaha-editor>`
 */
export class EdahaEditor extends LitElement {
  static override properties = {
    api: { attribute: false },
    recent: { state: true },
    types: { state: true },
    selected: { state: true },
    article: { state: true },
    editing: { state: true },
    formKey: { state: true },
    error: { state: true },
    searchText: { state: true },
    searchResult: { state: true },
    welcome: { state: true },
    unsaved: { state: true },
    navOpen: { state: true },
  };

  declare api: EditorApi;
  /** Each type's most recently changed articles */
  declare recent: RecentArticles[];
  /** Article types from the config file */
  declare types: Record<string, ArticleTypeLabels>;
  /** The selected article's location */
  declare selected?: ArticleLocation | undefined;
  /** The loaded article (undefined when writing a new one) */
  declare article?: EditorArticle | undefined;
  /** Whether the form is shown */
  declare editing: boolean;
  /** Changes whenever an article is opened or started, so the form starts afresh */
  declare formKey: number;
  declare error: string;
  /** The nav's title search */
  declare searchText: string;
  /** The nav's title search matches, while searching */
  declare searchResult?: ArticlePage | undefined;
  /** The most recently changed articles, for the welcome prompt */
  declare welcome?: ArticlePage | undefined;
  /** The open "Save changes first?" question, with what to do with the answer */
  declare unsaved?: ((choice: UnsavedChoice) => void) | undefined;
  /** Whether the article list is open over the page (on narrow screens) */
  declare navOpen: boolean;

  /** Ask the browser before the page closes or reloads with unsaved changes (browsers word the question) */
  private readonly onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (this.form()?.dirty) event.preventDefault();
  };

  /** Stops updating the theme switcher's label when the device's light or dark setting changes */
  private stopWatchingTheme?: () => void;

  /** Stops closing the article list when the screen stops being narrow */
  private stopWatchingNarrow?: () => void;

  /** How long to wait after typing in the nav's search before searching, in ms (replaceable for tests) */
  searchDelay = 250;

  /** The waiting search, if any */
  private searchTimer?: ReturnType<typeof setTimeout> | undefined;

  /** Counts searches, so only the latest one's matches are shown */
  private searches = 0;

  /** Show toasts fired by the form */
  private readonly onToast = (event: Event) =>
    this.toast((event as CustomEvent<ToastMessage>).detail);

  constructor() {
    super();
    this.api = new EditorApi();
    this.recent = [];
    this.types = {};
    this.editing = false;
    this.formKey = 0;
    this.error = "";
    this.searchText = "";
    this.navOpen = false;
  }

  protected override createRenderRoot() {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("beforeunload", this.onBeforeUnload);
    this.addEventListener(TOAST_EVENT, this.onToast);
    // The theme switcher's label says which theme it switches to, which follows the device until one is chosen
    this.stopWatchingTheme = onDeviceThemeChange(() => this.requestUpdate());
    // On wide screens the article list is always shown, so it isn't left open over the page
    this.stopWatchingNarrow = onNarrowChange(() => (this.navOpen = false));
    void this.refresh().then(() => this.openFromAddress());
  }

  /**
   * Open the article the page's address names, e.g. "#news/hello" (as the file browser's locations link to).
   */
  private async openFromAddress(): Promise<void> {
    const [, type, slug] =
      /^#([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(window.location.hash) ?? [];
    if (type && slug) await this.open({ type, slug });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("beforeunload", this.onBeforeUnload);
    this.removeEventListener(TOAST_EVENT, this.onToast);
    this.stopWatchingTheme?.();
    this.stopWatchingNarrow?.();
    clearTimeout(this.searchTimer);
  }

  /**
   * Open the article list over the page (on narrow screens), moving focus into it.
   */
  async openNav(): Promise<void> {
    this.navOpen = true;
    await this.updateComplete;
    this.querySelector<HTMLElement>(".nav-close")?.focus();
  }

  /**
   * Close the article list, moving focus back to the menu button if it was in the list.
   */
  closeNav(): void {
    if (!this.navOpen) return;
    this.navOpen = false;
    if (
      this.querySelector(".edaha-editor-nav")?.contains(document.activeElement)
    )
      this.querySelector<HTMLElement>(".nav-toggle")?.focus();
  }

  /** The article form, while shown */
  private form(): EdahaArticle | null {
    return this.querySelector<EdahaArticle>("edaha-article");
  }

  /** Show a toast */
  private toast(toast: ToastMessage): void {
    this.querySelector<EdahaToasts>("edaha-toasts")?.show(toast);
  }

  /** Ask whether to save unsaved changes first, and resolve with the answer */
  private askUnsaved(): Promise<UnsavedChoice> {
    return new Promise((resolve) => {
      this.unsaved = (choice) => {
        this.unsaved = undefined;
        resolve(choice);
      };
    });
  }

  /**
   * Whether the form can be left: it has no unsaved changes, or the user chose to save them (and they were saved) or
   * not to.
   */
  async leaveForm(): Promise<boolean> {
    const form = this.form();
    if (!form || !(await form.hasChanges())) return true;
    const choice = await this.askUnsaved();
    if (choice === "save") return form.save();
    return choice === "discard";
  }

  /**
   * Reload the nav (each type's most recently changed articles, and the title search's matches) and the welcome
   * prompt's articles.
   */
  async refresh(): Promise<void> {
    try {
      [this.recent, this.types, this.welcome] = await Promise.all([
        this.api.recent(),
        this.api.types(),
        this.api.query({ sort: "updated", perPage: WELCOME_COUNT }),
      ]);
      this.error = "";
    } catch (error) {
      this.error = (error as Error).message;
      this.toast({ kind: "error", message: this.error });
    }
    if (this.searchText.trim()) await this.searchTitles();
  }

  /**
   * Search titles for the nav's search text, showing the first matches in place of the recent articles (none when
   * the search is empty).
   */
  async searchTitles(): Promise<void> {
    clearTimeout(this.searchTimer);
    const search = ++this.searches;
    const text = this.searchText.trim();
    if (!text) {
      this.searchResult = undefined;
      return;
    }
    try {
      const result = await this.api.query({
        search: text,
        perPage: NAV_SEARCH_COUNT,
      });
      if (search === this.searches) this.searchResult = result;
    } catch (error) {
      if (search !== this.searches) return;
      this.error = (error as Error).message;
      this.toast({ kind: "error", message: this.error });
    }
  }

  /** Search once typing pauses */
  private onSearchInput(text: string): void {
    this.searchText = text;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(
      () => void this.searchTitles(),
      this.searchDelay,
    );
  }

  /** Open the file browser */
  async openFiles(): Promise<void> {
    await this.querySelector<EdahaFileBrowser>("edaha-file-browser")?.show();
  }

  /**
   * After a file is replaced or deleted, refresh the nav, and show the open article again if the change touched it
   * (its folder's files or its references). An article with unsaved changes is left as it is, with a warning, as it
   * still has the old references.
   */
  private async onFilesChanged({
    file,
    articles,
  }: FilesChanged): Promise<void> {
    await this.refresh();
    const selected = this.selected;
    const touched =
      selected &&
      [file, ...articles].some(
        ({ type, slug }) => type === selected.type && slug === selected.slug,
      );
    if (!touched) return;
    const form = this.form();
    if (form?.dirty) {
      this.toast({
        kind: "error",
        message:
          "The open article's files changed, but it has unsaved changes, so it still shows the old ones. Saving keeps its old references.",
      });
      return;
    }
    await this.open(selected);
  }

  /**
   * Open the article browser, e.g. with the nav's search or one type's articles.
   */
  async openBrowser(options: ArticleBrowserOptions = {}): Promise<void> {
    await this.querySelector<EdahaArticleBrowser>(
      "edaha-article-browser",
    )?.show(options);
  }

  /**
   * Load an article into the form, asking first whether to save unsaved changes in the open one.
   */
  async open(location: ArticleLocation): Promise<void> {
    if (!(await this.leaveForm())) return;
    try {
      this.article = await this.api.read(location);
      this.selected = location;
      this.editing = true;
      this.formKey++;
      this.error = "";
    } catch (error) {
      this.error = (error as Error).message;
      this.toast({ kind: "error", message: this.error });
    }
  }

  /**
   * The types to choose from: configured types, then any other types articles use.
   */
  typeOptions(): FieldOption[] {
    const options = Object.entries(this.types).map(
      ([value, { labelSingle }]) => ({
        value,
        label: labelSingle,
      }),
    );
    for (const { type } of this.recent)
      if (!this.types[type]) options.push({ value: type, label: type });
    return options;
  }

  /** Start writing a new article, asking first whether to save unsaved changes in the open one */
  async create(): Promise<void> {
    if (!(await this.leaveForm())) return;
    this.article = undefined;
    this.selected = undefined;
    this.editing = true;
    this.formKey++;
  }

  /** After saving, refresh the list and keep the saved article selected */
  private async onSaved(event: CustomEvent<ArticleLocation>) {
    this.selected = event.detail;
    await this.refresh();
  }

  /** After deleting, refresh the list and close the form */
  private async onDeleted() {
    this.article = undefined;
    this.selected = undefined;
    this.editing = false;
    await this.refresh();
  }

  /** Render the "Save changes first?" question, if open */
  private renderUnsaved() {
    const answer = this.unsaved;
    if (!answer) return nothing;
    return html`<div class="dialog-backdrop">
      <div
        class="dialog unsaved"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-heading"
        aria-describedby="unsaved-message"
      >
        <h2 id="unsaved-heading">${UNSAVED_DIALOG.heading}</h2>
        <p id="unsaved-message">${UNSAVED_DIALOG.message}</p>
        ${UNSAVED_DIALOG.choices.map(
          ({ value, label }) =>
            html`<button
              type="button"
              data-choice=${value}
              @click=${() => answer(value)}
            >
              ${label}
            </button>`,
        )}
      </div>
    </div>`;
  }

  /**
   * Render the welcome prompt, shown until an article is opened or started: links to a new article and to the article
   * browser, then the most recently changed articles, with a link to the article browser when there are more.
   */
  private renderWelcome() {
    const welcome = this.welcome;
    return html`<div class="welcome-prompt">
      <div class="welcome-prompt-box">
        <!-- "Write a new article" starts a new article; "edit an existing one" opens the article browser -->
        <p class="welcome-prompt-message">
          <button
            type="button"
            class="btn-link"
            @click=${() => void this.create()}
          >
            Write a new article
          </button>
          or
          <button
            type="button"
            class="btn-link"
            @click=${() => void this.openBrowser()}
          >
            edit an existing one</button
          >...
        </p>
        ${
          welcome?.articles.length
            ? html`<ul
                class="welcome-prompt-list"
                aria-label="Recently changed articles"
              >
                ${welcome.articles.map(
                  (article) =>
                    html`<li>
                      <a
                        href="#${article.type}/${article.slug}"
                        @click=${(event: Event) => {
                          event.preventDefault();
                          void this.open(article);
                        }}
                        >${article.title}</a
                      >
                      <small class="welcome-prompt-meta"
                        >${typeLabel(this.types, article.type)} · changed
                        ${article.updated.slice(0, 10)}</small
                      >
                    </li>`,
                )}
              </ul>`
            : nothing
        }
        ${
          welcome && welcome.total > welcome.articles.length
            ? html`<button
                type="button"
                class="btn-link welcome-prompt-browse"
                @click=${() => void this.openBrowser()}
              >
                Open article browser
              </button>`
            : nothing
        }
      </div>
    </div>`;
  }

  /** Render the title search's matches, with a link to see them all in the article browser */
  private renderSearchResult(
    result: ArticlePage,
    renderItem: (article: ArticleSummary) => unknown,
  ) {
    const { total } = result;
    return html`<div class="edaha-editor-article-group search-results">
      <h2 class="edaha-editor-article-group-title" role="status">
        ${total} ${total === 1 ? "match" : "matches"}
      </h2>
      <ul class="edaha-editor-article-group-list">
        ${result.articles.map(renderItem)}
      </ul>
      ${
        total > result.articles.length
          ? html`<button
              type="button"
              class="btn-link show-all"
              @click=${() => {
                this.closeNav();
                void this.openBrowser({ search: this.searchText.trim() });
              }}
            >
              See all results
            </button>`
          : nothing
      }
    </div>`;
  }

  /** Render each type's most recently changed articles, with a link to all of a type's articles */
  private renderGroups(renderItem: (article: ArticleSummary) => unknown) {
    return groupRecent(this.recent, this.types).map(
      (group) =>
        html`<div class="edaha-editor-article-group" data-type=${group.type}>
          <h2 class="edaha-editor-article-group-title">${group.label}</h2>
          <ul class="edaha-editor-article-group-list">
            ${group.articles.map(renderItem)}
          </ul>
          ${
            group.total > group.articles.length
              ? html`<button
                  type="button"
                  class="btn-link show-all"
                  @click=${() => {
                    this.closeNav();
                    void this.openBrowser({ type: group.type });
                  }}
                >
                  Show all<span class="visually-hidden"> ${group.label}</span>
                  (${group.total})
                </button>`
              : nothing
          }
        </div>`,
    );
  }

  override render() {
    const isSelected = (article: ArticleSummary) =>
      this.selected?.type === article.type &&
      this.selected.slug === article.slug;
    const renderItem = (article: ArticleSummary) =>
      html`<li class="edaha-editor-article-group-item">
        <a
          href="#${article.type}/${article.slug}"
          class="edaha-editor-article-group-item-title"
          aria-current=${isSelected(article) ? "page" : "false"}
          @click=${(event: Event) => {
            event.preventDefault();
            this.closeNav();
            void this.open(article);
          }}
          >${article.title}</a
        >
        <small class="edaha-editor-article-group-item-meta"
          >${describe(article)}</small
        >
        ${article.error ? html`<small class="error">${article.error}</small>` : nothing}
      </li>`;
    return html`
      <div class="edaha-editor-bar">
        <button
          type="button"
          class="btn-icon nav-toggle"
          title="Articles"
          aria-expanded=${this.navOpen ? "true" : "false"}
          aria-controls="edaha-editor-nav"
          @click=${() => void this.openNav()}
        >
          ${icon("menu")}<span class="visually-hidden">Articles</span>
        </button>
        <span class="edaha-editor-bar-title">edaha.md</span>
      </div>
      <div
        class="nav-backdrop ${classMap({ open: this.navOpen })}"
        @click=${() => this.closeNav()}
      ></div>
      <nav
        id="edaha-editor-nav"
        class="edaha-editor-nav ${classMap({ open: this.navOpen })}"
        aria-label="Articles"
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === "Escape") this.closeNav();
        }}
      >
        <button
          type="button"
          class="btn-icon nav-close"
          title="Close articles"
          @click=${() => this.closeNav()}
        >
          ${icon("close")}<span class="visually-hidden">Close articles</span>
        </button>
        <button
          type="button"
          class="theme-switcher"
          title=${themeSwitcherLabel()}
          @click=${() => {
            toggleTheme();
            this.requestUpdate();
          }}
        >
          <span class="visually-hidden">${themeSwitcherLabel()}</span>
        </button>
        <h1 class="edaha-title">edaha.md<span class="leaf-device"></span></h1>
        <div class="edaha-editor-new">
          <button
            type="button"
            class="btn"
            @click=${() => {
              this.closeNav();
              void this.create();
            }}
          >
            New article
          </button>
        </div>
        <div class="edaha-editor-search" role="search">
          <label for="article-search" class="visually-hidden"
            >Search titles</label
          >
          <input
            type="search"
            id="article-search"
            placeholder="Search titles"
            .value=${this.searchText}
            @input=${(event: Event) =>
              this.onSearchInput((event.target as HTMLInputElement).value)}
            @keydown=${(event: KeyboardEvent) => {
              // Escape clears the search first, then closes the list on narrow screens
              if (event.key !== "Escape" || !this.searchText) return;
              event.stopPropagation();
              this.searchText = "";
              void this.searchTitles();
            }}
          />
          <button
            type="button"
            class="btn-icon"
            title="All articles"
            @click=${() => {
              this.closeNav();
              void this.openBrowser();
            }}
          >
            ${icon("manage_search")}<span class="visually-hidden"
              >All articles</span
            >
          </button>
          <button
            type="button"
            class="btn-icon"
            title="Files"
            @click=${() => {
              this.closeNav();
              void this.openFiles();
            }}
          >
            ${icon("folder_open")}<span class="visually-hidden">Files</span>
          </button>
        </div>
        ${this.searchResult ? this.renderSearchResult(this.searchResult, renderItem) : this.renderGroups(renderItem)}
      </nav>
      <!-- Out of reach while the article list is open over it -->
      <section class="edaha-editor-composer" ?inert=${this.navOpen}>
        ${
          this.editing
            ? keyed(
                this.formKey,
                html`<edaha-article
                  .api=${this.api}
                  .article=${this.article}
                  .typeOptions=${this.typeOptions()}
                  @article-saved=${(event: CustomEvent<ArticleLocation>) => void this.onSaved(event)}
                  @article-deleted=${() => void this.onDeleted()}
                ></edaha-article>`,
              )
            : this.renderWelcome()
        }
      </section>
      <edaha-article-browser
        .api=${this.api}
        .types=${this.types}
        @article-choose=${(event: CustomEvent<ArticleLocation>) =>
          void this.open(event.detail)}
      ></edaha-article-browser>
      <edaha-file-browser
        .api=${this.api}
        .types=${this.types}
        @files-changed=${(event: CustomEvent<FilesChanged>) =>
          void this.onFilesChanged(event.detail)}
      ></edaha-file-browser>
      ${this.renderUnsaved()}
      <edaha-toasts></edaha-toasts>
    `;
  }
}

defineElement("edaha-editor", EdahaEditor);
