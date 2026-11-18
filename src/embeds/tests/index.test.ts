import { describe, expect, it, vi } from "vitest";
import { EMBED_RENDERERS, EmbedResolver, type EmbedRenderer } from "..";

const fetch = vi.fn() as unknown as typeof globalThis.fetch;

/** A renderer that embeds example.com URLs, or fails for /broken */
const example: EmbedRenderer = {
  name: "Example",
  match: (url) => url.hostname === "example.com",
  render: vi.fn(async (url: URL) => {
    if (url.pathname === "/broken") throw new Error("broken");
    return `<iframe src="${url}"></iframe>`;
  }),
};

/** A resolver using the example renderer and a warning spy */
const setup = () => {
  const logger = { warn: vi.fn() };
  return {
    logger,
    resolver: new EmbedResolver({ fetch, logger, renderers: [example] }),
  };
};

describe("EmbedResolver", () => {
  it("should use the YouTube and Bandcamp renderers by default", async () => {
    expect(EMBED_RENDERERS.map((r) => r.name)).toEqual(["YouTube", "Bandcamp"]);
    const resolver = new EmbedResolver({ fetch, logger: { warn: vi.fn() } });
    expect(
      await resolver.render("https://youtu.be/aju_UB5VIf8", "a"),
    ).toContain('class="embed embed-youtube"');
  });

  it("should wrap rendered embeds and render each URL once", async () => {
    const { resolver } = setup();
    const first = await resolver.render("https://example.com/video", "a");
    const second = await resolver.render("https://example.com/video", "b");
    expect(first).toBe(
      '<div class="embed embed-example"><iframe src="https://example.com/video"></iframe></div>',
    );
    expect(second).toBe(first);
    expect(example.render).toHaveBeenCalledTimes(1);
  });

  it("should warn and render a link for unknown, invalid or failing URLs", async () => {
    const { resolver, logger } = setup();
    expect(
      await resolver.render("https://other.com/x?a=1&b=2", "article/a"),
    ).toBe(
      '<p class="embed-link"><a href="https://other.com/x?a=1&amp;b=2">https://other.com/x?a=1&amp;b=2</a></p>',
    );
    expect(await resolver.render("not a url", "article/a")).toContain(
      "not a url</a>",
    );
    expect(
      await resolver.render("https://example.com/broken", "article/a"),
    ).toContain('href="https://example.com/broken"');
    expect(logger.warn.mock.calls.map(([message]) => message)).toEqual([
      "article/a: no embed renderer for https://other.com/x?a=1&b=2; rendered as a link",
      'article/a: embed "not a url" is not a valid URL',
      "article/a: Example embed failed for https://example.com/broken (broken); rendered as a link",
    ]);
  });

  it("should replace embed blocks in markdown with HTML blocks", async () => {
    const { resolver } = setup();
    const markdown = await resolver.replaceBlocks(
      "Before <!-- embed --> https://example.com/a <!-- /embed -->after\n<!--embed-->https://example.com/b<!--/embed-->",
      "a",
    );
    expect(markdown).toBe(
      'Before \n\n<div class="embed embed-example"><iframe src="https://example.com/a"></iframe></div>\n\nafter\n\n\n<div class="embed embed-example"><iframe src="https://example.com/b"></iframe></div>\n\n',
    );
  });

  it("should leave embed blocks in code as they are", async () => {
    const { resolver } = setup();
    const code =
      "`<!-- embed -->https://example.com/a<!-- /embed -->`\n\n```md\n<!-- embed -->https://example.com/b<!-- /embed -->\n```\n";
    expect(await resolver.replaceBlocks(code, "a")).toBe(code);
  });

  it("should leave markdown without embeds unchanged", async () => {
    const { resolver } = setup();
    expect(await resolver.replaceBlocks("No embeds", "a")).toBe("No embeds");
  });
});
