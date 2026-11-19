import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  readdir,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { EmbedResolver } from "@lvl99dotcom/edaha.md/embeds";
import {
  ArticleStore,
  bodyBaseUrl,
  EditorError,
  MAX_EMBED_FRAMES,
  MAX_PREVIEWS,
  checkLocation,
  safeFileName,
  serializeArticle,
} from "..";
import type { EditorArticleData } from "../../types";
import { loadSiteConfig } from "@lvl99dotcom/edaha.md/generator/configFile";

const FIXTURE = fileURLToPath(
  new URL(
    "../../../../../edaha/src/shared/tests/fixtures/site",
    import.meta.url,
  ),
);

/** An article store for the site in a folder, over the given theme */
const openStore = async (dir: string, themeDir?: string) =>
  new ArticleStore(await loadSiteConfig({ siteDir: dir }), themeDir, {
    watch: false,
  });

/** Every article the store finds, newest first */
const listAll = async (store: ArticleStore) => (await store.query({})).articles;

/** A copy of the fixture site to edit */
const copySite = async () => {
  const dir = await mkdtemp(join(tmpdir(), "edaha-store-"));
  await cp(FIXTURE, dir, { recursive: true });
  return { dir, store: await openStore(dir) };
};

const DATE = "2026-10-19T09:54:00.000Z";

/** Minimal article data */
const data = (
  overrides: Partial<EditorArticleData> = {},
): EditorArticleData => ({
  type: "article",
  slug: "new-one",
  status: "draft",
  date: DATE,
  title: "New one",
  tags: [],
  attachments: [],
  bodyHtml: "<p>Body</p>",
  ...overrides,
});

/** Expect a promise to reject with an EditorError of a status and message */
const rejectsWith = async (
  promise: Promise<unknown>,
  status: number,
  message: string,
) => {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(EditorError);
  expect(error).toMatchObject({
    status,
    message: expect.stringContaining(message),
  });
};

describe("checkLocation and safeFileName", () => {
  it("should only accept kebab-case types and slugs, and no reserved types", () => {
    expect(() => checkLocation("article", "hello")).not.toThrow();
    expect(() => checkLocation("tags", "hello")).toThrow('Type "tags"');
    expect(() => checkLocation("Article", "hello")).toThrow('Type "Article"');
    expect(() => checkLocation("article", "../x")).toThrow('Slug "../x"');
  });

  it("should make uploaded file names safe", () => {
    expect(safeFileName("My Photo (1).JPG")).toBe("my-photo-1.jpg");
    expect(safeFileName("../../evil.sh")).toBe("evil.sh");
    expect(safeFileName("README")).toBe("readme");
    expect(() => safeFileName("?!.png")).toThrow(
      '"?!.png" is not a usable file name',
    );
  });
});

describe("serializeArticle", () => {
  it("should write the header without defaults, then the title and body", () => {
    expect(serializeArticle(data(), "Body")).toBe(
      `<!--yaml\nstatus: draft\ndate: ${DATE}\n-->\n\n# New one\n\nBody\n`,
    );
  });

  it("should write the header as JSON or YAML in the given format", () => {
    expect(serializeArticle(data({ tags: ["News"] }), "Body", "json")).toBe(
      `<!--json\n{\n  "status": "draft",\n  "date": "${DATE}",\n  "tags": [\n    "News"\n  ]\n}\n-->\n\n# New one\n\nBody\n`,
    );
    expect(serializeArticle(data(), "Body", "yml")).toBe(
      `<!--yml\nstatus: draft\ndate: ${DATE}\n-->\n\n# New one\n\nBody\n`,
    );
  });

  it("should write every field, with a plain author name when that is all there is", () => {
    expect(
      serializeArticle(
        data({
          type: "page",
          author: { name: "Matt", email: "matt@lvl99.com", url: "" },
          excerpt: "Short",
          thumbnail: "t.png",
          tags: ["News"],
          attachments: [{ url: "a.pdf", name: "A", mimeType: "" }],
        }),
        "Body",
      ),
    ).toBe(
      `<!--yaml\nstatus: draft\ndate: ${DATE}\nauthor:\n  name: Matt\n  email: matt@lvl99.com\nexcerpt: Short\nthumbnail: t.png\nattachments:\n  - url: a.pdf\n    name: A\ntags:\n  - News\n-->\n\n# New one\n\nBody\n`,
    );
    expect(serializeArticle(data({ author: { name: "Matt" } }), "")).toContain(
      "author: Matt\n",
    );
    // No author is written as false
    expect(serializeArticle(data({ author: false }), "")).toContain(
      "author: false\n",
    );
  });
});

