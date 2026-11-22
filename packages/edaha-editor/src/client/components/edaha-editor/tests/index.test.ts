// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ArticlePage,
  ArticleSummary,
  EditorArticle,
  RecentArticles,
} from "../../../../server/types";
import type { EditorApi } from "../../../editorApi";
import type { EdahaArticle } from "../../edaha-article";
import "..";
import {
  groupRecent,
  ATTENTION_COUNT,
  NAV_SEARCH_COUNT,
  WELCOME_COUNT,
  UNSAVED_DIALOG,
  type EdahaEditor,
} from "..";
import type { EdahaArticleBrowser } from "../../edaha-article-browser";
import type { EdahaFileBrowser } from "../../edaha-file-browser";
import { metadataLayout } from "@lvl99dotcom/edaha.md/generator/metadataGroups";
import { button, find, input, settle } from "../../../../shared/tests/helpers";

afterEach(() => document.body.replaceChildren());

const SUMMARIES: ArticleSummary[] = [
  {
    type: "article",
    slug: "hello",
    title: "Hello",
    status: "published",
    date: "2026-10-19T09:54:00.000Z",
    tags: [],
    updated: "2026-11-01T00:00:00.000Z",
  },
  {
    type: "page",
    slug: "broken",
    title: "broken",
    status: "draft",
    date: "",
    error: "Bad date",
    tags: [],
    updated: "2026-11-01T00:00:00.000Z",
  },
];

/** Each type's most recently changed articles, as the API gives them (types alphabetically) */
const RECENT: RecentArticles[] = [
  { type: "article", articles: [SUMMARIES[0]!], total: 7 },
  { type: "page", articles: [SUMMARIES[1]!], total: 1 },
];

/** A page of search matches */
const matches = (articles: ArticleSummary[], total = articles.length) =>
  ({ articles, total, page: 1, pages: 1, perPage: 10 }) as ArticlePage;

const ARTICLE = {
  type: "article",
  slug: "hello",
  status: "published",
  date: "2026-10-19T09:54:00.000Z",
  title: "Hello",
  tags: [],
  attachments: [],
  bodyHtml: "<p>Body</p>",
  files: [],
} as EditorArticle;

