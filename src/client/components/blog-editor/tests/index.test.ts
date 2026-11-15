// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArticleSummary, EditorArticle } from "../../../../server/types";
import type { EditorApi } from "../../../editorApi";
import type { BlogArticle } from "../../blog-article";
import "..";
import { groupArticles, UNSAVED_DIALOG, type BlogEditor } from "..";
import { button, find, input, settle } from "../../../../shared/tests/helpers";

afterEach(() => document.body.replaceChildren());

const SUMMARIES: ArticleSummary[] = [
  {
    type: "article",
    slug: "hello",
    title: "Hello",
    status: "published",
    date: "2026-10-19T09:54:00.000Z",
  },
  {
    type: "page",
    slug: "broken",
    title: "broken",
    status: "draft",
    date: "",
    error: "Bad date",
  },
];

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
const setup = async (list = vi.fn(async () => SUMMARIES)) => {
  const api = {
    list,
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
    list: typeof list;
    read: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  const element = document.createElement("blog-editor") as BlogEditor;
  element.api = api;
  document.body.append(element);
  await settle(element);
  return { api, element };
};

describe("blog-editor", () => {
  it("should list articles with their details and errors", async () => {
    const { element } = await setup();
    const items = [...element.querySelectorAll("nav li")];
    expect(items.map((li) => li.querySelector("a")!.textContent)).toEqual([
      "Hello",
      "broken",
    ]);
    expect(items[0]!.querySelector("small")!.textContent).toBe(
      "article/hello · published · 2026-10-19",
    );
    expect(items[1]!.querySelector("small")!.textContent).toBe(
      "page/broken · draft",
    );
    expect(items[1]!.querySelector(".error")!.textContent).toBe("Bad date");
    expect(find(element, "section p").textContent).toBe(
      "Choose an article or write a new one.",
    );
  });

  it("should group the list by type and filter it by type", async () => {
    const { element } = await setup();
    const groups = () =>
      [...element.querySelectorAll(".article-group")].map((group) => [
        group.querySelector("h2")!.textContent,
        [...group.querySelectorAll("li a")].map((a) => a.textContent),
      ]);
    expect(groups()).toEqual([
      ["Articles", ["Hello"]],
      ["page", ["broken"]],
    ]);
    const select = find<HTMLSelectElement>(element, "#type-filter");
    expect(
      [...select.options].map((o) => [o.value, o.textContent?.trim()]),
    ).toEqual([
      ["", "All"],
      ["article", "Article"],
      ["video", "Video"],
      ["page", "page"],
    ]);
    select.value = "page";
    select.dispatchEvent(new Event("change"));
    await settle(element);
    expect(groups()).toEqual([["page", ["broken"]]]);
    select.value = "";
    select.dispatchEvent(new Event("change"));
    await settle(element);
    expect(groups()).toHaveLength(2);
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
    const form = find<BlogArticle>(element, "blog-article");
    expect(form.article).toBe(ARTICLE);
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
    expect(element.querySelector("blog-article")).toBeNull();
  });

  it("should start a new article", async () => {
    const { element } = await setup();
    button(element, "New article").click();
    await settle(element);
    expect(find<BlogArticle>(element, "blog-article").article).toBeUndefined();
  });

  it("should start a fresh form for each new article", async () => {
    const { element } = await setup();
    button(element, "New article").click();
    await settle(element);
    const first = find<BlogArticle>(element, "blog-article");
    button(element, "New article").click();
    // Checking the open form for changes waits for its body, which can take a few turns
    await vi.waitFor(() =>
      expect(find<BlogArticle>(element, "blog-article")).not.toBe(first),
    );
  });

  it("should refresh the list after saving and close the form after deleting", async () => {
    const { element, api } = await setup();
    await element.open(SUMMARIES[0]!);
    await element.updateComplete;
    const form = find<BlogArticle>(element, "blog-article");
    form.dispatchEvent(
      new CustomEvent("article-saved", {
        detail: { type: "article", slug: "moved" },
        bubbles: true,
      }),
    );
    await settle(element);
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(element.selected).toEqual({ type: "article", slug: "moved" });

    form.dispatchEvent(new CustomEvent("article-deleted", { bubbles: true }));
    await settle(element);
    expect(api.list).toHaveBeenCalledTimes(3);
    expect(element.querySelector("blog-article")).toBeNull();
    expect(element.selected).toBeUndefined();
  });

  it("should create its own API by default", () => {
    const element = document.createElement("blog-editor") as BlogEditor;
    expect(element.api).toBeDefined();
  });
});

describe("groupArticles", () => {
  const summary = (type: string, slug: string, date: string) =>
    ({ type, slug, title: slug, status: "published", date }) as ArticleSummary;
  const articles = [
    summary("page", "about", "2026-10-01"),
    summary("news", "old", "2026-10-02"),
    summary("zines", "z", "2026-10-03"),
    summary("news", "new", "2026-10-20"),
    summary("blog", "b", "2026-10-04"),
    summary("news", "broken", ""),
  ];
  const types = {
    news: { labelSingle: "News", labelPlural: "News" },
    page: { labelSingle: "Page", labelPlural: "Pages" },
    video: { labelSingle: "Video", labelPlural: "Videos" },
  };

  it("should group by configured type, then other types alphabetically, newest first, leaving out empty types", () => {
    expect(
      groupArticles(articles, types).map((group) => [
        group.type,
        group.label,
        group.articles.map((article) => article.slug),
      ]),
    ).toEqual([
      ["news", "News", ["new", "old", "broken"]],
      ["page", "Pages", ["about"]],
      ["blog", "blog", ["b"]],
      ["zines", "zines", ["z"]],
    ]);
  });

  it("should give only the chosen type's group", () => {
    expect(groupArticles(articles, types, "page").map((g) => g.type)).toEqual([
      "page",
    ]);
    expect(groupArticles(articles, types, "video")).toEqual([]);
  });
});

describe("blog-editor unsaved changes", () => {
  /** Open the first article and change its title */
  const editTitle = async () => {
    const result = await setup();
    const { element } = result;
    await element.open(SUMMARIES[0]!);
    await settle(element);
    const form = find<BlogArticle>(element, "blog-article");
    form.bodyCheckDelay = 0;
    input(
      find<HTMLInputElement>(form, "blog-article-data-field[name=title] input"),
      "Changed",
    );
    await settle(element);
    return { ...result, form };
  };

  /** Answer the "Save changes first?" question */
  const answer = async (element: BlogEditor, choice: string) => {
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
    expect(find(element, "blog-article")).toBe(form);
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
    expect(find<BlogArticle>(element, "blog-article").article).toBe(ARTICLE);
    expect(find(element, ".toast.error span").textContent).toBe("Disk full");

    const creating = element.create();
    await answer(element, "save");
    await creating;
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(find<BlogArticle>(element, "blog-article").article).toBeUndefined();
    expect(find(element, ".toast.success span").textContent).toBe("Saved");
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
        "blog-article-data-field[name=title] input",
      ),
      "Changed",
    );
    await settle(element);
    expect(asks()).toBe(true);
    element.remove();
    expect(asks()).toBe(false);
  });
});
