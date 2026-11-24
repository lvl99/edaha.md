import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  REQUIRED_TEMPLATES,
  Templates,
  templateFileName,
  absoluteUrl,
  absoluteUrls,
  contains,
  parseJson,
  toJson,
  where,
} from "..";

/** A templates folder containing the given files */
const templatesDir = async (files: Record<string, string>) => {
  const dir = await mkdtemp(join(tmpdir(), "edaha-templates-"));
  for (const [file, contents] of Object.entries(files)) {
    await mkdir(join(dir, file, ".."), { recursive: true });
    await writeFile(join(dir, file), contents);
  }
  return dir;
};

const REQUIRED = Object.fromEntries(
  REQUIRED_TEMPLATES.map((file) => [file, file]),
);

/** The required templates, without some */
const without = (...files: string[]) =>
  Object.fromEntries(
    Object.entries(REQUIRED).filter(([file]) => !files.includes(file)),
  );

describe("absoluteUrl", () => {
  it("should add the website's origin to root-relative URLs, which already start with its base URL", () => {
    expect(absoluteUrl("/news/", "https://example.com")).toBe(
      "https://example.com/news/",
    );
    expect(
      absoluteUrl("/edaha.md/news/", "https://lvl99.github.io/edaha.md"),
    ).toBe("https://lvl99.github.io/edaha.md/news/");
  });
});

describe("absoluteUrls", () => {
  it("should make root-relative href and src URLs absolute", () => {
    expect(
      absoluteUrls(
        '<a href="/news/">x</a><img src="/a.png"><a href="https://x.com/">y</a><a href="//cdn.com/z">z</a>',
        "https://example.com",
      ),
    ).toBe(
      '<a href="https://example.com/news/">x</a><img src="https://example.com/a.png"><a href="https://x.com/">y</a><a href="//cdn.com/z">z</a>',
    );
    expect(
      absoluteUrls(
        '<a href="/edaha.md/news/">x</a>',
        "https://lvl99.github.io/edaha.md",
      ),
    ).toBe('<a href="https://lvl99.github.io/edaha.md/news/">x</a>');
  });
});

describe("toJson", () => {
  it("should write values as JSON, indented when pretty", () => {
    expect(toJson(1)).toBe("1");
    expect(toJson(null)).toBe("null");
    expect(toJson({ test: 123 })).toBe('{"test":123}');
    expect(toJson({ test: 123 }, true)).toBe('{\n  "test": 123\n}');
  });

  it("should give an empty string for values JSON can't hold", () => {
    expect(toJson(undefined)).toBe("");
  });

  it("should give the error's message for values JSON can't write", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(toJson(circular)).toMatch(/circular/i);
  });
});

describe("parseJson", () => {
  it("should parse JSON text into a value", () => {
    expect(parseJson("1")).toBe(1);
    expect(parseJson("null")).toBeNull();
    expect(parseJson('{"test":123}')).toEqual({ test: 123 });
  });

  it("should give undefined for invalid JSON", () => {
    expect(parseJson("{test")).toBeUndefined();
  });
});

describe("contains", () => {
  it("should find text in a string, comparing the search value as text", () => {
    expect(contains("example 1, 2, 3, 4", "4")).toBe(true);
    expect(contains("example 1, 2, 3, 4", 4)).toBe(true);
    expect(contains("example 1, 2, 3, 4", "5")).toBe(false);
  });

  it("should find values in an array, comparing them exactly", () => {
    expect(contains(["example", 1, 2, 3, 4], 4)).toBe(true);
    expect(contains(["example", 1, 2, 3, 4], "4")).toBe(false);
  });

  it("should find nothing in other values", () => {
    expect(contains(undefined, "a")).toBe(false);
    expect(contains({ a: 1 }, "a")).toBe(false);
  });
});

describe("where", () => {
  it("should give a property's values, leaving out objects without it", () => {
    expect(
      where(
        [{ example: 1, test: 2 }, { example: 3, test: 4 }, { example: 5 }],
        "test",
      ),
    ).toEqual([2, 4]);
  });

  it("should read nested properties, keeping falsy values", () => {
    expect(
      where(
        [{ author: { name: "Ana" } }, { author: { name: "" } }, {}],
        "author.name",
      ),
    ).toEqual(["Ana", ""]);
  });
});

