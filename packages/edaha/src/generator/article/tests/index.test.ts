import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  articleAuthor,
  authorData,
  loadArticle,
  parseArticleConfig,
  headerFormat,
  splitArticle,
  splitContent,
  tagData,
  type ArticleContext,
} from "..";
import { createMarkdown, renderMarkdown } from "../../markdown";
import type { TemplateDataSite } from "../../types";

const site: TemplateDataSite = {
  name: "Test News",
  description: "Test articles.",
  url: "https://example.com",
  baseUrl: "",
  path: "/",
  types: {},
  author: { name: "Test News" },
};

const FIRST_DIR = fileURLToPath(
  new URL(
    "../../../shared/tests/fixtures/site/articles/article/first",
    import.meta.url,
  ),
);

/** An article context for the fixture's "first" article, with embeds replaced by a marker */
const context = (overrides: Partial<ArticleContext> = {}): ArticleContext => {
  const markdown = createMarkdown();
  return {
    site,
    dir: FIRST_DIR,
    slug: "first",
    url: "/news/first/",
    typeUrl: "/news/",
    source: "articles/article/first",
    replaceEmbeds: async (md) =>
      md.replace(
        /<!-- embed -->(.*?)<!-- \/embed -->/g,
        "\n\n<div>embed $1</div>\n\n",
      ),
    renderMarkdown: (md, baseUrl) => renderMarkdown(markdown, md, baseUrl),
    ...overrides,
  };
};

const DATE = "2026-10-19T09:54:00.000Z";

describe("splitArticle", () => {
  it("should split the YAML header from the content", () => {
    expect(splitArticle("<!--yaml\ndate: 2026-10-19\n-->\n# Hi")).toEqual({
      header: { date: "2026-10-19" },
      format: "yaml",
      content: "\n# Hi",
    });
    expect(splitArticle("<!--yml\r\ndate: 2026-10-19\r\n-->\n# Hi")).toEqual({
      header: { date: "2026-10-19" },
      format: "yml",
      content: "\n# Hi",
    });
  });

  it("should split the JSON header from the content", () => {
    expect(
      splitArticle(
        '<!--json \n{ "date": "2026-10-19", "tags": ["a"] }\n-->\n# Hi',
      ),
    ).toEqual({
      header: { date: "2026-10-19", tags: ["a"] },
      format: "json",
      content: "\n# Hi",
    });
  });

  it("should treat a missing or empty header as no config", () => {
    expect(splitArticle("# Hi")).toEqual({
      header: {},
      format: "yaml",
      content: "# Hi",
    });
    for (const format of ["yaml", "yml", "json"])
      expect(splitArticle(`<!--${format}\n-->\nBody`)).toEqual({
        header: {},
        format,
        content: "\nBody",
      });
  });

  it("should leave other comments and unknown formats in the content", () => {
    expect(splitArticle("<!--toml\na = 1\n-->\n# Hi")).toEqual({
      header: {},
      format: "yaml",
      content: "<!--toml\na = 1\n-->\n# Hi",
    });
  });

  it("should throw when the header can't be read", () => {
    expect(() => splitArticle("<!--json\n{ date: 1 }\n-->\n# Hi")).toThrow(
      /^the json config header can't be read: /,
    );
    expect(() => splitArticle("<!--yaml\na: [\n-->\n# Hi")).toThrow(
      /^the yaml config header can't be read: /,
    );
  });
});

describe("headerFormat", () => {
  it("should give the config header's format, or yaml when there is none", () => {
    expect(headerFormat("<!--json\n{}\n-->\n# Hi")).toBe("json");
    expect(headerFormat("<!--yml\na: [\n-->")).toBe("yml");
    expect(headerFormat("# Hi")).toBe("yaml");
  });
});

