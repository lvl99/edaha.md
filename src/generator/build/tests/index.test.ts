import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { THEME_DIR } from "../../../theme";
import {
  buildSite,
  DEFAULT_SITE_URL,
  resolveOutputDir,
  resolvePublishDir,
  siteData,
  staticFiles,
} from "..";
import { defaultTypeConfig, parseConfig } from "../../config";

const FIXTURE = fileURLToPath(
  new URL("../../../shared/tests/fixtures/site", import.meta.url),
);
/** Copy the fixture site into a temporary workspace; it uses the default theme's templates */
const workspace = async () => {
  const root = await mkdtemp(join(tmpdir(), "edaha-build-"));
  const siteDir = join(root, "my-site");
  await cp(FIXTURE, siteDir, { recursive: true });
  return { root, siteDir };
};

/** Write a file into the workspace's site folder */
const writeSiteFile = async (
  { siteDir }: Space,
  file: string,
  contents: string,
) => {
  await mkdir(join(siteDir, file, ".."), { recursive: true });
  await writeFile(join(siteDir, file), contents);
};

type Space = Awaited<ReturnType<typeof workspace>>;

/** Add settings for the page type to the workspace's edahaconfig.yml */
const configurePages = async ({ siteDir }: Space, settings: string) =>
  writeFile(
    join(siteDir, "edahaconfig.yml"),
    `${await readFile(join(FIXTURE, "edahaconfig.yml"), "utf8")}  page:\n${settings}`,
  );

/** Write an article into the workspace */
const writeArticle = async (
  { siteDir }: Space,
  folder: string,
  source: string,
) => {
  await mkdir(join(siteDir, "articles", folder), { recursive: true });
  await writeFile(join(siteDir, "articles", folder, "article.md"), source);
};

/** Build the workspace's site without network access */
const build = async ({ siteDir }: Space, siteUrl?: string) => {
  const logger = { warn: vi.fn() };
  const fetch = vi.fn(() =>
    Promise.reject(new Error("offline")),
  ) as unknown as typeof globalThis.fetch;
  const result = await buildSite({ siteDir, siteUrl, logger, fetch });
  /** Read a published file */
  const read = (file: string) =>
    readFile(join(result.publishDir as string, file), "utf8");
  return { result, logger, read };
};

describe("resolveOutputDir", () => {
  it("should only allow folders inside the site folder, apart from its sources", () => {
    expect(resolveOutputDir("/site", "dist/www")).toBe("/site/dist/www");
    for (const dir of [".", "..", "../other", "/elsewhere"])
      expect(() => resolveOutputDir("/site", dir)).toThrow(
        '"outputDir" must be a folder inside the site folder',
      );
    for (const dir of ["articles", "templates/out", "static"])
      expect(() => resolveOutputDir("/site", dir)).toThrow(
        '"outputDir" must be apart from articles, templates, static',
      );
    const sources = ["site/content", "site/templates", "site/static"];
    expect(resolveOutputDir("/site", "articles", sources)).toBe(
      "/site/articles",
    );
    expect(resolveOutputDir("/site", "site/build", sources)).toBe(
      "/site/site/build",
    );
    for (const dir of ["site/content/out", "site/templates", "site"])
      expect(() => resolveOutputDir("/site", dir, sources)).toThrow(
        `"outputDir" must be apart from site/content, site/templates, site/static, got "${dir}"`,
      );
  });
});

describe("siteData", () => {
  it("should give the website's name, description, absolute URL, home URL and types", () => {
    const config = parseConfig({
      name: "Site",
      description: "Updates",
      path: "docs",
    });
    expect(
      siteData(config, { news: defaultTypeConfig("news") }, "https://e.com/"),
    ).toEqual({
      name: "Site",
      description: "Updates",
      url: "https://e.com",
      path: "/docs/",
      types: { news: { ...defaultTypeConfig("news"), url: "/docs/news/" } },
    });
    expect(siteData({ ...config, path: "" }, {}, "https://e.com").path).toBe(
      "/",
    );
  });
});