describe("ArticleStore", () => {
  it("should find every article newest first, with unreadable ones and their errors", async () => {
    const { dir, store } = await copySite();
    await mkdir(join(dir, "articles/article/broken"));
    await writeFile(
      join(dir, "articles/article/broken/article.md"),
      "<!--yaml\ndate: nope\n-->",
    );
    expect(await listAll(store)).toMatchObject([
      {
        type: "article",
        slug: "wip",
        title: "Not ready",
        status: "draft",
        date: "2026-10-21T09:00:00.000Z",
      },
      {
        type: "article",
        slug: "hidden",
        title: "Hidden article",
        status: "unlisted",
        date: "2026-10-20T09:00:00.000Z",
      },
      {
        type: "article",
        slug: "first",
        title: "First article",
        status: "published",
        date: DATE,
      },
      {
        type: "article",
        slug: "second",
        title: "Second article",
        status: "published",
        date: "2026-10-18T09:00:00.000Z",
      },
      {
        type: "page",
        slug: "about-us",
        title: "About us",
        status: "published",
        date: "2026-10-01T00:00:00.000Z",
      },
      {
        type: "article",
        slug: "broken",
        title: "broken",
        status: "draft",
        date: "",
        error: 'article/broken: "date" must be an ISO 8601 timestamp',
        tags: [],
      },
    ]);
  });

  it("should summarise articles with their author, tags and when their file last changed", async () => {
    const { dir, store } = await copySite();
    const changed = new Date("2026-11-01T10:00:00.000Z");
    await utimes(
      join(dir, "articles/article/first/article.md"),
      changed,
      changed,
    );
    const { articles } = await store.query({ search: "first" });
    expect(articles).toEqual([
      {
        type: "article",
        slug: "first",
        title: "First article",
        status: "published",
        date: DATE,
        author: "Zoë Ångström",
        tags: ["News", "Release Notes"],
        updated: changed.toISOString(),
      },
    ]);
  });

  it("should search, filter, sort and page articles, and give each type's most recently changed ones and the filters' choices", async () => {
    const { dir, store } = await copySite();
    const touch = (path: string, iso: string) =>
      utimes(
        join(dir, "articles", path, "article.md"),
        new Date(iso),
        new Date(iso),
      );
    await touch("article/second", "2026-11-03T00:00:00.000Z");
    await touch("article/wip", "2026-11-02T00:00:00.000Z");
    await touch("article/first", "2026-11-01T00:00:00.000Z");
    await touch("article/hidden", "2026-10-01T00:00:00.000Z");
    await touch("page/about-us", "2026-10-01T00:00:00.000Z");
    const titles = async (query: Parameters<ArticleStore["query"]>[0]) =>
      (await store.query(query)).articles.map((article) => article.title);
    expect(await titles({ tag: "news", sort: "title" })).toEqual([
      "First article",
      "Second article",
    ]);
    expect(await titles({ author: "zoe angstrom" })).toEqual(["First article"]);
    expect(await titles({ type: "page" })).toEqual(["About us"]);
    expect(await titles({ status: "draft" })).toEqual(["Not ready"]);
    expect(await store.query({ perPage: 2, page: 2 })).toMatchObject({
      total: 5,
      page: 2,
      pages: 3,
      perPage: 2,
    });
    expect(
      (await store.recent(2)).map(({ type, articles, total }) => [
        type,
        articles.map((article) => article.slug),
        total,
      ]),
    ).toEqual([
      ["article", ["second", "wip"], 4],
      ["page", ["about-us"], 1],
    ]);
    expect((await store.recent())[0]?.articles).toHaveLength(4);
    expect(await store.filters()).toEqual({
      types: ["article", "page"],
      authors: ["Matt Scheurich", "Zoë Ångström"],
      tags: ["News", "Release Notes"],
    });
  });

  it("should keep the index up to date as articles are saved, moved and deleted", async () => {
    const { store } = await copySite();
    const slugs = async () =>
      (await listAll(store))
        .map((article) => `${article.type}/${article.slug}`)
        .sort();
    const before = await slugs();
    await store.save(data({ slug: "fresh", title: "Fresh" }));
    expect(await slugs()).toEqual([...before, "article/fresh"].sort());
    await store.save(data({ type: "page", slug: "moved", title: "Moved" }), {
      type: "article",
      slug: "fresh",
    });
    expect(await slugs()).toEqual([...before, "page/moved"].sort());
    await store.save(data({ type: "page", slug: "moved", title: "Renamed" }), {
      type: "page",
      slug: "moved",
    });
    expect((await store.query({ search: "renamed" })).total).toBe(1);
    await store.remove("page", "moved");
    expect(await slugs()).toEqual(before);
  });

  it("should find files in the articles' folders, with their paths on the website", async () => {
    const { dir, store } = await copySite();
    await writeFile(join(dir, "articles/page/about-us/team.jpg"), "jpg");
    const page = await store.queryFiles({ sort: "name" });
    expect(
      page.files.map(({ type, slug, name, kind, size, url }) => [
        `${type}/${slug}`,
        name,
        kind,
        size,
        url,
      ]),
    ).toEqual([
      ["article/first", "guide.pdf", "document", 13, "/news/first/guide.pdf"],
      ["page/about-us", "team.jpg", "image", 3, "/page/about-us/team.jpg"],
      ["article/first", "thumb.png", "image", 8, "/news/first/thumb.png"],
    ]);
    // Folders without an article.md aren't articles, so their files aren't listed
    expect(page.files.map((file) => file.name)).not.toContain("notes.txt");
    expect(await store.fileFilters()).toEqual({
      kinds: ["document", "image"],
      types: ["article", "page"],
    });
  });

  it("should give index articles' files their type's path, and the website's address when it has one", async () => {
    const { dir, store } = await copySite();
    await mkdir(join(dir, "articles/article/index"));
    await writeFile(
      join(dir, "articles/article/index/article.md"),
      `<!--yaml\ndate: ${DATE}\n-->\n# News`,
    );
    await writeFile(join(dir, "articles/article/index/banner.png"), "png");
    expect((await store.queryFiles({ search: "banner" })).files[0]?.url).toBe(
      "/news/banner.png",
    );

    // Other articles refer to it by its path or full address
    await writeFile(
      join(dir, "edahaconfig.yml"),
      `siteUrl: https://example.com/\n${await readFile(join(dir, "edahaconfig.yml"), "utf8")}`,
    );
    await writeFile(
      join(dir, "articles/page/about-us/article.md"),
      `<!--yaml\ndate: ${DATE}\n-->\n# About us\n\n![](https://example.com/news/banner.png) [b](/news/banner.png)`,
    );
    expect(
      await store.fileReferences("article", "index", "banner.png"),
    ).toEqual([{ type: "page", slug: "about-us" }]);
  });

  it("should list the articles that refer to a file, without changing them", async () => {
    const { dir, store } = await copySite();
    const before = await readFile(
      join(dir, "articles/article/first/article.md"),
      "utf8",
    );
    await writeFile(
      join(dir, "articles/article/second/article.md"),
      `<!--yaml\ndate: ${DATE}\n-->\n# Second\n\n[Guide](/news/first/guide.pdf)`,
    );
    // An article that can't be read is left alone
    await mkdir(join(dir, "articles/article/broken"));
    await writeFile(
      join(dir, "articles/article/broken/article.md"),
      "<!--yaml\n: :\n-->\nguide.pdf",
    );
    expect(await store.fileReferences("article", "first", "guide.pdf")).toEqual(
      [
        { type: "article", slug: "first" },
        { type: "article", slug: "second" },
      ],
    );
    expect(
      await readFile(join(dir, "articles/article/first/article.md"), "utf8"),
    ).toBe(before);
  });

  it("should replace a file with one of the same name, changing no articles", async () => {
    const { dir, store } = await copySite();
    expect(
      await store.replaceFile(
        "article",
        "first",
        "thumb.png",
        "Thumb.PNG",
        new Uint8Array([1, 2]),
      ),
    ).toEqual({ name: "thumb.png", articles: [] });
    expect([
      ...(await readFile(join(dir, "articles/article/first/thumb.png"))),
    ]).toEqual([1, 2]);
    expect((await store.queryFiles({ search: "thumb" })).files[0]?.size).toBe(
      2,
    );
  });

  it("should replace a file with another name, switching references to it in every article", async () => {
    const { dir, store } = await copySite();
    await writeFile(
      join(dir, "articles/page/about-us/article.md"),
      `<!--yaml\ndate: ${DATE}\n-->\n# About us\n\n![](/news/first/thumb.png)`,
    );
    expect(
      await store.replaceFile(
        "article",
        "first",
        "thumb.png",
        "New thumb.jpg",
        new Uint8Array([3]),
      ),
    ).toEqual({
      name: "new-thumb.jpg",
      articles: [
        { type: "article", slug: "first" },
        { type: "page", slug: "about-us" },
      ],
    });
    const first = await readFile(
      join(dir, "articles/article/first/article.md"),
      "utf8",
    );
    expect(first).toContain("thumbnail: new-thumb.jpg");
    expect(first).toContain("![an image](new-thumb.jpg)");
    expect(first).not.toContain("thumb.png");
    expect(
      await readFile(join(dir, "articles/page/about-us/article.md"), "utf8"),
    ).toContain("![](/news/first/new-thumb.jpg)");
    expect(await readdir(join(dir, "articles/article/first"))).toEqual([
      "article.md",
      "guide.pdf",
      "new-thumb.jpg",
    ]);
    expect(
      (await store.queryFiles({ type: "article" })).files.map((f) => f.name),
    ).toEqual(["guide.pdf", "new-thumb.jpg"]);
  });

  it("should refuse a replacement whose name another file has, or files that aren't there", async () => {
    const { store } = await copySite();
    await expect(
      store.replaceFile(
        "article",
        "first",
        "thumb.png",
        "guide.pdf",
        new Uint8Array(),
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "A file called guide.pdf is already in article/first",
    });
    for (const name of ["missing.png", "article.md", ".hidden", "../x.png"])
      await expect(
        store.deleteFile("article", "first", name),
      ).rejects.toMatchObject({ status: 404 });
  });

  it("should delete a file, removing references to it in every article", async () => {
    const { dir, store } = await copySite();
    expect(await store.deleteFile("article", "first", "thumb.png")).toEqual({
      articles: [{ type: "article", slug: "first" }],
    });
    const first = await readFile(
      join(dir, "articles/article/first/article.md"),
      "utf8",
    );
    expect(first).not.toContain("thumb.png");
    expect(first).toContain("  - url: guide.pdf\n");
    expect(await readdir(join(dir, "articles/article/first"))).toEqual([
      "article.md",
      "guide.pdf",
    ]);
  });

  describe("custom metadata", () => {
    /** A copy of the site whose pages use "featured" and "rating", with a page using them */
    const metadataSite = async () => {
      const site = await copySite();
      const config = await readFile(join(site.dir, "edahaconfig.yml"), "utf8");
      await writeFile(
        join(site.dir, "edahaconfig.yml"),
        [
          config.trimEnd(),
          "  page:",
          "    metadata: [featured, rating]",
          "metadata:",
          "  featured:",
          "    type: string",
          "    $edahaField: { file: true }",
          "  rating:",
          "    type: number",
          "    maximum: 10",
          "    $edahaField: { number: true }",
          "  credit:",
          "    type: string",
          "    $edahaField: { text: true }",
          "",
        ].join("\n"),
      );
      await writeFile(
        join(site.dir, "articles/page/about-us/article.md"),
        `<!--yaml\ndate: ${DATE}\nfeatured: hero.png\nrating: 11\ncredit: Me\noops: true\n-->\n# About us\n\nBody\n`,
      );
      return { ...site, store: await openStore(site.dir) };
    };

    it("should read an article's other settings and their problems", async () => {
      const { store } = await metadataSite();
      const article = await store.read("page", "about-us");
      expect(article.meta).toEqual({
        featured: "hero.png",
        rating: 11,
        credit: "Me",
        oops: true,
      });
      expect(article.problems).toEqual([
        { path: "rating", message: "must be at most 10", level: "error" },
        { path: "credit", message: "isn't used by Pages", level: "warning" },
        { path: "oops", message: "isn't a known setting", level: "warning" },
      ]);
      expect(await store.metadataInfo()).toMatchObject({
        types: { page: ["featured", "rating"] },
      });
      expect(Object.keys((await store.metadataInfo()).definitions)).toEqual([
        "featured",
        "rating",
        "credit",
      ]);
    });

    it("should give summaries their problems, and find articles with errors, warnings or either", async () => {
      const { store } = await metadataSite();
      await store.load();
      const slugs = async (problems: "errors" | "warnings" | "any") =>
        (await store.query({ problems })).articles.map((a) => a.slug);
      expect(await slugs("errors")).toEqual(["about-us"]);
      expect(await slugs("warnings")).toEqual(["about-us"]);
      expect(await slugs("any")).toEqual(["about-us"]);
      expect(
        (await store.query({ search: "first" })).articles[0]?.problems,
      ).toBeUndefined();
    });

    it("should refuse to save invalid values, and keep other settings when saving", async () => {
      const { dir, store } = await metadataSite();
      const article = await store.read("page", "about-us");
      await expect(
        store.save(article, { type: "page", slug: "about-us" }),
      ).rejects.toMatchObject({
        status: 400,
        message: 'Some values aren\'t valid: "rating" must be at most 10',
        problems: [
          { path: "rating", message: "must be at most 10", level: "error" },
        ],
      });
      await store.save(
        { ...article, meta: { ...article.meta, rating: 7 } },
        { type: "page", slug: "about-us" },
      );
      const saved = await readFile(
        join(dir, "articles/page/about-us/article.md"),
        "utf8",
      );
      expect(saved).toContain(
        "featured: hero.png\nrating: 7\ncredit: Me\noops: true\n",
      );
    });

    it("should read the config again when it changes, checking every article again", async () => {
      const { dir, store } = await metadataSite();
      await store.load();
      expect((await store.query({ problems: "errors" })).total).toBe(1);
      // "rating" is now allowed up to 20, so 11 is fine
      const config = await readFile(join(dir, "edahaconfig.yml"), "utf8");
      await writeFile(
        join(dir, "edahaconfig.yml"),
        config.replace("maximum: 10", "maximum: 20"),
      );
      const later = new Date(Date.now() + 5000);
      await utimes(join(dir, "edahaconfig.yml"), later, later);
      expect((await store.query({ problems: "errors" })).total).toBe(0);
      expect(
        (await store.read("page", "about-us")).problems?.map((p) => p.path),
      ).toEqual(["credit", "oops"]);
    });

    it("should give previews the type's valid values as article.meta", async () => {
      const { dir, store } = await metadataSite();
      await mkdir(join(dir, "templates/page"), { recursive: true });
      await writeFile(
        join(dir, "templates/page/single.njk"),
        "{{ article.meta | dump | safe }}",
      );
      const article = await store.read("page", "about-us");
      expect(
        JSON.parse(
          await store.preview(
            article,
            { type: "page", slug: "about-us" },
            new EmbedResolver({
              fetch: (async () => new Response("")) as unknown as typeof fetch,
              logger: { warn: () => undefined },
              plugins: [],
            }),
          ),
        ),
      ).toEqual({ featured: "/files/page/about-us/hero.png" });
    });
  });

  it("should watch the articles folder for changes by default, until closed", async () => {
    const { dir } = await copySite();
    let updates = 0;
    const store = new ArticleStore(
      await loadSiteConfig({ siteDir: dir }),
      undefined,
      { watchDelay: 10, onWatchUpdate: () => updates++ },
    );
    expect((await store.query({ search: "outside" })).total).toBe(0);
    await mkdir(join(dir, "articles/article/outside"));
    // Written again until seen, as the watcher can take a moment to start
    await vi.waitFor(
      async () => {
        await writeFile(
          join(dir, "articles/article/outside/article.md"),
          `<!--yaml\ndate: ${DATE}\n-->\n# Written outside`,
        );
        expect(updates).toBeGreaterThan(0);
        expect((await store.query({ search: "outside" })).total).toBe(1);
      },
      { timeout: 5000, interval: 100 },
    );
    store.close();
    // Closing a store that never read its index does nothing
    (await openStore(dir)).close();
  });

  it("should give the website's name and default author", async () => {
    const { dir, store } = await copySite();
    expect(await store.site()).toEqual({
      name: "Test News",
      author: { name: "Test News" },
      types: {},
    });
    const config = await readFile(join(dir, "edahaconfig.yml"), "utf8");
    await writeFile(
      join(dir, "edahaconfig.yml"),
      `author: Matt\n${config}    author: false\n`,
    );
    expect(await store.site()).toEqual({
      name: "Test News",
      author: { name: "Matt" },
      types: { article: false },
    });
    await writeFile(join(dir, "edahaconfig.yml"), `author: false\n${config}`);
    expect((await store.site()).author).toBeUndefined();
  });

  it("should give the configured article types with their labels", async () => {
    const { store } = await copySite();
    expect(await store.types()).toEqual({
      article: { labelSingle: "Article", labelPlural: "Articles" },
    });
  });

  it("should list the templates an article of a type can use, the site's and the theme's", async () => {
    const { dir, store } = await copySite();
    expect(store.templates("page")).toEqual(["home", "single"]);
    expect(store.templates("article")).toEqual(["single"]);
    await mkdir(join(dir, "templates/article"), { recursive: true });
    await writeFile(join(dir, "templates/article/wide.njk"), "");
    expect(store.templates("article")).toEqual(["single", "wide"]);
  });

  it("should refuse slugs that clash with other URLs", async () => {
    const { store } = await copySite();
    await rejectsWith(
      store.save(data({ slug: "tags" })),
      400,
      'The slug can\'t be used: the slug "tags" is used by tag lists',
    );
    await rejectsWith(
      store.save(data({ slug: "2" })),
      400,
      "used by list pages",
    );
  });

  it("should save and read an article's template", async () => {
    const { dir, store } = await copySite();
    await store.save(data({ template: "home" }));
    expect(
      await readFile(join(dir, "articles/article/new-one/article.md"), "utf8"),
    ).toContain("template: home\n");
    expect((await store.read("article", "new-one")).template).toBe("home");
  });

  it("should read and write articles in the articlesDir folder", async () => {
    const { dir } = await copySite();
    await rename(join(dir, "articles"), join(dir, "content"));
    await writeFile(
      join(dir, "edahaconfig.yml"),
      `articlesDir: content\n${await readFile(join(dir, "edahaconfig.yml"), "utf8")}`,
    );
    const store = await openStore(dir);
    expect((await listAll(store)).length).toBeGreaterThan(0);
    await store.save(data({ slug: "in-content" }));
    expect(
      await readFile(
        join(dir, "content/article/in-content/article.md"),
        "utf8",
      ),
    ).toContain("# ");
  });

  it("should find nothing when there is no articles folder", async () => {
    const dir = await mkdtemp(join(tmpdir(), "edaha-empty-"));
    await cp(join(FIXTURE, "edahaconfig.yml"), join(dir, "edahaconfig.yml"));
    expect(await listAll(await openStore(dir))).toEqual([]);
  });

  it("should list an article titled by its slug when it has no title", async () => {
    const { dir, store } = await copySite();
    await mkdir(join(dir, "articles/article/untitled"));
    await writeFile(
      join(dir, "articles/article/untitled/article.md"),
      `<!--yaml\ndate: ${DATE}\n-->\nText`,
    );
    expect(
      (await listAll(store)).find((a) => a.slug === "untitled")?.title,
    ).toBe("untitled");
  });

  it("should read an article for editing", async () => {
    const { store } = await copySite();
    const article = await store.read("article", "first");
    expect(article).toMatchObject({
      type: "article",
      slug: "first",
      status: "published",
      date: DATE,
      title: "First article",
      author: {
        name: "Zoë Ångström",
        email: "zoe@example.com",
        url: "https://example.com",
      },
      thumbnail: "thumb.png",
      tags: ["News", "Release Notes"],
      files: ["guide.pdf", "thumb.png"],
    });
    expect(article.bodyHtml).toContain(
      '<img src="/files/article/first/thumb.png" alt="an image">',
    );
    expect(article.bodyHtml).toContain('<hr class="readmore">');
    expect(article.bodyHtml).toContain(
      '<div class="embed" data-embed="youtube" data-content="https://youtu.be/aju_UB5VIf8"></div>',
    );
    expect(article.bodyHtml).not.toContain("<h1>");
    expect((await store.read("article", "hidden")).title).toBe(
      "Hidden article",
    );
  });

  it("should give an empty title when an article has none", async () => {
    const { dir, store } = await copySite();
    await writeFile(
      join(dir, "articles/article/second/article.md"),
      `<!--yaml\ndate: ${DATE}\n-->\nText`,
    );
    expect((await store.read("article", "second")).title).toBe("");
  });

  it("should fail to read missing, invalid or badly named articles", async () => {
    const { dir, store } = await copySite();
    await rejectsWith(
      store.read("article", "missing"),
      404,
      "Article article/missing not found",
    );
    await rejectsWith(
      store.read("article", "Bad Slug"),
      400,
      'Slug "Bad Slug"',
    );
    await writeFile(
      join(dir, "articles/article/second/article.md"),
      "<!--yaml\nstatus: nope\n-->",
    );
    await rejectsWith(
      store.read("article", "second"),
      422,
      '"status" must be one of',
    );
  });

  it("should create an article", async () => {
    const { dir, store } = await copySite();
    expect(
      await store.save(
        data({ bodyHtml: '<p>Hi</p><hr class="readmore"><p>Rest</p>' }),
      ),
    ).toEqual({
      type: "article",
      slug: "new-one",
    });
    expect(
      await readFile(join(dir, "articles/article/new-one/article.md"), "utf8"),
    ).toBe(
      `<!--yaml\nstatus: draft\ndate: ${DATE}\n-->\n\n# New one\n\nHi\n\n<!-- readmore -->\n\nRest\n`,
    );
  });

  it("should refuse to create over an existing article or without a title", async () => {
    const { store } = await copySite();
    await rejectsWith(
      store.save(data({ slug: "first" })),
      409,
      "Article article/first already exists",
    );
    await rejectsWith(
      store.save(data({ title: " " })),
      400,
      "The article needs a title",
    );
    await rejectsWith(
      store.save(data({ date: "nope" })),
      400,
      '"date" must be an ISO 8601 timestamp',
    );
  });

  it("should save an article in place, keeping relative file URLs", async () => {
    const { dir, store } = await copySite();
    const article = await store.read("article", "first");
    await store.save(
      { ...article, title: "Renamed" },
      { type: "article", slug: "first" },
    );
    const source = await readFile(
      join(dir, "articles/article/first/article.md"),
      "utf8",
    );
    expect(source).toContain("# Renamed\n");
    expect(source).toContain("![an image](thumb.png)");
  });

  it("should keep a saved article's header format, and write new ones' as YAML", async () => {
    const { dir, store } = await copySite();
    const file = join(dir, "articles/article/first/article.md");
    const yaml = await readFile(file, "utf8");
    await writeFile(
      file,
      yaml.replace(
        /^<!--yaml\n[\s\S]*?-->/,
        `<!--json\n{ "date": "${DATE}" }\n-->`,
      ),
    );
    const article = await store.read("article", "first");
    await store.save(
      { ...article, slug: "first-moved" },
      { type: "article", slug: "first" },
    );
    const moved = await readFile(
      join(dir, "articles/article/first-moved/article.md"),
      "utf8",
    );
    expect(moved).toMatch(
      /^<!--json\n\{\n {2}"status": "published",\n {2}"date": /,
    );
    expect((await store.read("article", "first-moved")).date).toBe(DATE);

    await store.save(data({ slug: "brand-new" }));
    expect(
      await readFile(
        join(dir, "articles/article/brand-new/article.md"),
        "utf8",
      ),
    ).toMatch(/^<!--yaml\n/);
  });

  it("should move an article's folder when its type or slug changes", async () => {
    const { dir, store } = await copySite();
    const article = await store.read("article", "first");
    expect(
      await store.save(
        { ...article, type: "news", slug: "moved" },
        { type: "article", slug: "first" },
      ),
    ).toEqual({ type: "news", slug: "moved" });
    expect(await readdir(join(dir, "articles/news/moved"))).toEqual([
      "article.md",
      "guide.pdf",
      "thumb.png",
    ]);
    expect(await readdir(join(dir, "articles/article"))).not.toContain("first");
    const source = await readFile(
      join(dir, "articles/news/moved/article.md"),
      "utf8",
    );
    expect(source).not.toContain("type:");
    expect(source).toContain("![an image](thumb.png)");
  });

  it("should not move onto an existing article or from a missing one", async () => {
    const { store } = await copySite();
    const article = await store.read("article", "first");
    await rejectsWith(
      store.save(
        { ...article, slug: "second" },
        { type: "article", slug: "first" },
      ),
      409,
      "already exists",
    );
    await rejectsWith(
      store.save(data(), { type: "article", slug: "missing" }),
      404,
      "Article article/missing not found",
    );
  });

  it("should delete an article and its files", async () => {
    const { dir, store } = await copySite();
    await store.remove("article", "first");
    expect(await readdir(join(dir, "articles/article"))).not.toContain("first");
    await rejectsWith(store.remove("article", "first"), 404, "not found");
  });

  it("should upload and read files", async () => {
    const { store } = await copySite();
    expect(
      await store.upload(
        "article",
        "first",
        "My Pic.PNG",
        new Uint8Array([1, 2]),
      ),
    ).toEqual({
      name: "my-pic.png",
      url: "/files/article/first/my-pic.png",
    });
    expect([...(await store.file("article", "first", "my-pic.png"))]).toEqual([
      1, 2,
    ]);
    await rejectsWith(
      store.upload("article", "missing", "a.png", new Uint8Array()),
      404,
      "not found",
    );
  });

  it("should only serve plain file names other than article.md", async () => {
    const { store } = await copySite();
    for (const name of [
      "article.md",
      "../second/article.md",
      ".hidden",
      "missing.png",
    ])
      await rejectsWith(
        store.file("article", "first", name),
        404,
        "File not found",
      );
    await rejectsWith(
      store.file("article", "Bad Slug", "thumb.png"),
      400,
      'Slug "Bad Slug"',
    );
  });
});

describe("bodyBaseUrl", () => {
  it("should give a saved article's file URL, or nothing for an unsaved one", async () => {
    expect(bodyBaseUrl({ type: "news", slug: "hello" })).toBe(
      "/files/news/hello/",
    );
    expect(bodyBaseUrl(undefined)).toBe("");
    await rejectsWith(
      (async () => bodyBaseUrl({ type: "news", slug: "../x" }))(),
      400,
      'Slug "../x" must be lowercase kebab-case',
    );
  });
});

describe("ArticleStore embed frames", () => {
  it("should remember embed blocks under IDs made from them, only the newest ones", async () => {
    const { store } = await copySite();
    const id = store.rememberEmbedFrame({ key: "youtube", content: "a" });
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(store.rememberEmbedFrame({ key: "youtube", content: "a" })).toBe(id);
    expect(store.embedFrame(id)).toEqual({ key: "youtube", content: "a" });
    for (let i = 0; i < MAX_EMBED_FRAMES; i++)
      store.rememberEmbedFrame({ key: "youtube", content: `${i}` });
    expect(() => store.embedFrame(id)).toThrow("Embed not found");
    expect(await store.plugins()).toEqual([]);
  });

  it("should load the config file's embed plugin packages each time it is read", async () => {
    const { dir, store } = await copySite();
    const pkg = join(dir, "node_modules", "edaha-plugin-quote");
    await mkdir(pkg, { recursive: true });
    await writeFile(
      join(pkg, "package.json"),
      '{ "name": "edaha-plugin-quote", "type": "module", "exports": "./index.js" }',
    );
    await writeFile(
      join(pkg, "index.js"),
      'export default { key: "quote", name: "Quote", build: { render: async (text) => text } };',
    );
    const config = join(dir, "edahaconfig.yml");
    await writeFile(
      config,
      `${await readFile(config, "utf8")}plugins:\n  - edaha-plugin-quote\n`,
    );
    expect((await store.plugins()).map((plugin) => plugin.key)).toEqual([
      "quote",
    ]);
  });
});

describe("ArticleStore.preview", () => {
  /** A site with templates, and a resolver whose embeds are links */
  const previewSite = async () => {
    const { dir, store } = await copySite();
    const embeds = new EmbedResolver({
      fetch: (async () => new Response("")) as unknown as typeof fetch,
      logger: { warn: () => undefined },
      plugins: [],
    });
    return { dir, store, embeds };
  };

  it("should render a draft as its type's single template, with files from its saved folder", async () => {
    const { store, embeds } = await previewSite();
    const html = await store.preview(
      data({
        slug: "first",
        title: " First, edited ",
        status: "draft",
        thumbnail: "thumb.png",
        bodyHtml:
          '<h2>Section one</h2><p><img src="/files/article/first/thumb.png" alt="T"></p><div class="embed" data-embed="link" data-content="https://example.com/x"></div><hr class="readmore"><p>More</p>',
      }),
      { type: "article", slug: "first" },
      embeds,
    );
    expect(html).toContain("First, edited");
    expect(html).toContain('<h2 id="section-one">');
    expect(html).toContain('src="/files/article/first/thumb.png"');
    expect(html).toContain('href="https://example.com/x"');
  });

  it("should render an unsaved article of a type that isn't configured, titled Untitled when it has no title", async () => {
    const { store, embeds } = await previewSite();
    const html = await store.preview(
      data({ type: "page", slug: "", title: " " }),
      undefined,
      embeds,
    );
    expect(html).toContain("Untitled");
  });

  it("should refuse invalid types, and explain what can't be rendered", async () => {
    const { store, embeds } = await previewSite();
    await rejectsWith(
      store.preview(data({ type: "../x" }), undefined, embeds),
      400,
      'Type "../x" must be lowercase kebab-case',
    );
    await rejectsWith(
      store.preview(data({ thumbnail: "thumb.png" }), undefined, embeds),
      400,
      'article/new-one: "thumb.png" was not found in the article\'s folder',
    );
  });
});

describe("ArticleStore previews", () => {
  /** A site with templates, and a resolver whose embeds are links */
  const previewSite = async () => {
    const { dir, store } = await copySite();
    const embeds = new EmbedResolver({
      fetch: (async () => new Response("")) as unknown as typeof fetch,
      logger: { warn: () => undefined },
      plugins: [],
    });
    return { dir, store, embeds };
  };

  it("should remember previews and render them each time, with templates as they are now", async () => {
    const { dir, store, embeds } = await previewSite();
    const id = store.rememberPreview(data({ slug: "first", title: "First" }), {
      type: "article",
      slug: "first",
    });
    expect(await store.renderPreview(id, embeds)).toContain("First");
    await mkdir(join(dir, "templates/article"), { recursive: true });
    await writeFile(
      join(dir, "templates/article/single.njk"),
      "Changed: {{ article.title }}",
    );
    expect(await store.renderPreview(id, embeds)).toBe("Changed: First");
  });

  it(`should remember only the newest ${MAX_PREVIEWS} previews`, async () => {
    const { store, embeds } = await previewSite();
    const ids = Array.from({ length: MAX_PREVIEWS + 1 }, (_, i) =>
      store.rememberPreview(data({ title: `Preview ${i}` }), undefined),
    );
    await rejectsWith(
      store.renderPreview(ids[0] as string, embeds),
      404,
      "Preview not found",
    );
    expect(await store.renderPreview(ids[1] as string, embeds)).toContain(
      "Preview 1",
    );
    await rejectsWith(
      store.renderPreview("unknown", embeds),
      404,
      "Preview not found",
    );
  });

  it("should use the templatesDir and staticDir folders", async () => {
    const { dir } = await copySite();
    await writeFile(
      join(dir, "edahaconfig.yml"),
      `templatesDir: site/templates\nstaticDir: site/static\n${await readFile(join(dir, "edahaconfig.yml"), "utf8")}`,
    );
    await mkdir(join(dir, "site/templates/article"), { recursive: true });
    await writeFile(join(dir, "site/templates/article/wide.njk"), "Wide");
    const store = await openStore(dir);
    expect(store.templates("article")).toContain("wide");
    expect(store.staticDirs[0]).toBe(join(dir, "site/static"));
  });

  it("should read static files only inside the static folders, the site's over the theme's", async () => {
    const { dir } = await copySite();
    const theme = await mkdtemp(join(tmpdir(), "edaha-theme-"));
    const store = await openStore(dir, theme);
    expect(store.staticDirs).toEqual([
      join(dir, "static"),
      join(theme, "static"),
    ]);
    await mkdir(join(theme, "static"), { recursive: true });
    await writeFile(join(theme, "static/site.css"), "theme");
    await writeFile(join(theme, "static/theme.css"), "theme only");
    await mkdir(join(dir, "static/fonts"), { recursive: true });
    await writeFile(join(dir, "static/site.css"), "body {}");
    await writeFile(join(dir, "static/fonts/f.ttf"), "font");
    await writeFile(join(dir, "static/.hidden"), "secret");
    const read = async (path: string) =>
      new TextDecoder().decode(await store.staticFile(path));
    expect(await read("site.css")).toBe("body {}");
    expect(await read("theme.css")).toBe("theme only");
    expect(await read("fonts/f.ttf")).toBe("font");
    for (const path of [
      "missing.css",
      ".hidden",
      "../edahaconfig.yml",
      "fonts//f.ttf",
      "fonts",
      "",
    ])
      await rejectsWith(store.staticFile(path), 404, "File not found");
  });

  it("should read articles' files at their paths on the website, after the static files", async () => {
    const { dir, store } = await copySite();
    const read = async (path: string) =>
      new TextDecoder().decode(await store.staticFile(path));
    expect(await read("news/first/guide.pdf")).toBe(
      await readFile(join(dir, "articles/article/first/guide.pdf"), "utf8"),
    );
    // Static files come first
    await mkdir(join(dir, "static/news/first"), { recursive: true });
    await writeFile(join(dir, "static/news/first/guide.pdf"), "static");
    expect(await read("news/first/guide.pdf")).toBe("static");
    for (const path of [
      "news/first/missing.png",
      "news/first/article.md",
      "article/first/thumb.png",
    ])
      await rejectsWith(store.staticFile(path), 404, "File not found");
  });
});