/** Mount the editor with a fake API */
const setup = async (recent = vi.fn(async () => RECENT)) => {
  const api = {
    recent,
    // No articles have metadata problems unless a test says so
    query: vi.fn(async (query: { problems?: string }) =>
      query.problems ? matches([]) : matches([SUMMARIES[0]!]),
    ),
    filters: vi.fn(async () => ({ types: [], authors: [], tags: [] })),
    site: vi.fn(async () => ({
      name: "Test News",
      author: { name: "Matt", email: "matt@example.com" },
      types: {},
    })),
    metadata: vi.fn(async () => ({
      definitions: {},
      types: {},
      groups: metadataLayout({}, {}),
    })),
    templates: vi.fn(async () => ["single"]),
    types: vi.fn(async () => ({
      article: { labelSingle: "Article", labelPlural: "Articles" },
      video: { labelSingle: "Video", labelPlural: "Videos" },
    })),
    read: vi.fn(async () => ARTICLE),
    toMarkdown: vi.fn(async (html: string) => html.replace(/<[^>]+>/g, "")),
    save: vi.fn(
      async (_from: unknown, data: { type: string; slug: string }) => ({
        type: data.type,
        slug: data.slug,
      }),
    ),
  } as unknown as EditorApi & {
    recent: typeof recent;
    query: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  const element = document.createElement("edaha-editor") as EdahaEditor;
  element.api = api;
  document.body.append(element);
  await settle(element);
  return { api, element };
};

describe("edaha-editor", () => {
  it("should list each type's most recently changed articles with their details and errors", async () => {
    const { element } = await setup();
    const items = [...element.querySelectorAll("nav li")];
    expect(items.map((li) => li.querySelector("a")!.textContent)).toEqual([
      "Hello",
      "broken",
    ]);
    expect(items[0]!.querySelector("small")!.textContent).toBe(
      "hello · published · 2026-10-19",
    );
    expect(items[1]!.querySelector("small")!.textContent).toBe(
      "broken · draft",
    );
    expect(items[1]!.querySelector(".error")!.textContent).toBe("Bad date");
  });

  it("should welcome with the most recently changed articles, centred in the pane, until an article is opened", async () => {
    const { element, api } = await setup();
    expect(api.query).toHaveBeenCalledWith({
      sort: "updated",
      perPage: WELCOME_COUNT,
    });
    const welcome = find(element, ".edaha-editor-composer .welcome-prompt");
    // The message comes first, above the articles
    expect(
      welcome
        .querySelector(".welcome-prompt-box")!
        .firstElementChild!.textContent?.replace(/\s+/g, " ")
        .trim(),
    ).toBe("Write a new article or edit an existing one...");
    const list = find(welcome, ".welcome-prompt-list");
    expect(list.getAttribute("aria-label")).toBe("Recently changed articles");
    expect(
      [...list.querySelectorAll("li")].map((li) => [
        li.querySelector("a")!.textContent,
        li.querySelector("small")!.textContent?.replace(/\s+/g, " "),
      ]),
    ).toEqual([["Hello", "Article · changed 2026-11-01"]]);
    // All the articles are shown, so there's no link to the browser
    expect(welcome.querySelector(".welcome-prompt-browse")).toBeNull();
    expect(
      [...welcome.querySelectorAll(".welcome-prompt-message button")].map((b) =>
        b.textContent?.trim(),
      ),
    ).toEqual(["Write a new article", "edit an existing one"]);

    find<HTMLAnchorElement>(list, "a").click();
    await settle(element);
    expect(api.read).toHaveBeenCalledWith(SUMMARIES[0]);
    expect(element.querySelector(".welcome-prompt")).toBeNull();
  });

  it("should link to the article browser when there are more articles than the welcome prompt shows", async () => {
    const { element, api } = await setup();
    api.query.mockResolvedValueOnce(matches(SUMMARIES, 9));
    await element.refresh();
    await element.updateComplete;
    const browser = find<EdahaArticleBrowser>(element, "edaha-article-browser");
    const show = vi.spyOn(browser, "show").mockResolvedValue();
    expect(
      element.querySelectorAll(".welcome-prompt-box > .welcome-prompt-list li"),
    ).toHaveLength(2);
    button(element, "Open article browser").click();
    expect(show).toHaveBeenCalledWith({});
  });

  it('should start a new article from "Write a new article", and open the article browser from "edit an existing one"', async () => {
    const { element } = await setup();
    const browser = find<EdahaArticleBrowser>(element, "edaha-article-browser");
    const show = vi.spyOn(browser, "show").mockResolvedValue();
    button(element, "edit an existing one").click();
    expect(show).toHaveBeenCalledWith({});
    button(element, "Write a new article").click();
    await settle(element);
    expect(
      find<EdahaArticle>(element, "edaha-article").article,
    ).toBeUndefined();
    expect(element.querySelector(".welcome-prompt")).toBeNull();
  });

  it("should list articles with metadata problems on the welcome prompt", async () => {
    const { element, api } = await setup();
    expect(api.query).toHaveBeenCalledWith({
      problems: "any",
      sort: "title",
      perPage: ATTENTION_COUNT,
    });
    expect(element.querySelector(".welcome-attention")).toBeNull();
    const withProblems = {
      ...SUMMARIES[1]!,
      problems: [
        {
          path: "rating",
          message: "must be at most 10",
          level: "error" as const,
        },
      ],
    };
    api.query.mockImplementation(async (query: { problems?: string }) =>
      query.problems
        ? matches([withProblems, { ...SUMMARIES[0]!, problems: [] }], 7)
        : matches([SUMMARIES[0]!]),
    );
    await element.refresh();
    await element.updateComplete;
    const section = find(element, ".welcome-attention");
    expect(find(section, "h2").textContent).toBe("Needs attention");
    expect(section.getAttribute("aria-labelledby")).toBe(
      "welcome-attention-title",
    );
    expect(
      [...section.querySelectorAll("li")].map((li) =>
        li.textContent?.replace(/\s+/g, " ").trim(),
      ),
    ).toEqual(['broken ⚠️ 1 error: "rating" must be at most 10', "Hello ⚠️"]);
    const browser = find<EdahaArticleBrowser>(element, "edaha-article-browser");
    const show = vi.spyOn(browser, "show").mockResolvedValue();
    button(element, "See all 7 articles with problems").click();
    expect(show).toHaveBeenCalledWith({ problems: "any" });
    find<HTMLAnchorElement>(section, "a").click();
    await settle(element);
    expect(api.read).toHaveBeenCalledWith(withProblems);
    // All of them shown: no link
    api.query.mockImplementation(async (query: { problems?: string }) =>
      query.problems ? matches([withProblems]) : matches([SUMMARIES[0]!]),
    );
    element.editing = false;
    await element.refresh();
    await element.updateComplete;
    expect(
      element.querySelector(".welcome-attention .welcome-prompt-browse"),
    ).toBeNull();
  });

  it("should welcome with the message alone when there are no articles", async () => {
    const { element, api } = await setup();
    api.query.mockResolvedValueOnce(matches([]));
    await element.refresh();
    await element.updateComplete;
    expect(
      element.querySelector(".welcome-prompt-box > .welcome-prompt-list"),
    ).toBeNull();
    expect(
      find(element, ".welcome-prompt-message")
        .textContent?.replace(/\s+/g, " ")
        .trim(),
    ).toBe("Write a new article or edit an existing one...");
  });

  it("should label the groups, linking to all of a type's articles when it has more", async () => {
    const { element } = await setup();
    const browser = find<EdahaArticleBrowser>(element, "edaha-article-browser");
    const show = vi.spyOn(browser, "show").mockResolvedValue();
    const groups = [...element.querySelectorAll(".edaha-editor-article-group")];
    expect(
      groups.map((group) => [
        group.querySelector("h2")!.textContent,
        group
          .querySelector(".show-all")
          ?.textContent?.replace(/\s+/g, " ")
          .trim(),
      ]),
    ).toEqual([
      ["Articles", "Show all Articles (7)"],
      ["page", undefined],
    ]);
    (groups[0]!.querySelector(".show-all") as HTMLButtonElement).click();
    expect(show).toHaveBeenCalledWith({ type: "article" });
    expect(browser.types).toBe(element.types);
  });

  it("should open the article browser from the All articles button, and open the article chosen in it", async () => {
    const { element, api } = await setup();
    const browser = find<EdahaArticleBrowser>(element, "edaha-article-browser");
    const show = vi.spyOn(browser, "show").mockResolvedValue();
    button(element, "All articles").click();
    expect(show).toHaveBeenCalledWith({});
    browser.dispatchEvent(
      new CustomEvent("article-choose", {
        detail: { type: "page", slug: "broken" },
        bubbles: true,
      }),
    );
    await settle(element);
    expect(api.read).toHaveBeenCalledWith({ type: "page", slug: "broken" });
  });

  it("should search titles as you type, showing the first matches in place of the groups", async () => {
    const { element, api } = await setup();
    element.searchDelay = 0;
    const search = find<HTMLInputElement>(element, "#article-search");
    expect(search.labels?.[0]?.textContent).toBe("Search titles");
    input(search, "  hel ");
    await vi.waitFor(() => find(element, ".search-results"));
    expect(api.query).toHaveBeenCalledWith({
      search: "hel",
      perPage: NAV_SEARCH_COUNT,
    });
    expect(find(element, ".search-results h2").textContent?.trim()).toBe(
      "1 match",
    );
    expect(
      element.querySelector('.search-results [role="status"]'),
    ).not.toBeNull();
    expect(element.querySelector(".search-results .show-all")).toBeNull();
    expect(element.querySelector("[data-type]")).toBeNull();

    // More matches than shown link to them all in the article browser
    api.query.mockResolvedValueOnce(matches(SUMMARIES, 12));
    input(search, "e");
    await vi.waitFor(() =>
      expect(find(element, ".search-results h2").textContent?.trim()).toBe(
        "12 matches",
      ),
    );
    const browser = find<EdahaArticleBrowser>(element, "edaha-article-browser");
    const show = vi.spyOn(browser, "show").mockResolvedValue();
    button(element, "See all results").click();
    expect(show).toHaveBeenCalledWith({ search: "e" });

    // Clearing the search shows the groups again
    input(search, "   ");
    await vi.waitFor(() => expect(element.searchResult).toBeUndefined());
    expect(element.querySelector("[data-type]")).not.toBeNull();
  });

  it("should clear the search with Escape, then leave Escape to close the list", async () => {
    const { element } = await setup();
    element.searchDelay = 0;
    const search = find<HTMLInputElement>(element, "#article-search");
    input(search, "hello");
    await vi.waitFor(() => find(element, ".search-results"));
    const onKey = vi.fn();
    element.addEventListener("keydown", onKey);
    const escape = () =>
      search.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    escape();
    await settle(element);
    expect(element.searchText).toBe("");
    expect(element.searchResult).toBeUndefined();
    expect(onKey).not.toHaveBeenCalled();
    escape();
    search.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", bubbles: true }),
    );
    expect(onKey).toHaveBeenCalledTimes(2);
  });

  it("should show only the latest search's matches, and search errors", async () => {
    const { element, api } = await setup();
    let answerFirst: (page: ArticlePage) => void = () => {};
    api.query.mockImplementationOnce(
      () => new Promise((resolve) => (answerFirst = resolve)),
    );
    element.searchText = "first";
    const first = element.searchTitles();
    element.searchText = "second";
    await element.searchTitles();
    answerFirst(matches(SUMMARIES));
    await first;
    expect(element.searchResult?.articles).toEqual([SUMMARIES[0]]);

    let failFirst: (error: Error) => void = () => {};
    api.query.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (failFirst = reject)),
    );
    const failing = element.searchTitles();
    await element.searchTitles();
    failFirst(new Error("Too late"));
    await failing;
    expect(element.error).toBe("");

    api.query.mockRejectedValueOnce(new Error("Search failed"));
    await element.searchTitles();
    await element.updateComplete;
    expect(find(element, ".toast.error span").textContent).toBe(
      "Search failed",
    );
  });

  it("should search again when the list refreshes, and stop waiting to search when removed", async () => {
    const { element, api } = await setup();
    /** How many title searches were made */
    const searches = () =>
      api.query.mock.calls.filter(([query]) => query.search).length;
    element.searchText = "hello";
    await element.refresh();
    expect(searches()).toBe(1);
    element.searchDelay = 1000;
    input(find<HTMLInputElement>(element, "#article-search"), "later");
    element.remove();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(searches()).toBe(1);
  });

  it("should show list errors", async () => {
    const { element } = await setup(
      vi.fn().mockRejectedValue(new Error("Server down")),
    );
    expect(find(element, ".toast.error span").textContent).toBe("Server down");
  });

  it("should open an article", async () => {
    const { element, api } = await setup();
    find(element, "nav li a").click();
    await settle(element);
    expect(api.read).toHaveBeenCalledWith(SUMMARIES[0]);
    const form = find<EdahaArticle>(element, "edaha-article");
    expect(form.article).toBe(ARTICLE);
    expect(form.site).toEqual({
      name: "Test News",
      author: { name: "Matt", email: "matt@example.com" },
      types: {},
    });
    // Configured types first, then other types articles use
    expect(form.typeOptions).toEqual([
      { value: "article", label: "Article" },
      { value: "video", label: "Video" },
      { value: "page", label: "page" },
    ]);
    expect(find(element, "nav li a").getAttribute("aria-current")).toBe("page");
  });

  it("should show errors opening an article", async () => {
    const { element, api } = await setup();
    api.read.mockRejectedValueOnce(new Error("Article page/broken not found"));
    await element.open(SUMMARIES[1]!);
    await element.updateComplete;
    expect(find(element, ".toast.error span").textContent).toBe(
      "Article page/broken not found",
    );
    expect(element.querySelector("edaha-article")).toBeNull();
  });

  it("should start a new article", async () => {
    const { element } = await setup();
    button(element, "New article").click();
    await settle(element);
    expect(
      find<EdahaArticle>(element, "edaha-article").article,
    ).toBeUndefined();
  });

  it("should start a fresh form for each new article", async () => {
    const { element } = await setup();
    button(element, "New article").click();
    await settle(element);
    const first = find<EdahaArticle>(element, "edaha-article");
    button(element, "New article").click();
    // Checking the open form for changes waits for its body, which can take a few turns
    await vi.waitFor(() =>
      expect(find<EdahaArticle>(element, "edaha-article")).not.toBe(first),
    );
  });

  it("should refresh the list after saving and close the form after deleting", async () => {
    const { element, api } = await setup();
    await element.open(SUMMARIES[0]!);
    await element.updateComplete;
    const form = find<EdahaArticle>(element, "edaha-article");
    form.dispatchEvent(
      new CustomEvent("article-saved", {
        detail: { type: "article", slug: "moved" },
        bubbles: true,
      }),
    );
    await settle(element);
    expect(api.recent).toHaveBeenCalledTimes(2);
    expect(element.selected).toEqual({ type: "article", slug: "moved" });

    form.dispatchEvent(new CustomEvent("article-deleted", { bubbles: true }));
    await settle(element);
    expect(api.recent).toHaveBeenCalledTimes(3);
    expect(element.querySelector("edaha-article")).toBeNull();
    expect(element.selected).toBeUndefined();
  });

  it("should create its own API by default", () => {
    const element = document.createElement("edaha-editor") as EdahaEditor;
    expect(element.api).toBeDefined();
  });
});