describe("parseArticleConfig", () => {
  const parse = (header: unknown, type = "article") =>
    parseArticleConfig(header, type, "articles/article/a");

  it("should default the type to the article's folder, and read its template", () => {
    expect(parse({ date: DATE, template: "home" }, "page")).toMatchObject({
      type: "page",
      template: "home",
    });
  });

  it("should fill in defaults", () => {
    expect(parse({ date: "2026-10-19T09:54:00Z" })).toEqual({
      type: "article",
      status: "published",
      date: DATE,
      author: undefined,
      title: undefined,
      template: undefined,
      excerpt: undefined,
      thumbnail: undefined,
      attachments: [],
      tags: [],
    });
  });

  it("should read author: false as no author", () => {
    expect(parse({ date: DATE, author: false }, "article").author).toBe(false);
  });

  it("should read every field", () => {
    expect(
      parse(
        {
          type: "page",
          status: "unlisted",
          date: new Date(DATE),
          author: {
            name: " Ana ",
            email: "ana@example.com",
            url: "https://ana.example",
          },
          title: "Title",
          excerpt: "Short",
          thumbnail: "t.png",
          attachments: [
            {
              url: "a.pdf",
              thumbnail: "a.png",
              mimeType: "application/pdf",
              name: "A",
            },
          ],
          tags: [" News "],
        },
        "page",
      ),
    ).toEqual({
      type: "page",
      status: "unlisted",
      date: DATE,
      author: {
        name: "Ana",
        email: "ana@example.com",
        url: "https://ana.example",
      },
      title: "Title",
      excerpt: "Short",
      thumbnail: "t.png",
      attachments: [
        {
          url: "a.pdf",
          thumbnail: "a.png",
          mimeType: "application/pdf",
          name: "A",
        },
      ],
      tags: ["News"],
    });
    expect(parse({ date: DATE, author: "Matt", title: null }).author).toEqual({
      name: "Matt",
    });
  });

  it("should reject invalid configs", () => {
    const cases: [unknown, string][] = [
      [[], "the config header must be a map"],
      [
        { date: DATE, type: "page" },
        'type "page" doesn\'t match its folder "article"',
      ],
      [
        { date: DATE, status: "hidden" },
        '"status" must be one of published, draft, unlisted',
      ],
      [{}, '"date" must be an ISO 8601 timestamp'],
      [{ date: "yesterday" }, '"date" must be an ISO 8601 timestamp'],
      [{ date: DATE, title: 3 }, '"title" must be a non-empty string'],
      [
        { date: DATE, template: "list" },
        '"template" must be a template name like "single"',
      ],
      [
        { date: DATE, template: "../x" },
        '"template" must be a template name like "single"',
      ],
      [{ date: DATE, author: ["x"] }, '"author" must be a map'],
      [{ date: DATE, author: {} }, '"author.name" is required'],
      [{ date: DATE, author: "?!" }, '"author" needs a name'],
      [{ date: DATE, attachments: "a.pdf" }, '"attachments" must be a list'],
      [{ date: DATE, attachments: ["a.pdf"] }, "attachment 1 must be a map"],
      [
        { date: DATE, attachments: [{ name: "A" }] },
        'attachment 1 needs a "url"',
      ],
      [{ date: DATE, tags: "News" }, '"tags" must be a list of names'],
      [{ date: DATE, tags: [3] }, '"tags" must be a list of names'],
    ];
    for (const [header, message] of cases)
      expect(() => parse(header), message).toThrow(
        `articles/article/a: ${message}`,
      );
  });
});

describe("splitContent", () => {
  it("should take the title from a leading H1 and remove it and the readmore shortcode", () => {
    expect(splitContent("\n# Hi #\n\nIntro <!-- readmore -->rest")).toEqual({
      heading: "Hi",
      body: "Intro rest",
      beforeReadmore: "Intro",
    });
  });

  it("should turn raw blocks into HTML first, so nothing in them is a title or shortcode", () => {
    expect(
      splitContent(
        "<!-- raw -->\n# Not a title\n<!-- readmore -->\n<!-- /raw -->\n\nIntro <!-- readmore -->rest",
      ),
    ).toEqual({
      heading: undefined,
      body: '<pre class="raw">&#35; Not a title&#10;&#60;&#33;&#45;&#45; readmore &#45;&#45;&#62;</pre>\n\n\n\nIntro rest',
      beforeReadmore:
        '<pre class="raw">&#35; Not a title&#10;&#60;&#33;&#45;&#45; readmore &#45;&#45;&#62;</pre>\n\n\n\nIntro',
    });
  });

  it("should ignore readmore shortcodes in code", () => {
    expect(
      splitContent(
        "Intro `<!-- readmore -->`\n\n```md\nA <!-- readmore -->B\n```\n\nMore <!-- readmore -->rest",
      ),
    ).toEqual({
      heading: undefined,
      body: "Intro `<!-- readmore -->`\n\n```md\nA <!-- readmore -->B\n```\n\nMore rest",
      beforeReadmore:
        "Intro `<!-- readmore -->`\n\n```md\nA <!-- readmore -->B\n```\n\nMore",
    });
    expect(splitContent("```\n<!-- readmore -->\n```")).toEqual({
      heading: undefined,
      body: "```\n<!-- readmore -->\n```",
      beforeReadmore: undefined,
    });
  });

  it("should keep an H1 that isn't at the start in the body", () => {
    expect(splitContent("Intro\n\n# Later")).toEqual({
      heading: "Later",
      body: "Intro\n\n# Later",
      beforeReadmore: undefined,
    });
  });
});

