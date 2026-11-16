import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  readdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EmbedResolver } from "../../../embeds";
import {
  ArticleStore,
  bodyBaseUrl,
  EditorError,
  MAX_PREVIEWS,
  checkLocation,
  safeFileName,
  serializeArticle,
} from "..";
import type { EditorArticleData } from "../../types";
import { loadSiteConfig } from "../../../generator/configFile";

const FIXTURE = fileURLToPath(
  new URL("../../../shared/tests/fixtures/blog", import.meta.url),
);

/** An article store for the site in a folder, over the given theme */
const openStore = async (dir: string, themeDir?: string) =>
  new ArticleStore(await loadSiteConfig({ siteDir: dir }), themeDir);

/** A copy of the fixture blog to edit */
const blog = async () => {
  const dir = await mkdtemp(join(tmpdir(), "blog-store-"));
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
  });
});

describe("ArticleStore", () => {
  it("should list every article newest first, with unreadable ones and their errors", async () => {
    const { dir, store } = await blog();
    await mkdir(join(dir, "articles/article/broken"));
    await writeFile(
      join(dir, "articles/article/broken/article.md"),
      "<!--yaml\ndate: nope\n-->",
    );
    expect(await store.list()).toEqual([
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
      },
    ]);
  });

  it("should give the configured article types with their labels", async () => {
    const { store } = await blog();
    expect(await store.types()).toEqual({
      article: { labelSingle: "Article", labelPlural: "Articles" },
    });
  });

  it("should list the templates an article of a type can use, the site's and the theme's", async () => {
    const { dir, store } = await blog();
    expect(store.templates("page")).toEqual(["home", "single"]);
    expect(store.templates("article")).toEqual(["single"]);
    await mkdir(join(dir, "templates/article"), { recursive: true });
    await writeFile(join(dir, "templates/article/wide.njk"), "");
    expect(store.templates("article")).toEqual(["single", "wide"]);
  });

  it("should refuse slugs that clash with other URLs", async () => {
    const { store } = await blog();
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
    const { dir, store } = await blog();
    await store.save(data({ template: "home" }));
    expect(
      await readFile(join(dir, "articles/article/new-one/article.md"), "utf8"),
    ).toContain("template: home\n");
    expect((await store.read("article", "new-one")).template).toBe("home");
  });

  it("should read and write articles in the articlesDir folder", async () => {
    const { dir } = await blog();
    await rename(join(dir, "articles"), join(dir, "content"));
    await writeFile(
      join(dir, "edahaconfig.yml"),
      `articlesDir: content\n${await readFile(join(dir, "edahaconfig.yml"), "utf8")}`,
    );
    const store = await openStore(dir);
    expect((await store.list()).length).toBeGreaterThan(0);
    await store.save(data({ slug: "in-content" }));
    expect(
      await readFile(
        join(dir, "content/article/in-content/article.md"),
        "utf8",
      ),
    ).toContain("# ");
  });

  it("should list nothing when there is no articles folder", async () => {
    const dir = await mkdtemp(join(tmpdir(), "blog-empty-"));
    await cp(join(FIXTURE, "edahaconfig.yml"), join(dir, "edahaconfig.yml"));
    expect(await (await openStore(dir)).list()).toEqual([]);
  });

  it("should list an article titled by its slug when it has no title", async () => {
    const { dir, store } = await blog();
    await mkdir(join(dir, "articles/article/untitled"));
    await writeFile(
      join(dir, "articles/article/untitled/article.md"),
      `<!--yaml\ndate: ${DATE}\n-->\nText`,
    );
    expect((await store.list()).find((a) => a.slug === "untitled")?.title).toBe(
      "untitled",
    );
  });

  it("should read an article for editing", async () => {
    const { store } = await blog();
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
      '<div class="embed">https://youtu.be/aju_UB5VIf8</div>',
    );
    expect(article.bodyHtml).not.toContain("<h1>");
    expect((await store.read("article", "hidden")).title).toBe(
      "Hidden article",
    );
  });

  it("should give an empty title when an article has none", async () => {
    const { dir, store } = await blog();
    await writeFile(
      join(dir, "articles/article/second/article.md"),
      `<!--yaml\ndate: ${DATE}\n-->\nText`,
    );
    expect((await store.read("article", "second")).title).toBe("");
  });

  it("should fail to read missing, invalid or badly named articles", async () => {
    const { dir, store } = await blog();
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
    const { dir, store } = await blog();
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
    const { store } = await blog();
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
    const { dir, store } = await blog();
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

  it("should move an article's folder when its type or slug changes", async () => {
    const { dir, store } = await blog();
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
    const { store } = await blog();
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
    const { dir, store } = await blog();
    await store.remove("article", "first");
    expect(await readdir(join(dir, "articles/article"))).not.toContain("first");
    await rejectsWith(store.remove("article", "first"), 404, "not found");
  });

  it("should upload and read files", async () => {
    const { store } = await blog();
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
    const { store } = await blog();
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

describe("ArticleStore.preview", () => {
  /** A blog with templates, and a resolver whose embeds are links */
  const previewBlog = async () => {
    const { dir, store } = await blog();
    const embeds = new EmbedResolver({
      fetch: (async () => new Response("")) as unknown as typeof fetch,
      logger: { warn: () => undefined },
      renderers: [],
    });
    return { dir, store, embeds };
  };

  it("should render a draft as its type's single template, with files from its saved folder", async () => {
    const { store, embeds } = await previewBlog();
    const html = await store.preview(
      data({
        slug: "first",
        title: " First, edited ",
        status: "draft",
        thumbnail: "thumb.png",
        bodyHtml:
          '<h2>Section one</h2><p><img src="/files/article/first/thumb.png" alt="T"></p><div class="embed">https://example.com/x</div>',
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
    const { store, embeds } = await previewBlog();
    const html = await store.preview(
      data({ type: "page", slug: "", title: " " }),
      undefined,
      embeds,
    );
    expect(html).toContain("Untitled");
  });

  it("should refuse invalid types, and explain what can't be rendered", async () => {
    const { store, embeds } = await previewBlog();
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
  /** A blog with templates, and a resolver whose embeds are links */
  const previewBlog = async () => {
    const { dir, store } = await blog();
    const embeds = new EmbedResolver({
      fetch: (async () => new Response("")) as unknown as typeof fetch,
      logger: { warn: () => undefined },
      renderers: [],
    });
    return { dir, store, embeds };
  };

  it("should remember previews and render them each time, with templates as they are now", async () => {
    const { dir, store, embeds } = await previewBlog();
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
    const { store, embeds } = await previewBlog();
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

  it("should read static files only inside the static folders, the site's over the theme's", async () => {
    const { dir } = await blog();
    const theme = await mkdtemp(join(tmpdir(), "blog-theme-"));
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
});
