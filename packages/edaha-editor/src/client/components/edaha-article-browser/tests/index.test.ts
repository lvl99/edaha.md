// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArticlePage, ArticleSummary } from "../../../../server/types";
import type { EditorApi } from "../../../editorApi";
import "..";
import { countProblems, typeLabel, type EdahaArticleBrowser } from "..";
import {
  button,
  find,
  input,
  mount,
  settle,
} from "../../../../shared/tests/helpers";

// jsdom has no dialogs: open and close them by their `open` attribute
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

afterEach(() => document.body.replaceChildren());

/** An article summary */
const summary = (overrides: Partial<ArticleSummary>): ArticleSummary => ({
  type: "news",
  slug: "hello",
  title: "Hello",
  status: "published",
  date: "2026-10-19T09:54:00.000Z",
  tags: [],
  updated: "2026-11-01T00:00:00.000Z",
  ...overrides,
});

/** A page of results */
const page = (
  articles: ArticleSummary[],
  overrides: Partial<ArticlePage> = {},
): ArticlePage => ({
  articles,
  total: articles.length,
  page: 1,
  pages: 1,
  perPage: 50,
  ...overrides,
});

/** A browser with a fake API, opened */
const setup = async () => {
  const api = {
    query: vi.fn(async () =>
      page([
        summary({ author: "Zoë" }),
        summary({
          type: "page",
          slug: "broken",
          title: "broken",
          date: "",
          error: "Bad date",
        }),
      ]),
    ),
    filters: vi.fn(async () => ({
      types: ["news", "page"],
      authors: ["Matt", "Zoë"],
      tags: ["Releases"],
    })),
  } as unknown as EditorApi &
    Record<"query" | "filters", ReturnType<typeof vi.fn>>;
  const element = await mount<EdahaArticleBrowser>("edaha-article-browser", {
    api,
    types: { news: { labelSingle: "News item", labelPlural: "News" } },
  });
  element.searchDelay = 0;
  return { api, element };
};

/** Choose an option in a select and wait for the results */
const choose = async (
  element: EdahaArticleBrowser,
  id: string,
  value: string,
) => {
  input(find<HTMLSelectElement>(element, `#${id}`), value, "change");
  await settle(element);
};

describe("typeLabel", () => {
  it("should give a type's singular label, or its name", () => {
    const types = { news: { labelSingle: "News item", labelPlural: "News" } };
    expect(typeLabel(types, "news")).toBe("News item");
    expect(typeLabel(types, "page")).toBe("page");
  });
});

describe("countProblems", () => {
  it("should count errors and warnings", () => {
    const problem = (level: "error" | "warning") => ({
      path: "a",
      message: "x",
      level,
    });
    expect(countProblems()).toBe("");
    expect(countProblems([problem("error")])).toBe("1 error");
    expect(
      countProblems([problem("error"), problem("error"), problem("warning")]),
    ).toBe("2 errors, 1 warning");
    expect(countProblems([problem("warning"), problem("warning")])).toBe(
      "2 warnings",
    );
  });
});