describe("articleAuthor, authorData and tagData", () => {
  it("should use the article's author, then its type's, then the website's, with false for none", () => {
    const own = { name: "Zoë" };
    const type = { name: "Docs team" };
    const site = { name: "Matt" };
    expect(articleAuthor(own, type, site)).toBe(own);
    expect(articleAuthor(false, type, site)).toBeUndefined();
    expect(articleAuthor(undefined, type, site)).toBe(type);
    expect(articleAuthor(undefined, false, site)).toBeUndefined();
    expect(articleAuthor(undefined, undefined, site)).toBe(site);
    expect(articleAuthor(undefined, undefined, undefined)).toBeUndefined();
  });

  it("should build slugs and list URLs", () => {
    expect(
      authorData(
        {
          name: "Zoë Ångström",
          email: "zoe@example.com",
          url: "https://z.com",
        },
        "/news/",
      ),
    ).toEqual({
      name: "Zoë Ångström",
      slug: "zoe-angstrom",
      email: "zoe@example.com",
      url: "https://z.com",
      listUrl: "/news/authors/zoe-angstrom/",
    });
    expect(tagData("Release Notes", "/news/")).toEqual({
      name: "Release Notes",
      slug: "release-notes",
      url: "/news/tags/release-notes/",
    });
  });
});