describe("edaha-editor files", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  /** Tell the editor a file changed */
  const filesChanged = async (
    element: EdahaEditor,
    file: { type: string; slug: string },
    articles: { type: string; slug: string }[] = [],
  ) => {
    find(element, "edaha-file-browser").dispatchEvent(
      new CustomEvent("files-changed", {
        detail: { file: { ...file, name: "a.png" }, articles },
        bubbles: true,
      }),
    );
    await settle(element);
  };

  it("should open the file browser from the Files button", async () => {
    const { element } = await setup();
    const browser = find<EdahaFileBrowser>(element, "edaha-file-browser");
    const show = vi.spyOn(browser, "show").mockResolvedValue();
    expect(browser.api).toBe(element.api);
    expect(browser.types).toBe(element.types);
    await element.openNav();
    button(element, "Files").click();
    expect(show).toHaveBeenCalledOnce();
    expect(element.navOpen).toBe(false);
  });

  it("should let the article form choose existing files in the file browser", async () => {
    const { element } = await setup();
    const browser = find<EdahaFileBrowser>(element, "edaha-file-browser");
    const file = {
      type: "news",
      slug: "x",
      name: "a.png",
      kind: "image" as const,
      size: 1,
      updated: "2026-11-01T00:00:00.000Z",
      url: "/news/x/a.png",
    };
    const pick = vi.spyOn(browser, "pick").mockResolvedValue(file);
    button(element, "New article").click();
    await settle(element);
    const article = find<EdahaArticle>(element, "edaha-article");
    expect(await article.pickFile?.("image")).toBe(file);
    expect(pick).toHaveBeenCalledWith("image");
  });

  it("should refresh, and show the open article again when a file change touched it", async () => {
    const { element, api } = await setup();
    await element.open(SUMMARIES[0]!);
    await settle(element);
    const reads = api.read.mock.calls.length;
    const recents = api.recent.mock.calls.length;
    // Another article's file, not referred to by the open one
    await filesChanged(element, { type: "page", slug: "broken" });
    expect(api.recent).toHaveBeenCalledTimes(recents + 1);
    expect(api.read).toHaveBeenCalledTimes(reads);
    // The open article's own file
    await filesChanged(element, { type: "article", slug: "hello" });
    expect(api.read).toHaveBeenCalledTimes(reads + 1);
    // A file the open article refers to
    await filesChanged(element, { type: "page", slug: "broken" }, [
      { type: "article", slug: "hello" },
    ]);
    expect(api.read).toHaveBeenCalledTimes(reads + 2);
  });

  it("should warn instead when the touched article has unsaved changes, and do nothing with none open", async () => {
    const { element, api } = await setup();
    await filesChanged(element, { type: "article", slug: "hello" });
    expect(api.read).not.toHaveBeenCalled();
    await element.open(SUMMARIES[0]!);
    await settle(element);
    const form = find<EdahaArticle>(element, "edaha-article");
    form.bodyCheckDelay = 0;
    input(
      find<HTMLInputElement>(
        form,
        "edaha-article-data-field[name=title] input",
      ),
      "Changed",
    );
    await settle(element);
    await filesChanged(element, { type: "article", slug: "hello" });
    expect(api.read).toHaveBeenCalledTimes(1);
    expect(find(element, ".toast.error span").textContent).toContain(
      "it has unsaved changes",
    );
  });

  it("should open the article the page's address names", async () => {
    window.history.replaceState(null, "", "/#page/broken");
    const { api } = await setup();
    expect(api.read).toHaveBeenCalledWith({ type: "page", slug: "broken" });
    window.history.replaceState(null, "", "/#not an article");
    const { api: other } = await setup();
    expect(other.read).not.toHaveBeenCalled();
  });
});

