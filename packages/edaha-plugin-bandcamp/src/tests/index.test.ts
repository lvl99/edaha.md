import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { checkEmbedPlugins, isEmbedPlugin } from "@lvl99dotcom/edaha.md/embeds";
import { resolveFields } from "@lvl99dotcom/edaha.md/generator/fields";
import bandcampDefault, {
  BANDCAMP_OPTIONS,
  bandcamp,
  playerSize,
  playerUrl,
} from "..";

/** The player's options with their defaults (and without hidden ones), as they are given to render */
const options = (set: Record<string, unknown> = {}) =>
  resolveFields(BANDCAMP_OPTIONS, set).values;

const ALBUM_PAGE = readFileSync(
  new URL("./bandcamp-album-page.mock.html", import.meta.url),
  "utf8",
);

/** A fetch that answers with the given page */
const fetchPage = (body: string, status = 200) =>
  vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;

describe("bandcamp", () => {
  it("should be an embed plugin with the bandcamp key, allowing bandcamp.com frames", () => {
    expect(bandcampDefault).toBe(bandcamp);
    expect(isEmbedPlugin(bandcamp)).toBe(true);
    // Its options are fields like article metadata's
    expect(checkEmbedPlugins([bandcamp])).toEqual([bandcamp]);
    expect(bandcamp.info).toContain("Paste the URL");
    expect(bandcamp.key).toBe("bandcamp");
    expect(bandcamp.sources.frame).toEqual(["https://bandcamp.com"]);
    expect(bandcamp.editor.icon).toMatch(/^<svg /);
  });

  it("should only accept album and track page URLs, saying what is wrong", () => {
    expect(bandcamp.validate("https://artist.bandcamp.com/track/name")).toBe(
      true,
    );
    expect(() => bandcamp.validate("artist")).toThrow(
      '"artist" is not a URL; paste a Bandcamp album or track page\'s URL',
    );
    expect(() => bandcamp.validate("https://artist.bandcamp.com/")).toThrow(
      "https://artist.bandcamp.com/ is not a Bandcamp album or track page",
    );
  });

  it("should only embed album and track pages on bandcamp.com subdomains", async () => {
    const fetch = fetchPage(ALBUM_PAGE);
    for (const url of [
      "https://artist.bandcamp.com/",
      "https://example.com/album/name",
    ])
      await expect(
        bandcamp.build.render(url, { fetch, state: {}, options: {} }),
      ).rejects.toThrow("is not a Bandcamp album or track page");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should fetch the page to find the album ID, embedding the large player by default", async () => {
    const fetch = fetchPage(ALBUM_PAGE);
    const url = "https://artist.bandcamp.com/album/name";
    const html = await bandcamp.build.render(url, {
      fetch,
      state: {},
      options: options(),
    });
    expect(fetch).toHaveBeenCalledWith(new URL(url));
    expect(html).toBe(
      '<iframe width="350" height="470" src="https://bandcamp.com/EmbeddedPlayer/album=1234567890/size=large/bgcol=ffffff/linkcol=0687f5/tracklist=false/transparent=true/" title="Bandcamp player" loading="lazy" seamless></iframe>',
    );
    // The tracklist has a row for each of the album's tracks
    expect(
      await bandcamp.build.render(url, {
        fetch,
        state: {},
        options: options({ tracklist: true, linkcol: "#051C2C" }),
      }),
    ).toBe(
      '<iframe width="350" height="555" src="https://bandcamp.com/EmbeddedPlayer/album=1234567890/size=large/bgcol=ffffff/linkcol=051c2c/transparent=true/" title="Bandcamp player" loading="lazy" seamless></iframe>',
    );
  });

  it("should show each option only where Bandcamp's layouts use it", () => {
    expect(options()).toEqual({
      layout: "large",
      size: "large",
      tracklist: false,
      transparent: true,
      bgcol: "ffffff",
      linkcol: "0687f5",
    });
    expect(options({ layout: "slim", size: "small", tracklist: true })).toEqual(
      { layout: "slim", transparent: true, bgcol: "ffffff", linkcol: "0687f5" },
    );
    expect(options({ layout: "artwork-only", artwork: "none" })).toEqual({
      layout: "artwork-only",
      transparent: true,
      bgcol: "ffffff",
      linkcol: "0687f5",
    });
    // Without artwork, its size doesn't apply
    expect(options({ artwork: "none", size: "small" })).toEqual({
      layout: "large",
      artwork: "none",
      tracklist: false,
      transparent: true,
      bgcol: "ffffff",
      linkcol: "0687f5",
    });
  });

  it("should give each layout Bandcamp's player URL and size", () => {
    const url = (set: Record<string, unknown>) =>
      playerUrl("album", "1", options(set)).replace(
        "https://bandcamp.com/EmbeddedPlayer/album=1/",
        "",
      );
    expect(url({ layout: "slim" })).toBe(
      "size=small/bgcol=ffffff/linkcol=0687f5/transparent=true/",
    );
    expect(url({ layout: "slim", artwork: "none", transparent: false })).toBe(
      "size=small/bgcol=ffffff/linkcol=0687f5/artwork=none/transparent=false/",
    );
    expect(url({ layout: "artwork-only" })).toBe(
      "size=large/bgcol=ffffff/linkcol=0687f5/minimal=true/transparent=true/",
    );
    expect(url({ size: "small", tracklist: true })).toBe(
      "size=large/bgcol=ffffff/linkcol=0687f5/artwork=small/transparent=true/",
    );
    const size = (
      kind: string,
      set: Record<string, unknown>,
      tracks?: number,
    ) => Object.values(playerSize(kind, options(set), tracks)).join("x");
    expect(size("album", { layout: "slim" })).toBe("100%x42");
    expect(size("album", { layout: "artwork-only" })).toBe("350x350");
    expect(size("album", {})).toBe("350x470");
    expect(size("track", {})).toBe("350x442");
    // Without a track count, an album is taken to have three
    expect(size("album", { tracklist: true })).toBe("350x588");
    expect(size("album", { tracklist: true }, 1)).toBe("350x522");
    // Tracks have no tracklist
    expect(size("track", { tracklist: true })).toBe("350x442");
    expect(size("album", { size: "small" })).toBe("100%x120");
    expect(size("album", { size: "small", tracklist: true }, 1)).toBe(
      "400x208",
    );
    expect(size("album", { artwork: "none", tracklist: true }, 1)).toBe(
      "350x208",
    );
  });

  it("should embed tracks with a shorter player", async () => {
    const html = await bandcamp.build.render(
      "https://artist.bandcamp.com/track/name",
      {
        fetch: fetchPage(
          '<meta property="og:video" content="https://bandcamp.com/EmbeddedPlayer/track=42/">',
        ),
        state: {},
        options: options(),
      },
    );
    expect(html).toContain("EmbeddedPlayer/track=42/");
    expect(html).toContain('height="442"');
  });

  it("should throw when the page can't be fetched or has no player", async () => {
    const url = "https://artist.bandcamp.com/album/name";
    await expect(
      bandcamp.build.render(url, {
        fetch: fetchPage("", 404),
        state: {},
        options: {},
      }),
    ).rejects.toThrow("failed with 404");
    await expect(
      bandcamp.build.render(url, {
        fetch: fetchPage("<html></html>"),
        state: {},
        options: {},
      }),
    ).rejects.toThrow("No Bandcamp player");
  });
});
