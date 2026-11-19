import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  checkEmbedPlugins,
  EmbedResolver,
  isEmbedPlugin,
  loadPlugins,
  type EmbedPlugin,
  type EmbedUsage,
} from "..";

const fetch = vi.fn() as unknown as typeof globalThis.fetch;

/** An embed that wraps its content, fails for "broken", and needs a script once per page */
const example = {
  key: "example",
  name: "Example",
  build: {
    render: vi.fn(async (content: string, { renders }) => {
      if (content === "broken") throw new Error("broken");
      renders.push(content.length);
      return `<figure>${content}</figure>`;
    }),
    renderHead: async ({ renders }) =>
      `<style>/* ${renders.join(",")} */</style>`,
    renderFoot: async ({ renders }) =>
      `<script>/* ${renders.join(",")} */</script>`,
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

describe("EmbedResolver", () => {
  it("should wrap rendered embeds, render each block once, and give what it needs once per page", async () => {
    const { resolver } = setup();
    const first = await resolver.render("example", "hello", "a");
    const second = await resolver.render("example", "hello", "b");
    expect(first).toEqual({
      html: '<div class="embed embed-example"><figure>hello</figure></div>',
      usage: { key: "example", renders: [5] },
    });
    expect(second).toBe(first);
    expect(example.build.render).toHaveBeenCalledTimes(1);
  });

  it("should render for the editor with the editor's renderers, falling back to the website's", async () => {
    const { resolver } = setup();
    expect((await resolver.render("example", "hi", "a", "editor")).html).toBe(
      '<div class="embed embed-example"><p>Editing hi</p></div>',
    );
    expect((await resolver.render("plain", "hi", "a", "editor")).html).toBe(
      '<div class="embed embed-plain">hi</div>',
    );
    // The editor's head falls back to the website's
    expect(
      await resolver.pageParts([new Map([["example", [1]]])], "a", "editor"),
    ).toEqual({
      head: "<style>/* 1 */</style>",
      foot: "<script>/* 1 */</script>",
    });
  });

  it("should warn and show blocks without a key or plugin, or that fail, as they are written", async () => {
    const { resolver, logger } = setup();
    expect(
      await resolver.render(
        undefined,
        "https://example.com/?a=1&b=2",
        "news/a",
      ),
    ).toEqual({
      html: '<p class="embed-link"><a href="https://example.com/?a=1&amp;b=2">https://example.com/?a=1&amp;b=2</a></p>',
    });
    expect(await resolver.render("unknown", "<b>text</b>", "news/a")).toEqual({
      html: '<pre class="embed-text">&lt;b&gt;text&lt;/b&gt;</pre>',
    });
    expect((await resolver.render("example", "broken", "news/a")).html).toBe(
      '<pre class="embed-text">broken</pre>',
    );
    expect(logger.warn.mock.calls.map(([message]) => message)).toEqual([
      "news/a: embed blocks need a key, e.g. <!-- embed:youtube -->...<!-- /embed:youtube -->; shown as it is",
      'news/a: no embed plugin with the key "unknown"; shown as it is',
      "news/a: Example embed failed (broken); shown as it is",
    ]);
  });

  it("should replace embed blocks outside code, recording the embeds used", async () => {
    const { resolver } = setup();
    const usage: EmbedUsage = new Map();
    const markdown = await resolver.replaceBlocks(
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
      usage,
    );
    expect(markdown).toContain(
      '\n\n<div class="embed embed-example"><figure>one</figure></div>\n\n',
    );
    // Blank lines around the content are left out, but its indentation is kept
    expect(markdown).toContain(
      '<div class="embed embed-example"><figure>  two\n  lines</figure></div>',
    );
    expect(markdown).toContain('<div class="embed embed-plain">three</div>');
    expect(markdown).toContain(
      "`<!-- embed:example -->code<!-- /embed:example -->`",
    );
    expect([...usage]).toEqual([
      ["example", [3, 13]],
      ["plain", []],
    ]);
    // Without a usage map, it isn't recorded
    expect(await resolver.replaceBlocks("No embeds", "news/b")).toBe(
      "No embeds",
    );
  });

  it("should give a page's head and foot HTML once for each embed it uses, in the plugins' order", async () => {
    const { resolver } = setup();
    const parts = await resolver.pageParts(
      [
        new Map([
          ["plain", []],
          ["example", [1]],
        ]),
        new Map([["example", [2, 3]]]),
      ],
      "/news/",
    );
    expect(parts).toEqual({
      head: "<style>/* 1,2,3 */</style>",
      foot: "<script>/* 1,2,3 */</script>",
    });
    expect(await resolver.pageParts([], "/")).toEqual({ head: "", foot: "" });
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
      await resolver.pageParts([new Map([["plain", []]])], "/news/"),
    ).toEqual({ head: "", foot: "" });
    expect(logger.warn).toHaveBeenCalledWith(
      "/news/: Plain embed's renderHead failed (offline); left out",
    );
  });
});
