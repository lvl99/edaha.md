import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { REQUIRED_TEMPLATES, Templates, absoluteUrls } from "..";

/** A templates folder containing the given files */
const templatesDir = async (files: Record<string, string>) => {
  const dir = await mkdtemp(join(tmpdir(), "blog-templates-"));
  for (const [file, contents] of Object.entries(files)) {
    await mkdir(join(dir, file, ".."), { recursive: true });
    await writeFile(join(dir, file), contents);
  }
  return dir;
};

const REQUIRED = Object.fromEntries(
  REQUIRED_TEMPLATES.map((file) => [file, file]),
);

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
      'Template "missing" not found in templates/page/ or templates/article/',
    );
  });

  it("should list the templates an article of a type can use", async () => {
    const dir = await templatesDir({
      ...REQUIRED,
      "page/home.njk": "",
      "page/list.njk": "",
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
        "{{ blog.name }}|{{ blog.description | safe }}|{{ site.url | date }}|{{ site.url | rfc822 }}|{{ blog.url | absoluteUrls(blog.path) | safe }}",
    });
    const templates = new Templates(dir, { warn: vi.fn() });
    expect(
      templates.render("test.njk", {
        site: { url: "2026-10-19T09:54:00.000Z" },
        blog: {
          name: "<News>",
          description: "<b>Bold</b>",
          path: "https://example.com",
          url: ' src="/a.png"',
          types: {},
        },
      }),
    ).toBe(
      '&lt;News&gt;|<b>Bold</b>|19 October 2026|Mon, 19 Oct 2026 09:54:00 GMT| src="https://example.com/a.png"',
    );
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
});