describe("resolvePublishDir", () => {
  it("should allow any folder apart from the site folder", () => {
    expect(resolvePublishDir("/work/site", "../app/dist")).toBe(
      "/work/app/dist",
    );
    expect(resolvePublishDir("/work/site", "/srv/www")).toBe("/srv/www");
    for (const dir of [".", "dist", "..", "/"])
      expect(() => resolvePublishDir("/work/site", dir)).toThrow(
        '"publishDir" must be a folder apart from the site folder',
      );
  });
});

describe("staticFiles", () => {
  it("should list static files, later folders overriding earlier ones, and skip missing folders", async () => {
    const root = await mkdtemp(join(tmpdir(), "edaha-static-"));
    await mkdir(join(root, "theme/fonts"), { recursive: true });
    await mkdir(join(root, "site"), { recursive: true });
    await writeFile(join(root, "theme/site.css"), "theme");
    await writeFile(join(root, "theme/fonts/a.woff2"), "font");
    await writeFile(join(root, "site/site.css"), "site");
    expect(
      await staticFiles([
        join(root, "theme"),
        join(root, "site"),
        join(root, "missing"),
      ]),
    ).toEqual(
      new Map([
        ["fonts/a.woff2", join(root, "theme/fonts/a.woff2")],
        ["site.css", join(root, "site/site.css")],
      ]),
    );
  });
});

