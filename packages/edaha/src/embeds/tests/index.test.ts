import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createMarkdown, renderMarkdown } from "../../generator/markdown";
import {
  cachedFetch,
  checkEmbedPlugins,
  EMBED_PAGE_PARTS,
  EmbedResolver,
  htmlHeadings,
  isEmbedPlugin,
  loadPlugins,
  validationErrors,
  type EmbedPlugin,
  type EmbedRenderContext,
  type EmbedTarget,
} from "..";

const fetch = vi.fn() as unknown as typeof globalThis.fetch;

/**
 * An embed that wraps its content, fails for "broken", counts its renders on the page in its state, and needs a script
 * once per page, listing its blocks' sizes
 */
const example = {
  key: "example",
  name: "Example",
  options: {
    size: {
      title: "Size",
      type: "string",
      enum: ["small", "large"],
      $edahaField: { select: true, defaultValue: "small" },
    },
  },
  build: {
    render: vi.fn(async (content: string, { state, options }) => {
      if (content === "broken") throw new Error("broken");
      state.count = ((state.count as number | undefined) ?? 0) + 1;
      return `<figure class="${options.size as string}">${content}</figure>`;
    }),
    renderHead: async ({ state, options }) =>
      `<style>/* ${state.count as number}: ${options.map((o) => o.size as string).join(",")} */</style>`,
    renderFoot: async ({ state }) =>
      `<script>/* ${state.count as number} */</script>`,
  },
  editor: {
    render: async (content: string) => `<p>Editing ${content}</p>`,
  },
} satisfies EmbedPlugin;

/** An embed with nothing to add to pages, whose head fails when asked */
const plain = {
  key: "plain",
  name: "Plain",
  build: { render: async (content: string) => content },
} satisfies EmbedPlugin;

/** A resolver using the example embeds and a warning spy */
const setup = (plugins: EmbedPlugin[] = [example, plain]) => {
  const logger = { warn: vi.fn() };
  return { logger, resolver: new EmbedResolver({ fetch, logger, plugins }) };
};

describe("isEmbedPlugin and checkEmbedPlugins", () => {
  it("should accept embed plugins, with optional descriptions, sources and editor renderers", () => {
    expect(isEmbedPlugin(example)).toBe(true);
    expect(isEmbedPlugin(plain)).toBe(true);
    expect(
      isEmbedPlugin({
        ...plain,
        description: "Plain text",
        info: "Any text",
        contentOptional: true,
        options: {},
        validate: () => true,
        sources: {
          frame: ["https://player.example.com"],
          script: ["https://cdn.example.com"],
        },
        editor: { icon: "<svg></svg>" },
      }),
    ).toBe(true);
    expect(checkEmbedPlugins([example, plain])).toEqual([example, plain]);
  });

  it("should reject anything else, and keys used twice", () => {
    for (const value of [
      null,
      "youtube",
      { ...plain, key: "Plain" },
      { ...plain, key: "a b" },
      { ...plain, name: " " },
      { ...plain, description: 3 },
      { ...plain, info: 3 },
      { ...plain, contentOptional: "yes" },
      { ...plain, options: [] },
      { ...plain, options: null },
      { ...plain, validate: true },
      { ...plain, build: undefined },
      { ...plain, build: { render: "x" } },
      { ...plain, build: { ...plain.build, renderHead: "x" } },
      { ...plain, editor: { render: "x" } },
      { ...plain, editor: { icon: 3 } },
      { ...plain, editor: null },
      { ...plain, sources: null },
      { ...plain, sources: { image: ["https://a.com"] } },
      { ...plain, sources: { frame: "https://a.com" } },
      { ...plain, sources: { frame: ["http://a.com"] } },
      { ...plain, sources: { frame: ["https://a.com/path"] } },
      { ...plain, sources: { frame: [3] } },
    ]) {
      expect(isEmbedPlugin(value), JSON.stringify(value)).toBe(false);
      expect(() => checkEmbedPlugins([value])).toThrow(
        '"plugins" must be embed plugins',
      );
    }
    expect(() => checkEmbedPlugins([plain, { ...plain }])).toThrow(
      '"plugins" has more than one embed with the key "plain"',
    );
  });

  it("should check embeds' options are fields", () => {
    expect(() =>
      checkEmbedPlugins([{ ...plain, options: { size: { type: "string" } } }]),
    ).toThrow(
      '"Plain embed\'s options.size.$edahaField" must be a map of settings',
    );
    expect(() =>
      checkEmbedPlugins([
        {
          ...plain,
          options: { size: { type: "strin", $edahaField: { text: true } } },
        },
      ]),
    ).toThrow("Plain embed's options aren't valid JSON Schemas:");
  });
});

