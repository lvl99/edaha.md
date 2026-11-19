import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { isEmbedPlugin } from "@lvl99dotcom/edaha.md/embeds";
import bandcampDefault, { bandcamp } from "..";

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
        bandcamp.build.render(url, { fetch, renders: [] }),
      ).rejects.toThrow("is not a Bandcamp album or track page");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should fetch the page to find the album ID", async () => {
    const fetch = fetchPage(ALBUM_PAGE);
    const url = "https://artist.bandcamp.com/album/name";
    const html = await bandcamp.build.render(url, { fetch, renders: [] });
    expect(fetch).toHaveBeenCalledWith(new URL(url));
    expect(html).toContain(
      'src="https://bandcamp.com/EmbeddedPlayer/album=1234567890/size=large/',
    );
    expect(html).toContain('height="470"');
  });

  it("should embed tracks with a shorter player", async () => {
    const html = await bandcamp.build.render(
      "https://artist.bandcamp.com/track/name",
      {
        fetch: fetchPage(
          '<meta property="og:video" content="https://bandcamp.com/EmbeddedPlayer/track=42/">',
        ),
        renders: [],
      },
    );
    expect(html).toContain("EmbeddedPlayer/track=42/");
    expect(html).toContain('height="442"');
  });

  it("should throw when the page can't be fetched or has no player", async () => {
    const url = "https://artist.bandcamp.com/album/name";
    await expect(
      bandcamp.build.render(url, { fetch: fetchPage("", 404), renders: [] }),
    ).rejects.toThrow("failed with 404");
    await expect(
      bandcamp.build.render(url, {
        fetch: fetchPage("<html></html>"),
        renders: [],
      }),
    ).rejects.toThrow("No Bandcamp player");
  });
});