describe("edaha-article-browser", () => {
  it("should be closed before it renders", () => {
    const element = document.createElement(
      "edaha-article-browser",
    ) as EdahaArticleBrowser;
    expect(element.open).toBe(false);
  });

  it("should open as a dialog with focus in the search, showing the articles found", async () => {
    const { element, api } = await setup();
    const dialog = find<HTMLDialogElement>(element, "dialog");
    expect(element.open).toBe(false);
    expect(dialog.getAttribute("aria-labelledby")).toBe(
      "article-browser-title",
    );
    expect(find(element, "#article-browser-title").textContent?.trim()).toBe(
      "All articles",
    );
    expect(find(element, '[role="status"]').textContent?.trim()).toBe(
      "Loading…",
    );

    await element.show({ search: "hel", type: "news" });
    await settle(element);
    expect(element.open).toBe(true);
    expect(document.activeElement?.id).toBe("article-browser-search");
    expect(
      find<HTMLInputElement>(element, "#article-browser-search").value,
    ).toBe("hel");
    expect(api.query).toHaveBeenCalledWith({
      search: "hel",
      type: "news",
      author: "",
      tag: "",
      status: undefined,
      sort: undefined,
      order: undefined,
      page: 1,
    });
    expect(find(element, '[role="status"]').textContent?.trim()).toBe(
      "2 articles found",
    );
    const table = find(element, "table.article-browser-table");
    expect(
      [...table.querySelectorAll("thead th")].map((th) => [
        th.getAttribute("scope"),
        th.textContent?.trim(),
      ]),
    ).toEqual([
      ["col", "Title"],
      ["col", "Type"],
      ["col", "Status"],
      ["col", "Published"],
      ["col", "Changed"],
    ]);
    const rows = [...table.querySelectorAll("tbody tr")];
    expect(
      rows.map((row) =>
        [...row.querySelectorAll("td")].map((td) =>
          (td.querySelector("a") ?? td).textContent?.trim(),
        ),
      ),
    ).toEqual([
      ["Hello", "News item", "Published", "2026-10-19", "2026-11-01"],
      ["broken", "page", "Published", "", "2026-11-01"],
    ]);
    expect(rows[1]!.querySelector(".error")!.textContent).toBe("Bad date");
    // Showing it again while open keeps it open
    await element.show();
    expect(element.open).toBe(true);
  });

  it("should offer the types, authors, tags and statuses in use as filters", async () => {
    const { element } = await setup();
    await element.show();
    await settle(element);
    const options = (id: string) =>
      [...find<HTMLSelectElement>(element, `#${id}`).options].map((o) =>
        o.textContent?.trim(),
      );
    expect(options("article-browser-type")).toEqual([
      "All types",
      "News item",
      "page",
    ]);
    expect(options("article-browser-author")).toEqual([
      "Any author",
      "Matt",
      "Zoë",
    ]);
    expect(options("article-browser-tag")).toEqual(["Any tag", "Releases"]);
    expect(options("article-browser-status")).toEqual([
      "Any status",
      "Published",
      "Draft",
      "Unlisted",
    ]);
    // Sorting is done by the column headers
    expect(element.querySelector("#article-browser-sort")).toBeNull();
    expect(element.querySelector("#article-browser-order")).toBeNull();
    for (const id of ["type", "author", "tag", "status"])
      expect(
        find(element, `label[for="article-browser-${id}"]`).textContent,
      ).toBeTruthy();
  });

  it("should search and filter, going back to the first page", async () => {
    const { element, api } = await setup();
    await element.show();
    await settle(element);
    element.page = 3;
    await choose(element, "article-browser-author", "Zoë");
    await choose(element, "article-browser-tag", "Releases");
    await choose(element, "article-browser-status", "draft");
    await choose(element, "article-browser-type", "page");
    element.page = 2;
    input(find<HTMLInputElement>(element, "#article-browser-search"), "bro");
    await vi.waitFor(() =>
      expect(api.query).toHaveBeenLastCalledWith({
        search: "bro",
        type: "page",
        author: "Zoë",
        tag: "Releases",
        status: "draft",
        sort: undefined,
        order: undefined,
        page: 1,
      }),
    );
  });

  it("should find articles with metadata problems, showing how many each has", async () => {
    const { element, api } = await setup();
    api.query.mockResolvedValue(
      page([
        summary({
          problems: [
            { path: "a", message: "is wrong", level: "error" },
            { path: "b", message: "isn't used", level: "warning" },
          ],
        }),
      ]),
    );
    await element.show({ problems: "any" });
    await settle(element);
    expect(api.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ problems: "any" }),
    );
    const select = find<HTMLSelectElement>(
      element,
      "#article-browser-problems",
    );
    expect(select.value).toBe("any");
    expect([...select.options].map((o) => o.textContent?.trim())).toEqual([
      "Any article",
      "With errors",
      "With warnings",
      "With errors or warnings",
    ]);
    expect(find(element, "tbody .problems").textContent?.trim()).toBe(
      "⚠️ 1 error, 1 warning",
    );
    input(select, "errors", "change");
    await settle(element);
    expect(api.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ problems: "errors" }),
    );
    // Opening it again without problems finds every article
    await element.show();
    expect(api.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ problems: undefined }),
    );
  });

  it("should sort by a column ascending, then descending, then go back to the default order", async () => {
    const { element, api } = await setup();
    await element.show();
    await settle(element);
    const header = (label: string) =>
      [...element.querySelectorAll("thead th")].find(
        (th) => th.textContent?.replace(/[▲▼]/g, "").trim() === label,
      )!;
    const press = async (label: string) => {
      header(label).querySelector("button")!.click();
      await settle(element);
    };
    const lastQuery = () => api.query.mock.calls.at(-1)![0];
    expect(header("Title").getAttribute("aria-sort")).toBe("none");
    expect(header("Title").querySelector("button")!.title).toBe(
      "Sort by title, ascending",
    );

    element.page = 2;
    await press("Title");
    expect(lastQuery()).toMatchObject({ sort: "title", order: "asc", page: 1 });
    expect(header("Title").getAttribute("aria-sort")).toBe("ascending");
    expect(header("Title").textContent).toContain("▲");
    expect(header("Title").querySelector("button")!.title).toBe(
      "Sort by title, descending",
    );

    await press("Title");
    expect(lastQuery()).toMatchObject({ sort: "title", order: "desc" });
    expect(header("Title").getAttribute("aria-sort")).toBe("descending");
    expect(header("Title").textContent).toContain("▼");
    expect(header("Title").querySelector("button")!.title).toBe(
      "Go back to the default order",
    );

    await press("Title");
    expect(lastQuery()).toMatchObject({ sort: undefined, order: undefined });
    expect(header("Title").getAttribute("aria-sort")).toBe("none");

    // Another column starts ascending
    await press("Changed");
    await press("Status");
    expect(lastQuery()).toMatchObject({ sort: "status", order: "asc" });
    expect(header("Changed").getAttribute("aria-sort")).toBe("none");
  });

  it("should page through the results, from the top of each page", async () => {
    const { element, api } = await setup();
    api.query.mockImplementation(async ({ page: number }: { page: number }) =>
      page([summary({ slug: `p${number}` })], {
        total: 120,
        page: number,
        pages: 3,
      }),
    );
    await element.show();
    await settle(element);
    const results = find(element, ".article-browser-results");
    results.scrollTo = vi.fn();
    expect(find(element, '[aria-label="Pages"] span').textContent).toBe(
      "Page 1 of 3",
    );
    expect(button(element, "Previous").disabled).toBe(true);
    button(element, "Next").click();
    await settle(element);
    expect(find(element, '[aria-label="Pages"] span').textContent).toBe(
      "Page 2 of 3",
    );
    expect(results.scrollTo).toHaveBeenCalledWith(0, 0);
    button(element, "Next").click();
    await settle(element);
    expect(button(element, "Next").disabled).toBe(true);
    button(element, "Previous").click();
    await settle(element);
    expect(element.page).toBe(2);
  });

  it("should say when nothing is found, and hide the pages for one page", async () => {
    const { element, api } = await setup();
    api.query.mockResolvedValue(page([]));
    await element.show();
    await settle(element);
    expect(find(element, ".article-browser-empty").textContent).toBe(
      "No articles found.",
    );
    expect(find(element, '[role="status"]').textContent?.trim()).toBe(
      "0 articles found",
    );
    api.query.mockResolvedValue(page([summary({})]));
    await element.load();
    expect(find(element, '[role="status"]').textContent?.trim()).toBe(
      "1 article found",
    );
    expect(element.querySelector('[aria-label="Pages"]')).toBeNull();
  });

  it("should choose an article: close and fire article-choose", async () => {
    const { element } = await setup();
    const chosen = vi.fn();
    element.addEventListener("article-choose", chosen);
    await element.show();
    await settle(element);
    find(element, ".article-browser-table tbody a").click();
    expect(element.open).toBe(false);
    expect(chosen.mock.calls[0]![0].detail).toEqual({
      type: "news",
      slug: "hello",
    });
  });

  it("should give the article chosen while picking, instead of firing article-choose", async () => {
    const { element } = await setup();
    const chosen = vi.fn();
    element.addEventListener("article-choose", chosen);
    const picked = element.pick({ type: "news" });
    await settle(element);
    expect(find(element, "#article-browser-title").textContent?.trim()).toBe(
      "Choose an article",
    );
    find(element, ".article-browser-table tbody a").click();
    expect(await picked).toEqual({ type: "news", slug: "hello" });
    expect(element.open).toBe(false);
    expect(chosen).not.toHaveBeenCalled();
    // Closing, or showing it again, chooses none
    const closed = element.pick();
    await settle(element);
    button(element, "Close").click();
    expect(await closed).toBeUndefined();
    const shown = element.pick();
    await settle(element);
    await element.show();
    expect(await shown).toBeUndefined();
    expect(find(element, "#article-browser-title").textContent?.trim()).toBe(
      "All articles",
    );
  });

  it("should close from its close button, cancelling a waiting search", async () => {
    const { element, api } = await setup();
    await element.show();
    await settle(element);
    const calls = api.query.mock.calls.length;
    element.searchDelay = 50;
    input(find<HTMLInputElement>(element, "#article-browser-search"), "x");
    button(element, "Close").click();
    expect(element.open).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(api.query).toHaveBeenCalledTimes(calls);
    // Closing a closed browser does nothing
    element.close();
    expect(element.open).toBe(false);
  });

  it("should show errors, keep the last filters if they can't load, and only show the latest results", async () => {
    const { element, api } = await setup();
    api.filters.mockRejectedValueOnce(new Error("No filters"));
    api.query.mockRejectedValueOnce(new Error("Search failed"));
    await element.show();
    await settle(element);
    const status = find(element, '[role="status"]');
    expect(status.textContent?.trim()).toBe("Search failed");
    expect(status.classList.contains("error")).toBe(true);
    expect(element.filters).toEqual({ types: [], authors: [], tags: [] });

    let answerFirst: (result: ArticlePage) => void = () => {};
    api.query.mockImplementationOnce(
      () => new Promise((resolve) => (answerFirst = resolve)),
    );
    const first = element.load();
    await element.load();
    answerFirst(page([summary({ title: "Stale" })]));
    await first;
    expect(element.result?.articles[0]?.title).toBe("Hello");

    let failFirst: (error: Error) => void = () => {};
    api.query.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (failFirst = reject)),
    );
    const failing = element.load();
    await element.load();
    failFirst(new Error("Stale error"));
    await failing;
    expect(element.error).toBe("");
  });
});