describe("checkEmbedPlugins without JSON", () => {
  it("should describe values JSON can't write", () => {
    expect(() => checkEmbedPlugins([undefined])).toThrow("got undefined");
  });
});

describe("loadPlugins", () => {
  /** A site folder with a plugin package, whose default export is given */
  const site = async (exported: string) => {
    const dir = await mkdtemp(join(tmpdir(), "edaha-plugins-"));
    const pkg = join(dir, "node_modules", "edaha-plugin-test");
    await mkdir(pkg, { recursive: true });
    await writeFile(
      join(pkg, "package.json"),
      JSON.stringify({ name: "edaha-plugin-test", main: "index.js" }),
    );
    await writeFile(join(pkg, "index.js"), `module.exports = ${exported};`);
    return dir;
  };

  it("should import package names from the folder, keeping plugin objects", async () => {
    const dir = await site(
      '{ key: "test", name: "Test", build: { render: async (c) => c } }',
    );
    const loaded = await loadPlugins(["edaha-plugin-test", plain], dir);
    expect(loaded).toHaveLength(2);
    expect(loaded[0]).toMatchObject({ key: "test", name: "Test" });
    expect(loaded[1]).toBe(plain);
    expect(await loadPlugins(undefined, dir)).toEqual([]);
    expect(await loadPlugins(null, dir)).toEqual([]);
  });

  it("should add every plugin of a package that exports a list", async () => {
    const dir = await site(
      '[{ key: "a", name: "A", build: { render: async (c) => c } }, { key: "b", name: "B", build: { render: async (c) => c } }]',
    );
    expect(
      (await loadPlugins(["edaha-plugin-test"], dir)).map(
        (plugin) => (plugin as EmbedPlugin).key,
      ),
    ).toEqual(["a", "b"]);
  });

  it("should reject a setting that isn't a list, and name packages that can't be loaded", async () => {
    const dir = await mkdtemp(join(tmpdir(), "edaha-plugins-"));
    await expect(loadPlugins("youtube", dir)).rejects.toThrow(
      '"plugins" must be a list of embed plugin package names',
    );
    await expect(loadPlugins(["edaha-plugin-missing"], dir)).rejects.toThrow(
      'plugin "edaha-plugin-missing" couldn\'t be loaded: Cannot find module',
    );
  });
});

/** Render one block as a page of its own */
const renderBlock = (
  resolver: EmbedResolver,
  key: string | undefined,
  text: string,
  target?: EmbedTarget,
) => resolver.renderPage(resolver.place(key, text, "news/a"), "news/a", target);