describe("Templates", () => {
  it("should require the article and layout templates", async () => {
    const dir = await templatesDir({ "article/single.njk": "" });
    expect(() => new Templates(dir, { warn: vi.fn() })).toThrow(
      "Missing required templates",
    );
    expect(() => new Templates(dir, { warn: vi.fn() })).toThrow(
      "layouts/html.njk, layouts/rssfeed.njk, article/list.njk",
    );
  });

  it("should output the page's embed HTML with the embed tags, and nothing without it", async () => {
    const dir = await templatesDir({
      ...REQUIRED,
      "test.njk":
        "{% embedHead %}|{% embedFoot %}|{% embedRenderHead() %}|{% embedRenderFoot() %}",
    });
    const templates = new Templates(dir, { warn: vi.fn() });
    const site = {
      name: "Site",
      description: "",
      url: "https://example.com",
      baseUrl: "",
      path: "/",
      files: { url: "/files/", path: "/files/" },
      types: {},
    };
    expect(
      templates.render("test.njk", {
        site,
        type: "news",
        isArticle: true,
        isList: false,
        embeds: { head: "<style></style>", foot: "<script></script>" },
      }),
    ).toBe(
      "<style></style>|<script></script>|<style></style>|<script></script>",
    );
    expect(
      templates.render("test.njk", {
        site,
        type: "news",
        isArticle: true,
        isList: false,
      }),
    ).toBe("|||");
  });

  it("should use a type's own template or fall back to article's with one warning", async () => {
    const dir = await templatesDir({ ...REQUIRED, "page/single.njk": "page" });
    const logger = { warn: vi.fn() };
    const templates = new Templates(dir, logger);
    expect(templates.resolve("page", "single")).toBe("page/single.njk");
    expect(templates.resolve("page", "list")).toBe("article/list.njk");
    expect(templates.resolve("page", "list")).toBe("article/list.njk");
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      "Template page/list.njk not found; using article/list.njk",
    );
  });

  it("should use the default templates silently for a type without a templates folder", async () => {
    const dir = await templatesDir({ ...REQUIRED, "article/home.njk": "home" });
    const logger = { warn: vi.fn() };
    const templates = new Templates(dir, logger);
    expect(templates.resolve("news", "single")).toBe("article/single.njk");
    expect(templates.resolve("news", "home")).toBe("article/home.njk");
    expect(templates.resolve("article", "single")).toBe("article/single.njk");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("should fail for a template that exists nowhere", async () => {
    const templates = new Templates(await templatesDir(REQUIRED), {
      warn: vi.fn(),
    });
    expect(() => templates.resolve("page", "missing")).toThrow(
      /^Template "missing" not found: looked for page\/missing\.njk and article\/missing\.njk \(or with an output extension, e\.g\. missing\.json\.njk\) in \/.+$/,
    );
  });

  it("should list the templates an article of a type can use", async () => {
    const dir = await templatesDir({
      ...REQUIRED,
      "page/home.njk": "",
      "page/home.json.njk": "",
      "page/list.njk": "",
      "page/list.json.njk": "",
      "page/notes.txt": "",
    });
    const templates = new Templates(dir, { warn: vi.fn() });
    expect(templates.names("page")).toEqual(["home", "single"]);
    expect(templates.names("news")).toEqual(["single"]);
  });

  it("should render with autoescaping and the date filters", async () => {
    const dir = await templatesDir({
      ...REQUIRED,
      "test.njk":
        '{{ site.name }}|{{ site.description | safe }}|{{ site.url | date }}|{{ site.url | rfc822 }}|{{ site.path | absoluteUrls("https://example.com") | safe }}',
    });
    const templates = new Templates(dir, { warn: vi.fn() });
    expect(
      templates.render("test.njk", {
        site: {
          author: { name: "<News>" },
          name: "<News>",
          description: "<b>Bold</b>",
          url: "2026-10-19T09:54:00.000Z",
          baseUrl: "",
          path: ' src="/a.png"',
          files: { url: "/files/", path: "/files/" },
          types: {},
        },
        type: "news",
        isArticle: false,
        isList: true,
      }),
    ).toBe(
      '&lt;News&gt;|<b>Bold</b>|19 October 2026|Mon, 19 Oct 2026 09:54:00 GMT| src="https://example.com/a.png"',
    );
  });

  it("should render with the JSON, contains and where filters", async () => {
    const dir = await templatesDir({
      ...REQUIRED,
      "test.njk":
        '{{ site.types | json | safe }}|{{ (\'{"a":[1,2]}\' | parseJson).a | contains(2) }}|{{ site.types.news.tags | where("name") | join(",") }}',
    });
    const templates = new Templates(dir, { warn: vi.fn() });
    expect(
      templates.render("test.njk", {
        site: {
          name: "News",
          description: "",
          url: "https://example.com",
          baseUrl: "",
          path: "/",
          files: { url: "/files/", path: "/files/" },
          types: {
            news: { tags: [{ name: "a" }, {}, { name: "b" }] },
          } as never,
        },
        type: "news",
        isArticle: false,
        isList: true,
      }),
    ).toBe('{"news":{"tags":[{"name":"a"},{},{"name":"b"}]}}|true|a,b');
  });

  it("should let earlier folders override later ones, and list names from all of them", async () => {
    const theme = await templatesDir({
      ...REQUIRED,
      "article/single.njk": "theme single",
      "article/home.njk": "theme home",
    });
    const site = await templatesDir({
      "article/single.njk": "site single",
      "page/about.njk": "about",
    });
    const templates = new Templates([site, theme], { warn: vi.fn() });
    expect(templates.render("article/single.njk", {} as never)).toBe(
      "site single",
    );
    expect(templates.render("article/home.njk", {} as never)).toBe(
      "theme home",
    );
    expect(templates.resolve("page", "about")).toBe("page/about.njk");
    expect(templates.names("page")).toEqual(["about", "home", "single"]);
  });

  it("should load @theme/ templates from the last folder, so a site's template can build on the theme's", async () => {
    const theme = await templatesDir({
      ...REQUIRED,
      "article/single.njk":
        "<main>{% block main %}theme main{% endblock %}</main>",
      "partials/note.njk": "theme note",
    });
    const site = await templatesDir({
      "article/single.njk":
        '{% extends "@theme/article/single.njk" %}{% block main %}site, then {{ super() }}, {% include "@theme/partials/note.njk" %}{% endblock %}',
      "partials/note.njk": "site note",
    });
    const templates = new Templates([site, theme], { warn: vi.fn() });
    expect(templates.render("article/single.njk", {} as never)).toBe(
      "<main>site, then theme main, theme note</main>",
    );
    // Without the prefix, the site's file comes first
    expect(templates.render("partials/note.njk", {} as never)).toBe(
      "site note",
    );
    expect(() => templates.render("@theme/missing.njk", {} as never)).toThrow(
      "template not found: @theme/missing.njk",
    );
  });

  describe("output extensions", () => {
    it("should render every template of a name, each to its own extension (HTML unless given)", async () => {
      const dir = await templatesDir({
        ...REQUIRED,
        "article/single.json.njk": "{}",
        "article/single.txt.njk": "",
        "article/singles.njk": "",
      });
      const templates = new Templates(dir, { warn: vi.fn() });
      expect(templates.outputs("news", "single")).toEqual([
        { file: "article/single.json.njk", extension: "json" },
        { file: "article/single.njk", extension: "html" },
        { file: "article/single.txt.njk", extension: "txt" },
      ]);
      // A preview uses the HTML one
      expect(templates.resolve("news", "single")).toBe("article/single.njk");
    });

    it("should use a name's first template when none outputs HTML, and accept required templates with any extension", async () => {
      const dir = await templatesDir({
        ...without("article/single.njk"),
        "article/single.json.njk": "{}",
      });
      const templates = new Templates(dir, { warn: vi.fn() });
      expect(templates.resolve("news", "single")).toBe(
        "article/single.json.njk",
      );
    });

    it("should let an earlier folder's template override a later one's that outputs the same extension", async () => {
      const theme = await templatesDir({
        ...REQUIRED,
        "article/single.html.njk": "theme html",
        "article/single.json.njk": "theme json",
      });
      // The theme's single.njk and single.html.njk both output HTML: found as soon as the templates are loaded
      expect(
        () =>
          new Templates([theme], {
            warn: vi.fn(),
          }),
      ).toThrow(
        /^article\/single\.html\.njk and article\/single\.njk in .+ both output single's \.html file; rename or remove one of them$/,
      );
      const site = await templatesDir({
        "article/single.njk": "site html",
        "layouts/rssfeed.njk": "site feed",
      });
      const themeOnly = await templatesDir({
        ...without("article/single.njk", "layouts/rssfeed.njk"),
        "article/single.html.njk": "theme html",
        "article/single.json.njk": "theme json",
        "layouts/rssfeed.xml.njk": "theme feed",
      });
      const templates = new Templates([site, themeOnly], { warn: vi.fn() });
      expect(templates.outputs("news", "single")).toEqual([
        { file: "article/single.njk", extension: "html" },
        { file: "article/single.json.njk", extension: "json" },
      ]);
      expect(templates.render("article/single.njk", {} as never)).toBe(
        "site html",
      );
      // A site's rssfeed.njk (XML) overrides the theme's rssfeed.xml.njk
      expect(templates.feedOutputs()).toEqual([
        { file: "layouts/rssfeed.njk", extension: "xml" },
      ]);
    });

    it("should give the feed's templates, XML unless given", async () => {
      const dir = await templatesDir({
        ...REQUIRED,
        "layouts/rssfeed.json.njk": "{}",
      });
      expect(new Templates(dir, { warn: vi.fn() }).feedOutputs()).toEqual([
        { file: "layouts/rssfeed.json.njk", extension: "json" },
        { file: "layouts/rssfeed.njk", extension: "xml" },
      ]);
    });

    it("should warn once about a type's missing template, naming all of article's", async () => {
      const dir = await templatesDir({
        ...REQUIRED,
        "article/list.json.njk": "{}",
        "page/single.njk": "page",
      });
      const logger = { warn: vi.fn() };
      const templates = new Templates(dir, logger);
      expect(templates.outputs("page", "list")).toHaveLength(2);
      expect(logger.warn).toHaveBeenCalledWith(
        "Template page/list.njk not found; using article/list.json.njk and article/list.njk",
      );
    });
  });
});

describe("templateFileName", () => {
  it("should split a template file's name into its name and output extension", () => {
    expect(templateFileName("single.json.njk")).toEqual({
      name: "single",
      extension: "json",
    });
    expect(templateFileName("single.njk")).toEqual({
      name: "single",
      extension: undefined,
    });
    expect(templateFileName("my.page.xml.njk")).toEqual({
      name: "my.page",
      extension: "xml",
    });
    expect(templateFileName("notes.txt")).toBeUndefined();
  });
});