describe("loadArticle", () => {
  it("should read JSON headers and leave them out of the article", async () => {
    const article = await loadArticle(
      `<!--json\n{ "date": "${DATE}", "tags": ["News"] }\n-->\n# Json\n\nBody`,
      "article",
      context(),
    );
    expect(article?.title).toBe("Json");
    expect(article?.tags.map((tag) => tag.name)).toEqual(["News"]);
    expect(article?.bodyHtml).not.toContain("<!--");
    expect(article?.bodyHtml).not.toContain(DATE);
  });

  it("should show raw blocks exactly as they are written", async () => {
    const article = await loadArticle(
      `<!--yaml\ndate: ${DATE}\n-->\n# Raw\n\nSee <!-- raw -->*this* -- "here"<!-- /raw -->.\n\n<!-- raw -->\n\`\`\`\n<!-- readmore -->\n\`\`\`\n<!-- embed -->https://youtu.be/x<!-- /embed -->\n<!-- /raw -->\n`,
      "article",
      context({
        replaceEmbeds: async (md) => md.replace(/<!-- embed -->/g, "EMBED"),
      }),
    );
    expect(article?.bodyHtml).toContain(
      '<p>See <span class="raw">*this* -- &quot;here&quot;</span>.</p>\n<pre class="raw">&#96;&#96;&#96;&#10;&#60;&#33;&#45;&#45; readmore &#45;&#45;&#62;&#10;&#96;&#96;&#96;&#10;&#60;&#33;&#45;&#45; embed &#45;&#45;&#62;https&#58;&#47;&#47;youtu&#46;be&#47;x&#60;&#33;&#45;&#45; &#47;embed &#45;&#45;&#62;</pre>',
    );
    expect(article?.bodyHtml).not.toContain("EMBED");
    // The readmore shortcode in the raw block doesn't make an excerpt
    expect(article?.excerptText).toContain("<!-- readmore -->");
    expect(article?.bodyText).toContain('See *this* -- "here"');
  });

  it("should name the article when its header can't be read", async () => {
    await expect(
      loadArticle("<!--json\n{\n-->\n# Bad", "article", context()),
    ).rejects.toThrow(
      /^articles\/article\/first: the json config header can't be read: /,
    );
  });

  it("should return nothing for drafts", async () => {
    expect(
      await loadArticle(
        `<!--yaml\ndate: ${DATE}\nstatus: draft\n-->\n# Draft`,
        "article",
        context(),
      ),
    ).toBeUndefined();
  });

  it("should build an article with its excerpt, files and attachments", async () => {
    const source = `<!--yaml
date: ${DATE}
thumbnail: thumb.png
attachments:
  - url: guide.pdf
    thumbnail: thumb.png
  - url: https://example.com/files/remote%20file.zip
  - url: notes.bin?download=1#top
    mimeType: application/x-notes
    name: Notes
tags: [News]
-->

# First

Intro ![pic](thumb.png). <!-- readmore -->Rest.

<!-- embed -->https://youtu.be/x<!-- /embed -->
`;
    // notes.bin doesn't exist, so check the error first, then load without it
    await expect(loadArticle(source, "article", context())).rejects.toThrow(
      'articles/article/first: "notes.bin?download=1#top" was not found in the article\'s folder',
    );
    const article = await loadArticle(
      source.replace(/ {2}- url: notes.bin[\s\S]*?name: Notes\n/, ""),
      "article",
      context(),
    );
    expect(article).toMatchObject({
      type: "article",
      status: "published",
      date: DATE,
      slug: "first",
      template: "single",
      url: "/news/first/",
      title: "First",
      author: { name: "Test News", listUrl: "/news/authors/test-news/" },
      thumbnail: "/news/first/thumb.png",
      tags: [{ name: "News", slug: "news", url: "/news/tags/news/" }],
      excerpt: "Intro ![pic](thumb.png).",
      excerptHtml:
        '<p>Intro <img src="/news/first/thumb.png" alt="pic">.</p>\n',
      excerptText: "Intro .",
      bodyText: "Intro . Rest. embed https://youtu.be/x",
      attachments: [
        {
          name: "guide.pdf",
          url: "/news/first/guide.pdf",
          thumbnail: "/news/first/thumb.png",
          mimeType: "application/pdf",
          size: 13,
          sizeRelative: "13 bytes",
        },
        {
          name: "remote file.zip",
          url: "https://example.com/files/remote%20file.zip",
          thumbnail: undefined,
          mimeType: "application/zip",
          size: undefined,
          sizeRelative: undefined,
        },
      ],
    });
    expect(article!.bodyHtml).toContain("<div>embed https://youtu.be/x</div>");
    expect(article!.body).not.toContain("readmore");
  });

  it("should give the embeds in its body and excerpt the body's headings", async () => {
    const setEmbedHeadings = vi.fn();
    await loadArticle(
      `<!--yaml\ndate: ${DATE}\n-->\n# Title\n\nIntro\n\n<!-- readmore -->\n\n## One\n\n### Two`,
      "article",
      context({ setEmbedHeadings }),
    );
    expect(setEmbedHeadings).toHaveBeenCalledWith(
      '<p>Intro</p>\n<h2 id="one">One</h2>\n<h3 id="two">Two</h3>\n<p>Intro</p>\n',
      [
        { level: 2, text: "One", id: "one" },
        { level: 3, text: "Two", id: "two" },
      ],
    );
  });

  it("should prefer the configured title and excerpt", async () => {
    const article = await loadArticle(
      `<!--yaml\ndate: ${DATE}\ntitle: Custom\nexcerpt: Custom *excerpt*\n-->\n# Heading\n\nBody`,
      "article",
      context(),
    );
    expect(article).toMatchObject({
      title: "Custom",
      excerpt: "Custom *excerpt*",
      excerptHtml: "<p>Custom <em>excerpt</em></p>\n",
      excerptText: "Custom excerpt",
    });
  });

  it("should crop the body for the excerpt when there is no readmore", async () => {
    const words = "word ".repeat(60).trim();
    const article = await loadArticle(
      `<!--yaml\ndate: ${DATE}\n-->\n# Long\n\n${words} & more`,
      "article",
      context(),
    );
    expect(article!.excerpt).toBe(`${"word ".repeat(39).trim()} word…`);
    expect(article!.excerpt.length).toBeLessThanOrEqual(201);
    expect(article!.excerptHtml).toBe(`<p>${article!.excerpt}</p>`);
  });

  it("should require a title and existing local files", async () => {
    await expect(
      loadArticle(
        `<!--yaml\ndate: ${DATE}\n-->\nNo title`,
        "article",
        context(),
      ),
    ).rejects.toThrow('needs a "title" in its config or a "# Title" heading');
    await expect(
      loadArticle(
        `<!--yaml\ndate: ${DATE}\nthumbnail: missing.png\n-->\n# T`,
        "article",
        context(),
      ),
    ).rejects.toThrow('"missing.png" was not found');
    // A folder isn't a file
    await expect(
      loadArticle(
        `<!--yaml\ndate: ${DATE}\nthumbnail: ../first\n-->\n# T`,
        "article",
        context(),
      ),
    ).rejects.toThrow('"../first" was not found');
  });

  it("should use an absolute thumbnail as is and default unknown mime types", async () => {
    const article = await loadArticle(
      `<!--yaml\ndate: ${DATE}\nthumbnail: https://example.com/t.png\nattachments:\n  - url: https://example.com/file\n-->\n# T`,
      "article",
      context(),
    );
    expect(article!.thumbnail).toBe("https://example.com/t.png");
    expect(article!.attachments[0]!.mimeType).toBe("application/octet-stream");
  });
});