describe("EmbedResolver", () => {
  it("should render a page's blocks in order, sharing each embed's state and giving what it needs once", async () => {
    const { resolver } = setup();
    const page = [
      EMBED_PAGE_PARTS.head,
      resolver.place("example", "one", "news/a"),
      resolver.place("plain", "two", "news/a"),
      resolver.place("example", "<!--yaml\nsize: large\n-->\nthree", "news/b"),
      EMBED_PAGE_PARTS.foot,
    ].join("\n");
    expect(await resolver.renderPage(page, "/news/")).toBe(
      [
        "<style>/* 2: small,large */</style>",
        '<div class="embed embed-example"><figure class="small">one</figure></div>',
        '<div class="embed embed-plain">two</div>',
        '<div class="embed embed-example"><figure class="large">three</figure></div>',
        "<script>/* 2 */</script>",
      ].join("\n"),
    );
    // Another page starts again
    expect(
      await resolver.renderPage(
        `${resolver.place("example", "four", "news/c")}${EMBED_PAGE_PARTS.foot}`,
        "/news/c/",
      ),
    ).toBe(
      '<div class="embed embed-example"><figure class="small">four</figure></div><script>/* 1 */</script>',
    );
    // A page without embeds' head or foot tags needs nothing more
    expect(await resolver.renderPage("<p>Hi</p>", "/")).toBe("<p>Hi</p>");
    expect(
      await resolver.renderPage(
        EMBED_PAGE_PARTS.head + EMBED_PAGE_PARTS.foot,
        "/",
      ),
    ).toBe("");
  });

  it("should render escaped placeholders (e.g. in feeds) as escaped HTML, and leave others as they are", async () => {
    const { resolver } = setup();
    const placeholder = resolver.place("plain", "<b>hi</b>", "news/a");
    expect(
      await resolver.renderPage(
        placeholder.replace("<", "&lt;").replace(">", "&gt;"),
        "/feed.xml",
      ),
    ).toBe(
      "&lt;div class=&quot;embed embed-plain&quot;&gt;&lt;b&gt;hi&lt;/b&gt;&lt;/div&gt;",
    );
    // Placeholders this resolver didn't make are left as they are
    expect(await resolver.renderPage("<!--edaha-embed:99-->", "/")).toBe(
      "<!--edaha-embed:99-->",
    );
  });

  it("should render for the editor with the editor's renderers, falling back to the website's", async () => {
    const { resolver } = setup();
    expect(await renderBlock(resolver, "example", "hi", "editor")).toBe(
      '<div class="embed embed-example"><p>Editing hi</p></div>',
    );
    expect(await renderBlock(resolver, "plain", "hi", "editor")).toBe(
      '<div class="embed embed-plain">hi</div>',
    );
    // The editor's head falls back to the website's
    expect(
      await resolver.renderPage(
        resolver.place("example", "hi", "a") + EMBED_PAGE_PARTS.head,
        "a",
        "editor",
      ),
    ).toBe(
      '<div class="embed embed-example"><p>Editing hi</p></div><style>/* undefined: small */</style>',
    );
  });

  it("should warn and show blocks without a key or plugin, or that fail, as they are written", async () => {
    const { resolver, logger } = setup();
    expect(
      await renderBlock(resolver, undefined, "https://example.com/?a=1&b=2"),
    ).toBe(
      '<p class="embed-link"><a href="https://example.com/?a=1&amp;b=2">https://example.com/?a=1&amp;b=2</a></p>',
    );
    expect(await renderBlock(resolver, "unknown", "<b>text</b>")).toBe(
      '<pre class="embed-text">&lt;b&gt;text&lt;/b&gt;</pre>',
    );
    // Shown again (e.g. on a list page), it isn't warned about again
    await renderBlock(resolver, "unknown", "<b>text</b>");
    // A failed block adds nothing to the page
    expect(
      await resolver.renderPage(
        resolver.place("example", "broken", "news/a") + EMBED_PAGE_PARTS.foot,
        "news/a",
      ),
    ).toBe('<pre class="embed-text">broken</pre>');
    expect(logger.warn.mock.calls.map(([message]) => message)).toEqual([
      "news/a: embed blocks need a key, e.g. <!-- embed:youtube -->...<!-- /embed:youtube -->; shown as it is",
      'news/a: no embed plugin with the key "unknown"; shown as it is',
      "news/a: Example embed failed (broken); shown as it is",
    ]);
  });

  it("should replace embed blocks outside code with placeholders", async () => {
    const { resolver } = setup();
    const markdown = resolver.replaceBlocks(
      [
        "Intro",
        "<!-- embed:example -->one<!-- /embed:example -->",
        "<!-- embed:example -->",
        "  two",
        "  lines",
        "<!-- /embed -->",
        "<!-- embed:plain -->three<!-- /embed:plain -->",
        "`<!-- embed:example -->code<!-- /embed:example -->`",
      ].join("\n"),
      "news/a",
    );
    // Each block is a placeholder, as its own block, until the page is rendered
    expect(markdown.split("\n").filter(Boolean)).toEqual([
      "Intro",
      "<!--edaha-embed:0-->",
      "<!--edaha-embed:1-->",
      "<!--edaha-embed:2-->",
      "`<!-- embed:example -->code<!-- /embed:example -->`",
    ]);
    expect(markdown).toContain("\n\n<!--edaha-embed:0-->\n\n");
    const html = await resolver.renderPage(markdown, "/news/a/");
    expect(html).toContain(
      '<div class="embed embed-example"><figure class="small">one</figure></div>',
    );
    // Blank lines around the content are left out, but its indentation is kept
    expect(html).toContain(
      '<div class="embed embed-example"><figure class="small">  two\n  lines</figure></div>',
    );
    expect(html).toContain('<div class="embed embed-plain">three</div>');
    expect(resolver.replaceBlocks("No embeds", "news/b")).toBe("No embeds");
  });

  it("should validate content and options before rendering, leaving out blocks that aren't valid", async () => {
    const render = vi.fn(async (content: string) => `<b>${content}</b>`);
    const checked = {
      key: "checked",
      name: "Checked",
      options: {
        size: {
          $edahaField: { title: "Size", number: true },
          type: "number",
          maximum: 10,
        },
        credit: {
          type: "object",
          properties: { name: { type: "string", $edahaField: { text: true } } },
        },
        colour: { type: "string", $edahaField: { color: true } },
      },
      validate: async (content: string, options) => {
        if (content === "none") return false;
        if (content === "many")
          throw new AggregateError(
            [new Error("Too short"), new Error("No ID")],
            "Problems",
          );
        if (content === "odd") throw "Odd";
        if (content === "big" && options.size !== 1)
          throw new Error("Big needs size 1");
        if (content.length < 3) throw new Error("Too short");
        return true;
      },
      build: { render },
    } satisfies EmbedPlugin;
    const unchecked = {
      ...checked,
      key: "unchecked",
      validate: () => undefined,
    };
    const { resolver, logger } = setup([checked, unchecked, plain]);
    expect(await resolver.validate("checked", "valid")).toEqual([]);
    expect(await resolver.validate("checked", "ab")).toEqual(["Too short"]);
    expect(await resolver.validate("checked", "many")).toEqual([
      "Too short",
      "No ID",
    ]);
    expect(await resolver.validate("checked", "none")).toEqual([
      "The content isn't a valid Checked",
    ]);
    expect(await resolver.validate("checked", "odd")).toEqual(["Odd"]);
    // validate gets the options
    expect(await resolver.validate("checked", "big", { size: 1 })).toEqual([]);
    expect(await resolver.validate("checked", "big")).toEqual([
      "Big needs size 1",
    ]);
    // Options are checked against the embed's, in plain words, before its own validate
    expect(
      await resolver.validate("checked", "many", {
        size: 20,
        credit: { name: 3 },
        colour: 1,
        other: true,
      }),
    ).toEqual([
      "\"other\" isn't one of the embed's options",
      "Size must be at most 10",
      "credit name must be text",
      "colour must be text",
    ]);
    expect(await resolver.validate("plain", "x", { size: 1 })).toEqual([
      "\"size\" isn't one of the embed's options",
    ]);
    // An AggregateError without errors gives its own message
    expect(validationErrors(new AggregateError([], "All wrong"))).toEqual([
      "All wrong",
    ]);
    // Returning nothing is valid, and so is a plugin without validate
    expect(await resolver.validate("unchecked", "ab")).toEqual([]);
    expect(await resolver.validate("plain", "")).toEqual([]);
    expect(await resolver.validate("nope", "x")).toEqual([
      'No embed plugin with the key "nope"',
    ]);
    expect(await resolver.validate(undefined, "x")).toEqual([
      "Embed blocks need a key, e.g. <!-- embed:youtube -->...<!-- /embed:youtube -->",
    ]);
    // An empty key, as the editor sends for old blocks, is the same
    expect(await resolver.validate("", "x")).toEqual([
      "Embed blocks need a key, e.g. <!-- embed:youtube -->...<!-- /embed:youtube -->",
    ]);

    // Left out of the website, without being rendered
    expect(await renderBlock(resolver, "checked", "many")).toBe("");
    expect(
      await renderBlock(resolver, "checked", "<!--yaml\nsize: x\n-->\nvalid"),
    ).toBe("");
    expect(
      await renderBlock(resolver, "checked", "<!--yaml\n- 1\n-->\nvalid"),
    ).toBe("");
    expect(render).not.toHaveBeenCalled();
    expect(logger.warn.mock.calls.map(([message]) => message)).toEqual([
      "news/a: Checked embed isn't valid (Too short; No ID); left out",
      "news/a: Checked embed isn't valid (Size must be a number); left out",
      "news/a: Checked embed isn't valid (The options must be a map of names to values); left out",
    ]);
    expect(await renderBlock(resolver, "checked", "valid")).toBe(
      '<div class="embed embed-checked"><b>valid</b></div>',
    );
  });

  it("should keep embed HTML with blank lines whole through Markdown", async () => {
    const { resolver } = setup();
    const markdown = createMarkdown();
    const html = await resolver.renderPage(
      renderMarkdown(
        markdown,
        resolver.replaceBlocks(
          "Intro\n\n<!-- embed:plain -->\n<pre>a\n\n  *b*</pre>\n<!-- /embed:plain -->\n\nEnd",
          "news/a",
        ),
        "/",
      ),
      "/news/a/",
    );
    expect(html).toBe(
      '<p>Intro</p>\n<div class="embed embed-plain"><pre>a\n\n  *b*</pre></div>\n<p>End</p>\n',
    );
  });

  it("should leave out head and foot HTML that fails, with a warning", async () => {
    const failing = {
      ...plain,
      build: {
        ...plain.build,
        renderHead: async () => {
          throw new Error("offline");
        },
      },
    } satisfies EmbedPlugin;
    const { resolver, logger } = setup([failing]);
    expect(
      await resolver.renderPage(
        resolver.place("plain", "x", "news/a") + EMBED_PAGE_PARTS.head,
        "/news/",
      ),
    ).toBe('<div class="embed embed-plain">x</div>');
    expect(logger.warn).toHaveBeenCalledWith(
      "/news/: Plain embed's renderHead failed (offline); left out",
    );
  });
});

