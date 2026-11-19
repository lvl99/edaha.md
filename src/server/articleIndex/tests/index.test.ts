import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  ArticleIndex,
  articleFiles,
  articleFilters,
  comparable,
  MAX_PER_PAGE,
  queryArticles,
  recentArticles,
  summarizeArticle,
} from "..";
import type { ArticleSummary } from "../../types";

// Files named "vanishing…" are removed between being listed and being read
vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...fs,
    stat: (async (path: string) =>
      String(path).includes("vanishing")
        ? Promise.reject(new Error("ENOENT"))
        : fs.stat(path)) as typeof fs.stat,
  };
});

const ARTICLES = fileURLToPath(
  new URL("../../../shared/tests/fixtures/site/articles", import.meta.url),
);

/** An article summary with defaults */
const summary = (overrides: Partial<ArticleSummary>): ArticleSummary => ({
  type: "news",
  slug: "a",
  title: "A",
  status: "published",
  date: "2026-10-01T00:00:00.000Z",
  tags: [],
  updated: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

/** A copy of the fixture site's articles folder to change */
const copyArticles = async () => {
  const dir = await mkdtemp(join(tmpdir(), "edaha-index-"));
  await cp(ARTICLES, dir, { recursive: true });
  return dir;
};

/** Write an article */
const writeArticle = async (dir: string, path: string, title: string) => {
  await mkdir(join(dir, path), { recursive: true });
  await writeFile(
    join(dir, path, "article.md"),
    `<!--yaml\ndate: 2026-10-19T09:54:00.000Z\n-->\n# ${title}`,
  );
};

/** The index's articles as "type/slug" */
const locations = (index: ArticleIndex) =>
  index
    .articles()
    .map((article) => `${article.type}/${article.slug}`)
    .sort();

describe("comparable", () => {
  it("should leave out case and accents", () => {
    expect(comparable("Zoë Ångström")).toBe("zoe angstrom");
  });
});

describe("summarizeArticle", () => {
  it("should summarise an article, or nothing without an article.md", async () => {
    expect(await summarizeArticle(ARTICLES, "article", "second")).toMatchObject(
      {
        title: "Second article",
        author: "Matt Scheurich",
        tags: ["News"],
        updated: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
      },
    );
    expect(await summarizeArticle(ARTICLES, "article", "nope")).toBeUndefined();
  });
});

describe("queryArticles", () => {
  const articles = [
    summary({ slug: "b", title: "Bravo", date: "2026-10-02T00:00:00.000Z" }),
    summary({
      slug: "a",
      title: "álpha",
      author: "Zoë",
      tags: ["One", "Two"],
      status: "draft",
    }),
    summary({ type: "page", slug: "c", title: "Charlie", tags: ["one"] }),
  ];
  const slugs = (query: Parameters<typeof queryArticles>[1]) =>
    queryArticles(articles, query).articles.map((article) => article.slug);

  it("should sort by date (newest first, then slug), by title (A to Z) or by when the file last changed", () => {
    expect(slugs(undefined)).toEqual(["b", "a", "c"]);
    expect(
      queryArticles(
        [
          summary({ slug: "old", updated: "2026-01-01T00:00:00.000Z" }),
          summary({ slug: "new", updated: "2026-03-01T00:00:00.000Z" }),
        ],
        { sort: "updated" },
      ).articles.map((article) => article.slug),
    ).toEqual(["new", "old"]);
    expect(slugs({ sort: "title" })).toEqual(["a", "b", "c"]);
    expect(
      queryArticles(
        [summary({ type: "z", title: "Same" }), summary({ title: "Same" })],
        { sort: "title" },
      ).articles.map((article) => article.type),
    ).toEqual(["news", "z"]);
    expect(
      queryArticles(
        [summary({ slug: "y", title: "Same" }), summary({ title: "Same" })],
        { sort: "title" },
      ).articles.map((article) => article.slug),
    ).toEqual(["a", "y"]);
  });

  it("should sort ascending or descending, each sort defaulting to its own order", () => {
    expect(slugs({ order: "asc" })).toEqual(["a", "c", "b"]);
    expect(slugs({ sort: "date", order: "desc" })).toEqual(["b", "a", "c"]);
    expect(slugs({ sort: "title", order: "desc" })).toEqual(["c", "b", "a"]);
    expect(slugs({ sort: "title", order: "asc" })).toEqual(["a", "b", "c"]);
    // Types and statuses A to Z, then titles A to Z
    expect(slugs({ sort: "type" })).toEqual(["a", "b", "c"]);
    expect(slugs({ sort: "type", order: "desc" })).toEqual(["c", "a", "b"]);
    expect(slugs({ sort: "status" })).toEqual(["a", "b", "c"]);
    expect(slugs({ sort: "status", order: "desc" })).toEqual(["b", "c", "a"]);
    const changed = [
      summary({ slug: "old", updated: "2026-01-01T00:00:00.000Z" }),
      summary({ slug: "new", updated: "2026-03-01T00:00:00.000Z" }),
    ];
    expect(
      queryArticles(changed, { sort: "updated", order: "asc" }).articles.map(
        (article) => article.slug,
      ),
    ).toEqual(["old", "new"]);
  });

  it("should find articles with metadata errors, warnings or either", () => {
    const withProblems = [
      summary({
        slug: "e",
        problems: [{ path: "a", message: "x", level: "error" }],
      }),
      summary({
        slug: "w",
        problems: [{ path: "a", message: "x", level: "warning" }],
      }),
      summary({ slug: "none" }),
    ];
    const found = (problems: "errors" | "warnings" | "any") =>
      queryArticles(withProblems, { problems, sort: "title" }).articles.map(
        (article) => article.slug,
      );
    expect(found("errors")).toEqual(["e"]);
    expect(found("warnings")).toEqual(["w"]);
    expect(found("any")).toEqual(["e", "w"]);
  });

  it("should search titles and filter by type, author, tag and status, ignoring case and accents", () => {
    expect(slugs({ search: "  ALPH " })).toEqual(["a"]);
    expect(slugs({ type: "page" })).toEqual(["c"]);
    expect(slugs({ author: "zoe" })).toEqual(["a"]);
    expect(slugs({ tag: "ONE" })).toEqual(["a", "c"]);
    expect(slugs({ status: "draft" })).toEqual(["a"]);
    expect(slugs({ search: "nothing" })).toEqual([]);
  });

  it("should give one page at a time, keeping pages and page sizes in range", () => {
    expect(queryArticles(articles, { perPage: 2, page: 2 })).toEqual({
      articles: [articles[2]],
      total: 3,
      page: 2,
      pages: 2,
      perPage: 2,
    });
    expect(queryArticles(articles, { perPage: 2, page: 9 }).page).toBe(2);
    expect(queryArticles(articles, { page: -1 }).page).toBe(1);
    expect(queryArticles(articles, { perPage: 0 }).perPage).toBe(1);
    expect(queryArticles(articles, { perPage: 500 }).perPage).toBe(
      MAX_PER_PAGE,
    );
    expect(queryArticles([], {})).toMatchObject({
      total: 0,
      page: 1,
      pages: 1,
    });
  });
});

describe("recentArticles and articleFilters", () => {
  it("should give each type's most recently changed articles and how many it has", () => {
    const articles = [
      summary({ slug: "old", updated: "2026-01-01T00:00:00.000Z" }),
      summary({ slug: "new", updated: "2026-03-01T00:00:00.000Z" }),
      summary({ slug: "mid", updated: "2026-02-01T00:00:00.000Z" }),
      // Changed at the same time as "mid", so after it by slug
      summary({ slug: "same", updated: "2026-02-01T00:00:00.000Z" }),
      summary({ type: "blog", slug: "x" }),
    ];
    expect(
      recentArticles(articles, 2).map(({ type, articles, total }) => [
        type,
        articles.map((article) => article.slug),
        total,
      ]),
    ).toEqual([
      ["blog", ["x"], 1],
      ["news", ["new", "mid"], 4],
    ]);
    expect(
      recentArticles(articles)[1]?.articles.map((article) => article.slug),
    ).toEqual(["new", "mid", "same", "old"]);
  });

  it("should give the types, authors and tags in use, once each, keeping their first spelling", () => {
    expect(
      articleFilters([
        summary({ author: "zoë", tags: ["b", "A"] }),
        summary({ type: "page", author: "Zoe", tags: ["a", "B", "c"] }),
        summary({ author: "Matt" }),
      ]),
    ).toEqual({
      types: ["news", "page"],
      authors: ["Matt", "zoë"],
      tags: ["A", "b", "c"],
    });
  });
});

describe("articleFiles", () => {
  it("should list an article folder's files with their kind, size and when they changed", async () => {
    const dir = await copyArticles();
    await mkdir(join(dir, "article/first/sub-folder"));
    await writeFile(join(dir, "article/first/.hidden"), "x");
    await writeFile(join(dir, "article/first/vanishing.png"), "x");
    expect(await articleFiles(dir, "article", "first")).toEqual([
      {
        type: "article",
        slug: "first",
        name: "guide.pdf",
        kind: "document",
        size: 13,
        updated: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
      },
      expect.objectContaining({ name: "thumb.png", kind: "image", size: 8 }),
    ]);
    expect(await articleFiles(dir, "article", "missing")).toEqual([]);
  });
});

describe("ArticleIndex", () => {
  it("should check articles' metadata with the check given", async () => {
    const dir = await copyArticles();
    const index = new ArticleIndex(dir, {
      check: (type, settings) =>
        type === "page" && settings.date
          ? [{ path: "x", message: "is wrong", level: "error" }]
          : [],
    });
    await index.load();
    expect(
      index
        .articles()
        .filter((article) => article.problems)
        .map((a) => a.slug),
    ).toEqual(["about-us"]);
  });

  it("should read every article, skipping folders that aren't articles", async () => {
    const dir = await copyArticles();
    await mkdir(join(dir, "article/empty"));
    await mkdir(join(dir, "Not A Type/x"), { recursive: true });
    const index = new ArticleIndex(dir);
    await index.load();
    expect(locations(index)).toEqual([
      "article/first",
      "article/hidden",
      "article/second",
      "article/wip",
      "page/about-us",
    ]);
    expect(index.articles().find((a) => a.slug === "first")?.title).toBe(
      "First article",
    );
    // With their files, but not those of folders without an article.md
    expect(index.files().map((file) => `${file.slug}/${file.name}`)).toEqual([
      "first/guide.pdf",
      "first/thumb.png",
    ]);
  });

  it("should update and drop entries", async () => {
    const dir = await copyArticles();
    const index = new ArticleIndex(dir);
    await index.load();
    await writeArticle(dir, "page/new", "New page");
    await index.update("page", "new");
    expect(locations(index)).toContain("page/new");
    await rm(join(dir, "page/new"), { recursive: true });
    await index.update("page", "new");
    expect(locations(index)).not.toContain("page/new");
    index.delete("page", "about-us");
    expect(locations(index)).not.toContain("page/about-us");
  });

  it("should read changed articles, types and everything again when their files change", async () => {
    const dir = await copyArticles();
    const index = new ArticleIndex(dir, { watchDelay: 10 });
    await index.load();
    index.watch();
    // Watching twice keeps one watcher
    index.watch();
    // The change is made again until seen, as the watcher can take a moment to start
    const settled = (change: () => Promise<unknown>, check: () => void) =>
      vi.waitFor(
        async () => {
          await change();
          await new Promise((resolve) => setTimeout(resolve, 50));
          check();
        },
        { timeout: 5000, interval: 50 },
      );

    // An article changes
    await settled(
      () => writeArticle(dir, "article/fresh", "Fresh"),
      () => expect(locations(index)).toContain("article/fresh"),
    );

    // A whole type is removed
    await settled(
      async () => {
        await mkdir(join(dir, "page"), { recursive: true });
        await rm(join(dir, "page"), { recursive: true });
      },
      () => expect(locations(index)).not.toContain("page/about-us"),
    );
    index.close();
  });

  it("should read type folders and everything again for changes outside article folders", async () => {
    const dir = await copyArticles();
    const onWatchUpdate = vi.fn();
    const index = new ArticleIndex(dir, { watchDelay: 1, onWatchUpdate });
    await index.load();
    // Changes as the watcher reports them (without watching, so only these are seen)
    const changed = (
      index as unknown as { changed: (file: string | null) => void }
    ).changed.bind(index);
    await rm(join(dir, "article/wip"), { recursive: true });
    // A type folder
    changed("article");
    await vi.waitFor(() => expect(onWatchUpdate).toHaveBeenCalledTimes(1));
    expect(locations(index)).not.toContain("article/wip");
    // Unknown changes read everything
    await writeArticle(dir, "page/other", "Other");
    changed(null);
    await vi.waitFor(() => expect(onWatchUpdate).toHaveBeenCalledTimes(2));
    expect(locations(index)).toContain("page/other");
    // Hidden files and folders that can't be types are ignored
    changed(".DS_Store");
    changed("Not A Type");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onWatchUpdate).toHaveBeenCalledTimes(2);
    index.close();
  });

  it("should not watch a missing folder, and stop watching after an error", async () => {
    const missing = new ArticleIndex(join(tmpdir(), "edaha-missing-folder"));
    expect(() => missing.watch()).not.toThrow();
    missing.close();

    const dir = await copyArticles();
    const index = new ArticleIndex(dir);
    index.watch();
    const watcher = (
      index as unknown as { watcher: import("node:fs").FSWatcher }
    ).watcher;
    const close = vi.spyOn(watcher, "close");
    watcher.emit("error", new Error("Gone"));
    expect(close).toHaveBeenCalled();
  });
});
