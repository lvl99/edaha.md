import { describe, expect, it } from "vitest";
import { defaultTypeConfig, type GenerateConfig } from "../../config";
import {
  alternateData,
  collectLists,
  pageFile,
  paginate,
  sortArticles,
} from "..";
import type { TemplateDataArticle, TemplateDataSite } from "../../types";

const site: TemplateDataSite = {
  author: { name: "Site" },
  name: "Site",
  description: "Updates",
  url: "https://example.com",
  baseUrl: "",
  path: "/",
  files: { url: "/files/", path: "/files/" },
  types: {
    news: { ...defaultTypeConfig("news"), labelPlural: "News", url: "/news/" },
    page: { ...defaultTypeConfig("page"), path: "", url: "/" },
  },
};

/** The website with different generate settings for pages */
const withPages = (generate: Partial<GenerateConfig>): TemplateDataSite => ({
  ...site,
  types: {
    ...site.types,
    page: {
      ...site.types.page!,
      generate: { ...site.types.page!.generate, ...generate },
    },
  },
});

/** A minimal article for list tests */
const article = (
  slug: string,
  date: string,
  type = "news",
  tags: string[] = [],
  author = "Matt",
): TemplateDataArticle =>
  ({
    type,
    slug,
    date,
    tags: tags.map((tag) => ({ name: tag, slug: tag.toLowerCase() })),
    author: { name: author, slug: author.toLowerCase() },
  }) as TemplateDataArticle;

const NONE = new Set<string>();

describe("alternateData", () => {
  it("should give an output's MIME type, RSS for XML feeds and a binary type for unknown extensions", () => {
    expect(alternateData("json", "/a/index.json")).toEqual({
      extension: "json",
      type: "application/json",
      url: "/a/index.json",
    });
    expect(alternateData("xml", "/a/index.xml").type).toBe("application/xml");
    expect(alternateData("XML", "/a/feed.XML", true).type).toBe(
      "application/rss+xml",
    );
    expect(alternateData("zzz", "/a/index.zzz").type).toBe(
      "application/octet-stream",
    );
  });
});

describe("sortArticles", () => {
  it("should sort newest first, then by type and slug", () => {
    const sorted = sortArticles([
      article("b", "2026-01-01"),
      article("a", "2026-01-01"),
      article("z", "2026-01-01", "page"),
      article("new", "2026-02-01"),
    ]);
    expect(sorted.map((a) => a.slug)).toEqual(["new", "a", "b", "z"]);
  });
});

describe("collectLists", () => {
  it("should build no lists without articles or index articles", () => {
    expect(collectLists([], site, NONE)).toEqual([]);
  });

  const mixed = [
    article("one", "2026-01-01", "news", ["Art"], "Matt"),
    article("two", "2026-02-01", "page", ["Art"], "Ana"),
  ];
  /** Summarise lists as "url (type): pages | feed" */
  const summary = (b: TemplateDataSite, withIndex = NONE) =>
    collectLists(mixed, b, withIndex).map(
      (l) =>
        `${l.url} ${l.kind} ${l.name} (${l.type}): ${l.pages ? l.articles.map((a) => a.slug).join(",") : "-"} | ${l.feed ? l.feedArticles.map((a) => a.slug).join(",") : "-"}`,
    );

  it("should group articles by type, and by tag and author within their type", () => {
    expect(summary(site)).toEqual([
      "/ type Pages (page): two | two",
      "/tags/art/ tag Art (page): two | two",
      "/authors/ana/ author Ana (page): two | two",
      "/news/ type News (news): one | one",
      "/news/tags/art/ tag Art (news): one | one",
      "/news/authors/matt/ author Matt (news): one | one",
    ]);
  });

  it("should build a feed only for a type without list pages", () => {
    expect(summary(withPages({ list: false }))[0]).toBe(
      "/ type Pages (page): - | two",
    );
  });

  it("should leave a type without feeds out of every feed", () => {
    expect(summary(withPages({ feed: false })).slice(0, 3)).toEqual([
      "/ type Pages (page): two | -",
      "/tags/art/ tag Art (page): two | -",
      "/authors/ana/ author Ana (page): two | -",
    ]);
  });

  it("should leave a type out of author and tag lists", () => {
    expect(summary(withPages({ author: false, tag: false }))[0]).toBe(
      "/ type Pages (page): two | two",
    );
    expect(summary(withPages({ author: false, tag: false }))).toHaveLength(4);
  });

  it("should build no type list without list pages or a feed", () => {
    expect(
      summary(
        withPages({ list: false, feed: false, author: false, tag: false }),
      ),
    ).toEqual([
      "/news/ type News (news): one | one",
      "/news/tags/art/ tag Art (news): one | one",
      "/news/authors/matt/ author Matt (news): one | one",
    ]);
  });

  it("should give types with an index article a list without pages, keeping their feed", () => {
    expect(summary(site, new Set(["news"])).slice(0, 1)).toEqual([
      "/news/ type News (news): - | one",
    ]);
    // Even a type with no list settings or articles gets one, for its index article to show
    const lists = collectLists(
      [],
      withPages({ list: false, feed: false }),
      new Set(["page"]),
    );
    expect(lists.map((l) => [l.url, l.pages, l.feed, l.articles])).toEqual([
      ["/", false, false, []],
    ]);
  });
});

