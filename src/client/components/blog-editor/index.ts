import { html, LitElement, nothing } from "lit";
import { keyed } from "lit/directives/keyed.js";
import type {
  ArticleSummary,
  ArticleTypeLabels,
  EditorArticle,
} from "../../../server/types/index.ts";
import type { FieldOption } from "../blog-article-data-field/index.ts";
import { EditorApi, type ArticleLocation } from "../../editorApi/index.ts";
import { defineElement } from "../define/index.ts";
import "../blog-article/index.ts";
import type { BlogArticle } from "../blog-article/index.ts";
import "../blog-toasts/index.ts";
import {
  TOAST_EVENT,
  type BlogToasts,
  type ToastMessage,
} from "../blog-toasts/index.ts";

/**
 * Describe an article in the list, e.g. "article/hello · published · 2026-10-19".
 */
const describe = (article: ArticleSummary) =>
  [`${article.type}/${article.slug}`, article.status, article.date.slice(0, 10)]
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

/** Articles of one type, as the list shows them */
export interface ArticleGroup {
  type: string;
  /** The type's plural label (its name if it isn't configured) */
  label: string;
  articles: ArticleSummary[];
}

/**
 * Group articles by type, newest first within each group: configured types in config.yml's order, then any other types
 * alphabetically. Types without articles are left out. With a type, only that type's group is given.
 *
 * @example
 * groupArticles(articles, { news: { labelSingle: "News", labelPlural: "News" } }, "news");
 * // [{ type: "news", label: "News", articles: [...] }]
 */
export const groupArticles = (
  articles: ArticleSummary[],
  types: Record<string, ArticleTypeLabels>,
  type = "",
): ArticleGroup[] => {
  const others = [...new Set(articles.map((article) => article.type))]
    .filter((name) => !types[name])
    .sort();
  return [...Object.keys(types), ...others]
    .filter((name) => !type || name === type)
    .map((name) => ({
      type: name,
      label: types[name]?.labelPlural ?? name,
      articles: articles
        .filter((article) => article.type === name)
        .sort((a, b) => b.date.localeCompare(a.date)),
    }))
    .filter((group) => group.articles.length > 0);
};

/**
 * The article editor: a list of all articles (including drafts), grouped by type and filterable by type, the selected
 * or new article's form, and toasts for success and error messages. Opening another article or starting a new one
 * while the form has unsaved changes asks whether to save them first; closing or reloading the page gets the browser's
 * own question.
 *
 * @example
 * html`<blog-editor></blog-editor>`
 */
export class BlogEditor extends LitElement {
  static override properties = {
    api: { attribute: false },
    articles: { state: true },
    types: { state: true },
    selected: { state: true },
    article: { state: true },
    editing: { state: true },
    formKey: { state: true },
    error: { state: true },
    typeFilter: { state: true },
    unsaved: { state: true },
  };

  declare api: EditorApi;
  declare articles: ArticleSummary[];
  /** Article types from config.yml */
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
  /** The type the list shows ("" for all) */
  declare typeFilter: string;
  /** The open "Save changes first?" question, with what to do with the answer */
  declare unsaved?: ((choice: UnsavedChoice) => void) | undefined;

  /** Ask the browser before the page closes or reloads with unsaved changes (browsers word the question) */
  private readonly onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (this.form()?.dirty) event.preventDefault();
  };

  /** Show toasts fired by the form */
  private readonly onToast = (event: Event) =>
    this.toast((event as CustomEvent<ToastMessage>).detail);

  constructor() {
    super();
    this.api = new EditorApi();
    this.articles = [];
    this.types = {};
    this.editing = false;
    this.formKey = 0;
    this.error = "";
    this.typeFilter = "";
  }

  protected override createRenderRoot() {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("beforeunload", this.onBeforeUnload);
    this.addEventListener(TOAST_EVENT, this.onToast);
    void this.refresh();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("beforeunload", this.onBeforeUnload);
    this.removeEventListener(TOAST_EVENT, this.onToast);
  }

  /** The article form, while shown */
  private form(): BlogArticle | null {
    return this.querySelector<BlogArticle>("blog-article");
  }

  /** Show a toast */
  private toast(toast: ToastMessage): void {
    this.querySelector<BlogToasts>("blog-toasts")?.show(toast);
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
   * Reload the article list.
   */
  async refresh(): Promise<void> {
    try {
      [this.articles, this.types] = await Promise.all([
        this.api.list(),
        this.api.types(),
      ]);
      this.error = "";
    } catch (error) {
      this.error = (error as Error).message;
      this.toast({ kind: "error", message: this.error });
    }
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
    for (const type of new Set(this.articles.map((article) => article.type)))
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

  override render() {
    const isSelected = (article: ArticleSummary) =>
      this.selected?.type === article.type &&
      this.selected.slug === article.slug;
    return html`
      <nav aria-label="Articles">
        <h1>Articles</h1>
        <p>
          <button type="button" class="new" @click=${() => void this.create()}>
            New article
          </button>
        </p>
        <p>
          <label for="type-filter">Type</label>
          <select
            id="type-filter"
            @change=${(event: Event) =>
              (this.typeFilter = (event.target as HTMLSelectElement).value)}
          >
            <option value="" ?selected=${!this.typeFilter}>All</option>
            ${this.typeOptions().map(
              ({ value, label }) =>
                html`<option
                  value=${value}
                  ?selected=${this.typeFilter === value}
                >
                  ${label}
                </option>`,
            )}
          </select>
        </p>
        ${groupArticles(this.articles, this.types, this.typeFilter).map(
          (group) =>
            html`<div class="article-group" data-type=${group.type}>
              <h2>${group.label}</h2>
              <ul>
                ${group.articles.map(
                  (article) =>
                    html`<li>
                      <a
                        href="#${article.type}/${article.slug}"
                        aria-current=${isSelected(article) ? "page" : "false"}
                        @click=${(event: Event) => {
                          event.preventDefault();
                          void this.open(article);
                        }}
                        >${article.title}</a
                      >
                      <small>${describe(article)}</small>
                      ${article.error ? html`<small class="error">${article.error}</small>` : nothing}
                    </li>`,
                )}
              </ul>
            </div>`,
        )}
      </nav>
      <section>
        ${
          this.editing
            ? keyed(
                this.formKey,
                html`<blog-article
                  .api=${this.api}
                  .article=${this.article}
                  .typeOptions=${this.typeOptions()}
                  @article-saved=${(event: CustomEvent<ArticleLocation>) => void this.onSaved(event)}
                  @article-deleted=${() => void this.onDeleted()}
                ></blog-article>`,
              )
            : html`<p>Choose an article or write a new one.</p>`
        }
      </section>
      ${this.renderUnsaved()}
      <blog-toasts></blog-toasts>
    `;
  }
}

defineElement("blog-editor", BlogEditor);