describe("groupRecent", () => {
  it("should label each type and order configured types first, in the config file's order, then others alphabetically", () => {
    const group = (type: string) => ({ type, articles: [], total: 1 });
    expect(
      groupRecent(
        [group("docs"), group("news"), group("page"), group("zines")],
        {
          page: { labelSingle: "Page", labelPlural: "Pages" },
          news: { labelSingle: "News item", labelPlural: "News" },
        },
      ).map(({ type, label }) => [type, label]),
    ).toEqual([
      ["page", "Pages"],
      ["news", "News"],
      ["docs", "docs"],
      ["zines", "zines"],
    ]);
  });
});

describe("edaha-editor unsaved changes", () => {
  /** Open the first article and change its title */
  const editTitle = async () => {
    const result = await setup();
    const { element } = result;
    await element.open(SUMMARIES[0]!);
    await settle(element);
    const form = find<EdahaArticle>(element, "edaha-article");
    form.bodyCheckDelay = 0;
    input(
      find<HTMLInputElement>(
        form,
        "edaha-article-data-field[name=title] input",
      ),
      "Changed",
    );
    await settle(element);
    return { ...result, form };
  };

  /** Answer the "Save changes first?" question */
  const answer = async (element: EdahaEditor, choice: string) => {
    await vi.waitFor(() => find(element, ".unsaved"));
    find(element, `.unsaved [data-choice="${choice}"]`).click();
    await settle(element);
  };

  it("should ask before opening another article, and stay on cancel", async () => {
    const { element, form, api } = await editTitle();
    const opening = element.open(SUMMARIES[0]!);
    await settle(element);
    const dialog = find(element, ".unsaved");
    expect(dialog.getAttribute("role")).toBe("alertdialog");
    expect(find(dialog, "h2").textContent).toBe(UNSAVED_DIALOG.heading);
    expect(find(dialog, "p").textContent).toBe(UNSAVED_DIALOG.message);
    expect(
      [...dialog.querySelectorAll("button")].map((b) => b.textContent?.trim()),
    ).toEqual(["Save", "Don't save", "Cancel"]);
    await answer(element, "cancel");
    await opening;
    expect(element.querySelector(".unsaved")).toBeNull();
    expect(api.read).toHaveBeenCalledOnce();
    expect(find(element, "edaha-article")).toBe(form);
  });

  it("should open the other article without saving on Don't save", async () => {
    const { element, api } = await editTitle();
    const opening = element.open(SUMMARIES[0]!);
    await answer(element, "discard");
    await opening;
    expect(api.save).not.toHaveBeenCalled();
    expect(api.read).toHaveBeenCalledTimes(2);
  });

  it("should save first on Save, and stay if saving fails", async () => {
    const { element, api } = await editTitle();
    api.save.mockRejectedValueOnce(new Error("Disk full"));
    const failing = element.create();
    await answer(element, "save");
    await failing;
    expect(find<EdahaArticle>(element, "edaha-article").article).toBe(ARTICLE);
    expect(find(element, ".toast.error span").textContent).toBe("Disk full");

    const creating = element.create();
    await answer(element, "save");
    await creating;
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(
      find<EdahaArticle>(element, "edaha-article").article,
    ).toBeUndefined();
    expect(find(element, ".toast.success span").textContent).toBe("Saved");
  });

  it("should go back to the welcome prompt from the title, asking first about unsaved changes", async () => {
    const { element, api } = await editTitle();
    const title = find<HTMLButtonElement>(element, ".edaha-title button");
    expect(title.title).toBe("Show the welcome prompt");
    expect(title.textContent?.trim()).toBe("edaha.md");
    title.click();
    await answer(element, "cancel");
    expect(element.querySelector("edaha-article")).not.toBeNull();
    const recents = api.recent.mock.calls.length;
    title.click();
    await answer(element, "discard");
    expect(element.querySelector("edaha-article")).toBeNull();
    expect(element.querySelector(".welcome-prompt")).not.toBeNull();
    expect(element.selected).toBeUndefined();
    expect(api.recent).toHaveBeenCalledTimes(recents + 1);
  });

  it("should go back to the welcome prompt from Home, asking first about unsaved changes", async () => {
    const { element, api } = await editTitle();
    const home = find<HTMLButtonElement>(element, ".btn-home");
    expect(home.textContent?.trim()).toBe("Home");
    expect(home.hasAttribute("aria-current")).toBe(false);
    home.click();
    await answer(element, "cancel");
    expect(element.querySelector("edaha-article")).not.toBeNull();
    const recents = api.recent.mock.calls.length;
    home.click();
    await answer(element, "discard");
    expect(element.querySelector("edaha-article")).toBeNull();
    expect(element.querySelector(".welcome-prompt")).not.toBeNull();
    expect(api.recent).toHaveBeenCalledTimes(recents + 1);
    // Home says when the welcome prompt is showing
    expect(home.getAttribute("aria-current")).toBe("page");
  });

  it("should not ask when nothing changed", async () => {
    const { element, api } = await setup();
    await element.open(SUMMARIES[0]!);
    await settle(element);
    await element.open(SUMMARIES[0]!);
    expect(element.querySelector(".unsaved")).toBeNull();
    expect(api.read).toHaveBeenCalledTimes(2);
  });

  it("should ask the browser before the page closes with unsaved changes, until removed", async () => {
    /** Fire beforeunload and say whether the browser would ask */
    const asks = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const { element } = await setup();
    expect(asks()).toBe(false);
    await element.open(SUMMARIES[0]!);
    await settle(element);
    expect(asks()).toBe(false);
    input(
      find<HTMLInputElement>(
        element,
        "edaha-article-data-field[name=title] input",
      ),
      "Changed",
    );
    await settle(element);
    expect(asks()).toBe(true);
    element.remove();
    expect(asks()).toBe(false);
  });
});