describe("paginate", () => {
  it("should name pages index.html, 2.html, ...", () => {
    expect(pageFile(1)).toBe("index.html");
    expect(pageFile(3)).toBe("3.html");
    expect(pageFile(1, "json")).toBe("index.json");
    expect(pageFile(2, "json")).toBe("2.json");
  });

  it("should give an empty list one page", () => {
    const [page, ...rest] = paginate(
      collectLists([], site, new Set(["news"]))[0]!,
    );
    expect(rest).toEqual([]);
    expect(page!.pagination).toEqual({
      pages: [{ index: 1, url: "/news/", isCurrent: true }],
      page: { index: 1, url: "/news/", isCurrent: true },
      prevPage: undefined,
      nextPage: undefined,
    });
    expect(page).toMatchObject({
      type: "news",
      feedUrl: "/news/feed.xml",
      hasFeed: false,
      feeds: [],
      alternates: [],
    });
    const [jsonFeed] = paginate(
      collectLists([], site, new Set(["news"]))[0]!,
      10,
      { pages: ["html"], feeds: ["json"] },
    );
    expect(jsonFeed!.feedUrl).toBe("/news/feed.json");
  });

  it("should give each page its other outputs, and the list its feeds", () => {
    const list = collectLists(
      [article("a", "2026-03-01"), article("b", "2026-02-01")],
      site,
      NONE,
    )[0]!;
    const pages = paginate(list, 1, {
      pages: ["html", "json"],
      feeds: ["json", "xml"],
    });
    expect(pages.map((page) => page.alternates)).toEqual([
      [
        {
          extension: "json",
          type: "application/json",
          url: "/news/index.json",
        },
      ],
      [{ extension: "json", type: "application/json", url: "/news/2.json" }],
    ]);
    // The XML feed is RSS, and the one feedUrl links to
    expect(pages[0]!.feedUrl).toBe("/news/feed.xml");
    expect(pages[0]!.feeds).toEqual([
      { extension: "json", type: "application/json", url: "/news/feed.json" },
      { extension: "xml", type: "application/rss+xml", url: "/news/feed.xml" },
    ]);
    // Without an HTML page, every output is an alternate
    expect(
      paginate(list, 2, { pages: ["txt"], feeds: [] })[0]!.alternates,
    ).toEqual([
      { extension: "txt", type: "text/plain", url: "/news/index.txt" },
    ]);
  });

  it("should split articles into pages with previous and next pages", () => {
    const list = collectLists(
      [
        article("a", "2026-03-01"),
        article("b", "2026-02-01"),
        article("c", "2026-01-01"),
      ],
      site,
      NONE,
    )[0]!;
    const pages = paginate(list, 2);
    expect(pages.map((p) => p.articles.map((a) => a.slug))).toEqual([
      ["a", "b"],
      ["c"],
    ]);
    expect(pages[1]!.pagination.page).toEqual({
      index: 2,
      url: "/news/2",
      isCurrent: true,
    });
    expect(pages[1]!.pagination.prevPage).toEqual({
      index: 1,
      url: "/news/",
      isCurrent: false,
    });
    expect(pages[0]!.pagination.nextPage?.url).toBe("/news/2");
  });

  it("should default to 20 articles per page", () => {
    const many = Array.from({ length: 21 }, (_, i) =>
      article(`a${i}`, `2026-01-${String(i + 1).padStart(2, "0")}`),
    );
    expect(
      paginate(collectLists(many, site, NONE)[0]!).map(
        (p) => p.articles.length,
      ),
    ).toEqual([20, 1]);
  });
});