describe("buildSite", () => {
  it("should build articles, lists and feeds at their types' paths and publish them", async () => {
    const space = await workspace();
    const { result, logger, read } = await build(space, "https://example.com/");

    // The default build folder
    expect(result.outputDir).toBe(join(space.siteDir, "build"));
    expect(result.publishDir).toBe(join(space.root, "site"));
    expect(result.articles.map((a) => `${a.type}/${a.slug}`)).toEqual([
      "article/first",
      "article/hidden",
      "article/second",
      "page/about-us",
    ]);
    expect(result.files).toEqual([
      // The default theme's stylesheet
      "base.css",
      "news/authors/matt-scheurich/feed.xml",
      "news/authors/matt-scheurich/index.html",
      "news/authors/zoe-angstrom/feed.xml",
      "news/authors/zoe-angstrom/index.html",
      "news/feed.xml",
      "news/first/guide.pdf",
      "news/first/index.html",
      "news/first/thumb.png",
      "news/hidden/index.html",
      "news/index.html",
      "news/second/index.html",
      "news/tags/news/feed.xml",
      "news/tags/news/index.html",
      "news/tags/release-notes/feed.xml",
      "news/tags/release-notes/index.html",
      "page/about-us/index.html",
      "page/authors/test-news/feed.xml",
      "page/authors/test-news/index.html",
      "page/feed.xml",
      "page/index.html",
    ]);
    expect(logger.warn.mock.calls.map(([message]) => message)).toEqual([
      'articles/page: type "page" is not in edahaconfig.yml; using the default settings',
      "articles/article/no-article: no article.md; skipped",
      // The page type has its own templates folder, without a list template
      "Template page/list.njk not found; using article/list.njk",
    ]);

    // The article page, its assets and the shared footer
    const first = await read("news/first/index.html");
    expect(first).toContain("<title>First article | Test News</title>");
    // The article's excerpt, not the site's description
    expect(first).toMatch(
      /<meta name="description" content="Intro with a link/,
    );
    expect(first).toContain(
      'src="https://www.youtube-nocookie.com/embed/aju_UB5VIf8"',
    );
    expect(first).toContain('<img src="/news/first/thumb.png" alt="an image">');
    expect(first).toContain('<a href="/news/first/guide.pdf">');
    expect(first).toContain("(application/pdf, 13 bytes)");
    // The author's name, not linked
    expect(first).toContain("Zoë Ångström");
    expect(first).not.toContain('href="/news/authors/zoe-angstrom/"');
    expect(first).toContain(
      '<a href="/news/tags/release-notes/">Release Notes</a>',
    );
    expect(first).toContain('<li><a href="/news/">Articles</a></li>');
    // The theme's footer links to each type's list
    expect(first).toMatch(
      /<footer class="site-footer">[\s\S]*<a href="\/news\/">Articles<\/a>[\s\S]*<a href="\/page\/">Pages<\/a>/,
    );
    expect(
      await readFile(join(result.publishDir!, "news/first/guide.pdf"), "utf8"),
    ).toBe("%PDF-1.4 test");

    // Lists: drafts and unlisted articles are left out, newest first
    const list = await read("news/index.html");
    expect(list).toContain("<title>Articles | Test News</title>");
    expect(list.indexOf("First article")).toBeLessThan(
      list.indexOf("Second article"),
    );
    expect(list).not.toContain("Hidden article");
    expect(list).not.toContain("Not ready");
    expect(list).toContain("Intro with a");
    expect(list).not.toContain("The rest.");
    const tag = await read("news/tags/release-notes/index.html");
    expect(tag).toContain("<title>Release Notes | Test News</title>");
    expect(tag).toContain('<li><a href="/news/">Articles</a></li>');
    expect(tag).toContain('Articles tagged "Release Notes".');
    expect(await read("news/authors/zoe-angstrom/index.html")).toContain(
      "Articles by Zoë Ångström.",
    );

    // Feeds use absolute URLs
    const feed = await read("news/feed.xml");
    expect(feed).toMatch(
      /^<\?xml version="1.0" encoding="UTF-8"\?>\n<rss version="2.0"/,
    );
    expect(feed).toContain("<title>Articles | Test News</title>");
    expect(feed).toContain("<link>https://example.com/news/first/</link>");
    expect(feed).toContain("<pubDate>Mon, 19 Oct 2026 09:54:00 GMT</pubDate>");
    expect(feed).toContain("<author>zoe@example.com (Zoë Ångström)</author>");
    expect(feed).toContain(
      "&lt;img src=&quot;https://example.com/news/first/thumb.png&quot;",
    );
    expect(feed).not.toContain("Hidden article");
  });

  it("should follow each type's generate settings", async () => {
    const space = await workspace();
    await configurePages(
      space,
      "    generate:\n      list: false\n      feed: false\n      author: false\n      tag: false\n",
    );
    const { result, logger, read } = await build(space, "https://example.com");
    expect(logger.warn.mock.calls.flat().join()).not.toContain(
      "is not in edahaconfig.yml",
    );
    // The page is built, but in no lists or feeds
    expect(result.files.filter((file) => file.startsWith("page/"))).toEqual([
      "page/about-us/index.html",
    ]);
    // Its page doesn't link to lists it isn't in
    const page = await read("page/about-us/index.html");
    expect(page).not.toContain('href="/page/authors/test-news/"');
    expect(page).not.toContain('href="/page/"');
  });

  it("should build only a feed for a type without list pages", async () => {
    const space = await workspace();
    await configurePages(
      space,
      "    generate:\n      list: false\n      author: false\n",
    );
    const { result } = await build(space, "https://example.com");
    expect(result.files.filter((file) => file.startsWith("page/"))).toEqual([
      "page/about-us/index.html",
      "page/feed.xml",
    ]);
  });

  it("should build nothing for a type with generate: false, but still check its articles", async () => {
    const space = await workspace();
    await configurePages(space, "    generate: false\n");
    const { result } = await build(space, "https://example.com");
    expect(result.files.some((file) => file.startsWith("page/"))).toBe(false);
    expect(result.articles.map((a) => a.type)).not.toContain("page");

    await writeArticle(space, "page/broken", "<!--yaml\ndate: nope\n-->");
    await expect(build(space, "https://example.com")).rejects.toThrow(
      'articles/page/broken: "date" must be an ISO 8601 timestamp',
    );
  });

  it("should leave out tag links and feeds when a type isn't in tag lists or feeds", async () => {
    const space = await workspace();
    await writeFile(
      join(space.siteDir, "edahaconfig.yml"),
      (await readFile(join(FIXTURE, "edahaconfig.yml"), "utf8")).replace(
        "path: news\n",
        "path: news\n    generate:\n      tag: false\n      feed: false\n",
      ),
    );
    const { result, read } = await build(space, "https://example.com");
    const first = await read("news/first/index.html");
    expect(first).toContain("Release Notes");
    expect(first).not.toContain('href="/news/tags/release-notes/"');
    expect(result.files).not.toContain("news/feed.xml");
    const list = await read("news/index.html");
    expect(list).not.toContain("RSS feed");
    expect(list).not.toContain('type="application/rss+xml"');
  });

  it("should build index articles in place of their type's list, with the list's articles", async () => {
    const space = await workspace();
    await configurePages(
      space,
      "    path: ''\n    generate:\n      list: false\n      feed: false\n      author: false\n      tag: false\n",
    );
    await writeArticle(
      space,
      "page/index",
      "<!--yaml\ndate: 2026-10-19\ntemplate: home\n-->\n# Welcome\n\nHello!",
    );
    await writeArticle(
      space,
      "article/index",
      "<!--yaml\ndate: 2026-10-19\n-->\n# All the news\n\nLatest below.",
    );
    // A template that shows the type's list
    await writeSiteFile(
      space,
      "templates/article/single.njk",
      "{{ article.title }}{% for item in list.articles %}|{{ item.title }}{% endfor %}",
    );
    const { result, read } = await build(space, "https://example.com");
    // page/index is the website's front page, page/about-us is at the root
    // The front page's title is in the page title, and its body is the page's main content
    expect(await read("index.html")).toContain("| Welcome</title>");
    expect(await read("index.html")).toMatch(
      /<div class="home-body">\s*<p>Hello!<\/p>/,
    );
    expect(await read("index.html")).not.toContain('aria-label="Breadcrumb"');
    expect(result.files).toContain("about-us/index.html");
    // article/index replaces the news list, which keeps its feed; it isn't in its own list or feed
    expect(await read("news/index.html")).toBe(
      "All the news|First article|Second article",
    );
    expect(result.files).toContain("news/feed.xml");
    expect(await read("news/feed.xml")).not.toContain("All the news");
  });

  it("should remove what the previous build published, and refuse to replace other files", async () => {
    const space = await workspace();
    const { result } = await build(space, "https://example.com");
    await writeFile(
      join(space.siteDir, "articles/article/second/article.md"),
      "<!--yaml\nstatus: draft\ndate: 2026-10-18\n-->\n# Gone",
    );
    const { read } = await build(space, "https://example.com");
    await expect(read("news/second/index.html")).rejects.toThrow();
    await expect(read("news/first/index.html")).resolves.toContain(
      "First article",
    );

    // A file the build didn't publish
    await writeFile(join(result.publishDir!, "news/second.html"), "");
    await mkdir(join(result.publishDir!, "news/second"), { recursive: true });
    await writeFile(
      join(space.siteDir, "articles/article/second/article.md"),
      "<!--yaml\ndate: 2026-10-18\n-->\n# Back",
    );
    await writeFile(
      join(result.publishDir!, "news/second/index.html"),
      "not the build's",
    );
    await expect(build(space, "https://example.com")).rejects.toThrow(
      'news/second/index.html is already in "publishDir" (../site)',
    );
  });

  it("should publish the static folder at the website's root, refusing files that clash with articles'", async () => {
    const space = await workspace();
    await mkdir(join(space.siteDir, "static/fonts"), { recursive: true });
    await writeFile(join(space.siteDir, "static/style.css"), "body {}");
    await writeFile(join(space.siteDir, "static/fonts/a.woff2"), "font");
    const { result, read } = await build(space, "https://example.com");
    await expect(read("style.css")).resolves.toBe("body {}");
    await expect(read("fonts/a.woff2")).resolves.toBe("font");
    expect(result.files).toEqual(
      expect.arrayContaining(["style.css", "fonts/a.woff2"]),
    );
    await mkdir(join(space.siteDir, "static/news/first"), { recursive: true });
    await writeFile(join(space.siteDir, "static/news/first/index.html"), "");
    await expect(build(space, "https://example.com")).rejects.toThrow(
      "static/news/first/index.html has the same path as an article's file",
    );
  });

  it("should require the publish folder to be apart from the site folder", async () => {
    const space = await workspace();
    for (const publishDir of ["dist", ".", "out", ".."]) {
      await writeFile(
        join(space.siteDir, "edahaconfig.yml"),
        (await readFile(join(FIXTURE, "edahaconfig.yml"), "utf8")).replace(
          "publishDir: ../site",
          `publishDir: ${publishDir}`,
        ),
      );
      await expect(
        build(space, "https://example.com"),
        publishDir,
      ).rejects.toThrow(
        'edahaconfig.yml: "publishDir" must be a folder apart from the site folder',
      );
    }
  });

  it("should only write to the output folder when there is no publish folder", async () => {
    const space = await workspace();
    await writeFile(
      join(space.siteDir, "edahaconfig.yml"),
      (await readFile(join(FIXTURE, "edahaconfig.yml"), "utf8")).replace(
        "publishDir: ../site\n",
        "",
      ),
    );
    const { result } = await build(space, "https://example.com");
    expect(result.publishDir).toBeUndefined();
    expect(
      await readFile(join(result.outputDir, "news/first/index.html"), "utf8"),
    ).toContain("First article");
    // A second build replaces the first
    await expect(build(space, "https://example.com")).resolves.toBeDefined();
  });

  it("should use the site's templates and static files over the theme's", async () => {
    const space = await workspace();
    await writeSiteFile(
      space,
      "templates/layouts/html.njk",
      "Site layout: {% block main %}{% endblock %}",
    );
    await writeSiteFile(space, "static/site.css", "site");
    const { read } = await build(space, "https://example.com");
    expect(await read("news/first/index.html")).toMatch(/^Site layout: /);
    expect(await read("site.css")).toBe("site");
  });

  it("should give templates the page's type and whether it is an article or a list", async () => {
    const space = await workspace();
    const flags =
      '{{ type }} article={{ isArticle }} list={{ isList }}{% if type == "article" and isArticle %} news article{% endif %}';
    for (const file of [
      "templates/article/single.njk",
      "templates/article/list.njk",
      "templates/page/single.njk",
      "templates/layouts/rssfeed.njk",
    ])
      await writeSiteFile(space, file, flags);
    const { read } = await build(space, "https://example.com");
    expect(await read("news/first/index.html")).toBe(
      "article article=true list=false news article",
    );
    expect(await read("news/index.html")).toBe(
      "article article=false list=true",
    );
    expect(await read("news/feed.xml")).toBe("article article=false list=true");
    expect(await read("page/about-us/index.html")).toBe(
      "page article=true list=false",
    );
  });

  it("should use the templatesDir and staticDir folders", async () => {
    const space = await workspace();
    await writeFile(
      join(space.siteDir, "edahaconfig.yml"),
      `templatesDir: site/templates\nstaticDir: site/static\n${await readFile(join(FIXTURE, "edahaconfig.yml"), "utf8")}`,
    );
    await writeSiteFile(
      space,
      "site/templates/layouts/html.njk",
      "Site layout: {% block main %}{% endblock %}",
    );
    // Not used: templates/ and static/ are no longer the site's folders
    await writeSiteFile(space, "templates/layouts/html.njk", "Unused");
    await writeSiteFile(space, "site/static/site.css", "site");
    const { read } = await build(space, "https://example.com");
    expect(await read("news/first/index.html")).toMatch(/^Site layout: /);
    expect(await read("site.css")).toBe("site");
  });

  it("should use another theme folder when given one", async () => {
    const space = await workspace();
    const theme = join(space.root, "theme");
    await cp(join(THEME_DIR, "templates"), join(theme, "templates"), {
      recursive: true,
    });
    await mkdir(join(theme, "static"));
    await writeFile(join(theme, "static/theme.css"), "other theme");
    const result = await buildSite({
      siteDir: space.siteDir,
      themeDir: theme,
      siteUrl: "https://example.com",
      logger: { warn: vi.fn() },
      fetch: (() => Promise.reject(new Error("offline"))) as never,
    });
    expect(result.files).toContain("theme.css");
    expect(result.files).not.toContain("site.css");
  });

  it("should reject slugs and type paths that clash with other URLs", async () => {
    const tags = await workspace();
    await writeArticle(
      tags,
      "article/tags",
      "<!--yaml\ndate: 2026-10-19\n-->\n# Tags",
    );
    await expect(build(tags, "https://example.com")).rejects.toThrow(
      'articles/article/tags: the slug "tags" is used by tag lists',
    );

    const app = await workspace();
    await writeFile(
      join(app.siteDir, "edahaconfig.yml"),
      `reservedPaths: [app]\n${await readFile(join(FIXTURE, "edahaconfig.yml"), "utf8")}  page:\n    path: ''\n`,
    );
    await writeArticle(
      app,
      "page/app",
      "<!--yaml\ndate: 2026-10-19\n-->\n# App",
    );
    await expect(build(app, "https://example.com")).rejects.toThrow(
      'articles/page/app: the slug "app" is reserved',
    );

    const same = await workspace();
    await configurePages(same, "    path: news\n");
    await expect(build(same, "https://example.com")).rejects.toThrow(
      'edahaconfig.yml: types "article" and "page" have the same path "news"',
    );
  });

  it("should warn when SITE_URL and siteUrl are missing", async () => {
    const space = await workspace();
    const { logger, read } = await build(space);
    expect(logger.warn).toHaveBeenCalledWith(
      `SITE_URL is not set and edahaconfig.yml has no "siteUrl"; feeds will link to ${DEFAULT_SITE_URL}`,
    );
    expect(await read("news/feed.xml")).toContain(
      `<link>${DEFAULT_SITE_URL}/news/</link>`,
    );
  });

  it("should use siteUrl from edahaconfig.yml when SITE_URL is missing", async () => {
    const space = await workspace();
    await writeFile(
      join(space.siteDir, "edahaconfig.yml"),
      `siteUrl: http://127.0.0.1:5002\n${await readFile(join(FIXTURE, "edahaconfig.yml"), "utf8")}`,
    );
    const { logger, read } = await build(space);
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("SITE_URL"),
    );
    expect(await read("news/feed.xml")).toContain(
      "<link>http://127.0.0.1:5002/news/</link>",
    );
  });

  it("should build nothing when there are no articles", async () => {
    const root = await mkdtemp(join(tmpdir(), "edaha-empty-"));
    const siteDir = join(root, "my-site");
    await mkdir(siteDir);
    await cp(
      join(FIXTURE, "edahaconfig.yml"),
      join(siteDir, "edahaconfig.yml"),
    );
    const { result } = await build({ root, siteDir }, "https://example.com");
    // Only the theme's static files
    expect(result.files).toEqual(["base.css"]);

    // And with a theme without static files, nothing at all
    const theme = join(root, "theme");
    await cp(join(THEME_DIR, "templates"), join(theme, "templates"), {
      recursive: true,
    });
    const bare = await buildSite({
      siteDir,
      themeDir: theme,
      siteUrl: "https://example.com",
      logger: { warn: vi.fn() },
    });
    expect(bare.files).toEqual([]);
  });

  it("should read articles from the articlesDir folder, with a config file named in options", async () => {
    const space = await workspace();
    await rename(
      join(space.siteDir, "articles"),
      join(space.siteDir, "content"),
    );
    // Articles with yml and json headers too
    const content = join(space.siteDir, "content");
    const about = join(content, "page/about-us/article.md");
    await writeFile(
      about,
      (await readFile(about, "utf8")).replace("<!--yaml", "<!--yml"),
    );
    const hidden = join(content, "article/hidden/article.md");
    await writeFile(
      hidden,
      (await readFile(hidden, "utf8")).replace(
        /^<!--yaml\n([\s\S]*?)-->/,
        (_, header: string) =>
          `<!--json\n${JSON.stringify(parse(header))}\n-->`,
      ),
    );
    const settings = parse(
      await readFile(join(FIXTURE, "edahaconfig.yml"), "utf8"),
    ) as Record<string, unknown>;
    await rm(join(space.siteDir, "edahaconfig.yml"));
    const configFile = join(space.siteDir, "settings.json");
    await writeFile(
      configFile,
      JSON.stringify({ ...settings, articlesDir: "content" }),
    );
    const logger = { warn: vi.fn() };
    const result = await buildSite({
      configFile,
      siteUrl: "https://example.com",
      logger,
      fetch: vi.fn(() => Promise.reject(new Error("offline"))),
    });
    expect(result.articles).toHaveLength(4);
    expect(logger.warn).toHaveBeenCalledWith(
      'content/page: type "page" is not in settings.json; using the default settings',
    );
    // Article config headers are never written into built files
    for (const file of result.files)
      expect(
        await readFile(join(result.outputDir, file), "utf8"),
        file,
      ).not.toMatch(/<!--(yaml|yml|json)/);

    await writeFile(
      configFile,
      JSON.stringify({
        ...settings,
        articlesDir: "content",
        outputDir: "content/out",
      }),
    );
    await expect(buildSite({ configFile, logger })).rejects.toThrow(
      'settings.json: "outputDir" must be apart from content, templates, static, got "content/out"',
    );
  });

  it("should render embeds with the config file's renderers, then the given or built-in ones", async () => {
    const space = await workspace();
    const settings = parse(
      await readFile(join(FIXTURE, "edahaconfig.yml"), "utf8"),
    ) as Record<string, unknown>;
    await rm(join(space.siteDir, "edahaconfig.yml"));
    await writeFile(
      join(space.siteDir, "edaha.config.mjs"),
      `export default {
  ...${JSON.stringify(settings)},
  embeds: [
    {
      name: "Example",
      match: (url) => url.hostname === "media.example.com",
      render: async (url) => \`<iframe src="\${url.href}"></iframe>\`,
    },
  ],
};
`,
    );
    await writeArticle(
      space,
      "article/embeds",
      `<!--yaml\ndate: 2026-10-19T09:54:00Z\n-->\n# Embeds\n\n<!-- embed -->https://media.example.com/v/1<!-- /embed -->\n\n<!-- embed -->https://youtu.be/aju_UB5VIf8<!-- /embed -->\n`,
    );
    const { read } = await build(space, "https://example.com");
    const html = await read("news/embeds/index.html");
    expect(html).toContain('<iframe src="https://media.example.com/v/1">');
    expect(html).toContain("youtube-nocookie.com/embed/aju_UB5VIf8");

    // Given renderers take the built-in ones' place, after the config file's
    const result = await buildSite({
      siteDir: space.siteDir,
      siteUrl: "https://example.com",
      logger: { warn: vi.fn() },
      embedRenderers: [],
    });
    const only = await readFile(
      join(result.outputDir, "news/embeds/index.html"),
      "utf8",
    );
    expect(only).toContain('<iframe src="https://media.example.com/v/1">');
    expect(only).not.toContain("youtube-nocookie.com");
  });

  it("should reject invalid type and article folder names", async () => {
    const reserved = await workspace();
    await cp(
      join(reserved.siteDir, "articles/page"),
      join(reserved.siteDir, "articles/tags"),
      { recursive: true },
    );
    await expect(build(reserved, "https://example.com")).rejects.toThrow(
      "articles/tags: article types must be lowercase kebab-case and not tags or authors",
    );

    const badSlug = await workspace();
    await cp(
      join(badSlug.siteDir, "articles/page/about-us"),
      join(badSlug.siteDir, "articles/page/About Us"),
      {
        recursive: true,
      },
    );
    await expect(build(badSlug, "https://example.com")).rejects.toThrow(
      "articles/page/About Us: folder names must be lowercase kebab-case",
    );
  });

  it("should use the global fetch and console by default", async () => {
    const space = await workspace();
    await writeFile(
      join(space.siteDir, "articles/article/first/article.md"),
      "<!--yaml\ndate: 2026-10-19\n-->\n# Only",
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await buildSite({
      siteDir: space.siteDir,
      siteUrl: "https://example.com",
    });
    expect(result.articles.find((a) => a.slug === "first")?.title).toBe("Only");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