describe("edaha-editor theme switcher", () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
    localStorage.clear();
  });

  it("should switch the theme and say which theme it switches to next", async () => {
    const { element } = await setup();
    const switcher = find<HTMLButtonElement>(element, ".theme-switcher");
    expect(switcher.title).toBe("Switch to the dark theme");
    switcher.click();
    await settle(element);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(switcher.title).toBe("Switch to the light theme");
    expect(switcher.textContent?.trim()).toBe("Switch to the light theme");
  });
});

describe("edaha-editor article list on narrow screens", () => {
  afterEach(() => {
    // @ts-expect-error -- jsdom has no matchMedia
    delete window.matchMedia;
  });

  /** Fake matchMedia, keeping the narrow-screen listeners so a change can be fired */
  const watchNarrow = () => {
    const listeners: (() => void)[] = [];
    const query = {
      matches: true,
      addEventListener: (_type: string, listener: () => void) =>
        listeners.push(listener),
      removeEventListener: vi.fn(),
    };
    window.matchMedia = vi.fn(
      () => query,
    ) as unknown as typeof window.matchMedia;
    return { change: () => listeners.forEach((listener) => listener()), query };
  };

  /** Press a key in the page's focused element */
  const press = (key: string) =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true }),
    );

  it("should open the list from the menu button and close it, moving focus between them", async () => {
    const { element } = await setup();
    const toggle = find<HTMLButtonElement>(element, ".nav-toggle");
    const nav = find(element, "nav");
    const composer = find(element, ".edaha-editor-composer");
    expect(toggle.getAttribute("aria-controls")).toBe(nav.id);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent?.trim()).toBe("Articles");
    expect(toggle.querySelector(".icon-menu")).not.toBeNull();

    toggle.click();
    await settle(element);
    expect(element.navOpen).toBe(true);
    expect(nav.classList.contains("open")).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(composer.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(find(element, ".nav-close"));

    // Escape, the close button and the backdrop close it
    press("Tab");
    expect(element.navOpen).toBe(true);
    press("Escape");
    await settle(element);
    expect(element.navOpen).toBe(false);
    expect(composer.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(toggle);
    await element.openNav();
    button(element, "Close articles").click();
    await settle(element);
    expect(element.navOpen).toBe(false);
    await element.openNav();
    find(element, ".nav-backdrop.open").click();
    await settle(element);
    expect(element.navOpen).toBe(false);
    // Closing it from outside leaves focus where it is
    await element.openNav();
    toggle.focus();
    element.closeNav();
    element.closeNav();
    expect(document.activeElement).toBe(toggle);
  });

  it("should close the list when an article is chosen or a new one started", async () => {
    const { element } = await setup();
    await element.openNav();
    find(element, "nav li a").click();
    await settle(element);
    expect(element.navOpen).toBe(false);
    expect(element.querySelector("edaha-article")).not.toBeNull();
    await element.openNav();
    button(element, "New article").click();
    await settle(element);
    expect(element.navOpen).toBe(false);
  });

  it("should follow the screen's width until removed, closing the list when the screen stops being narrow", async () => {
    const { change, query } = watchNarrow();
    const { element } = await setup();
    expect(element.narrow).toBe(true);
    expect(element.hasAttribute("compact")).toBe(true);
    await element.openNav();
    query.matches = false;
    change();
    await settle(element);
    expect(element.narrow).toBe(false);
    expect(element.hasAttribute("compact")).toBe(false);
    expect(element.navOpen).toBe(false);
    element.remove();
    expect(query.removeEventListener).toHaveBeenCalled();
  });
});

describe("edaha-editor focus mode", () => {
  it("should be off at first, and turned on and off by the article form, with the compact layout", async () => {
    const { element } = await setup();
    expect(element.focusMode).toBe(false);
    expect(element.hasAttribute("compact")).toBe(false);
    expect(element.hasAttribute("focus-mode")).toBe(false);
    button(element, "New article").click();
    await settle(element);
    const article = find<EdahaArticle>(element, "edaha-article");
    expect(article.compact).toBe(false);

    find(article, ".btn-focus-mode").click();
    await settle(element);
    expect(element.focusMode).toBe(true);
    expect(element.hasAttribute("compact")).toBe(true);
    expect(element.hasAttribute("focus-mode")).toBe(true);
    expect(article.compact).toBe(true);
    expect(article.focusMode).toBe(true);

    // Turning it off closes the article list and the settings, which are shown beside the article again
    await element.openNav();
    article.metadataOpen = true;
    find(article, ".btn-focus-mode").click();
    await settle(element);
    await settle(article);
    expect(element.focusMode).toBe(false);
    expect(element.hasAttribute("compact")).toBe(false);
    expect(element.navOpen).toBe(false);
    expect(article.metadataOpen).toBe(false);
  });
});