describe("htmlHeadings", () => {
  it("should list headings with IDs, with their level and plain text", () => {
    expect(
      htmlHeadings(
        [
          '<h1 id="intro">Intro</h1>',
          '<h2 class="x" id="fish-chips">Fish &amp; <em>chips</em></h2>',
          "<h3>No ID</h3>",
          '<H6 id="deep">Deep\nheading</H6>',
        ].join("\n"),
      ),
    ).toEqual([
      { level: 1, text: "Intro", id: "intro" },
      { level: 2, text: "Fish & chips", id: "fish-chips" },
      { level: 6, text: "Deep heading", id: "deep" },
    ]);
    expect(htmlHeadings("<p>None</p>")).toEqual([]);
  });
});

describe("EmbedResolver headings", () => {
  it("should give blocks their article's headings, and none to other blocks", async () => {
    const render = vi.fn(
      async (_content: string, _context: EmbedRenderContext) => "toc",
    );
    const { resolver } = setup([
      { key: "toc", name: "TOC", build: { render } },
    ]);
    const headings = [{ level: 2, text: "One", id: "one" }];
    const body = `<h2 id="one">One</h2>${resolver.place("toc", "", "news/a")}`;
    const other = resolver.place("toc", "", "news/b");
    resolver.setHeadings(body, headings);
    // Placeholders this resolver didn't make are skipped
    resolver.setHeadings("<!--edaha-embed:99-->", headings);
    await resolver.renderPage(body + other, "/news/");
    expect(render.mock.calls.map(([, context]) => context.headings)).toEqual([
      headings,
      [],
    ]);
  });
});

describe("cachedFetch", () => {
  it("should fetch each address once, giving each caller a copy, and try failed requests again", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(async () => new Response("body"));
    const fetchOnce = cachedFetch(fetcher as typeof globalThis.fetch);
    await expect(fetchOnce("https://a.com/")).rejects.toThrow("offline");
    const first = await fetchOnce("https://a.com/");
    const second = await fetchOnce(new URL("https://a.com/"));
    expect(await first.text()).toBe("body");
    expect(await second.text()).toBe("body");
    expect(fetcher).toHaveBeenCalledTimes(2);
    // Requests with settings, or Request objects, aren't cached
    await fetchOnce("https://a.com/", { method: "POST" });
    await fetchOnce(new Request("https://a.com/"));
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
