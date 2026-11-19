import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import bandcampDefault, { bandcamp } from "..";

const ALBUM_PAGE = readFileSync(
  new URL("./bandcamp-album-page.mock.html", import.meta.url),
  "utf8",
);

/** A fetch that answers with the given page */
const fetchPage = (body: string, status = 200) =>
  vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;

describe("bandcamp", () => {
  it("should match album and track pages on bandcamp.com subdomains", () => {
    expect(bandcampDefault).toBe(bandcamp);
    expect(
      bandcamp.match(new URL("https://artist.bandcamp.com/album/name")),
    ).toBe(true);
    expect(
      bandcamp.match(new URL("https://artist.bandcamp.com/track/name")),
    ).toBe(true);
    expect(bandcamp.match(new URL("https://artist.bandcamp.com/"))).toBe(false);
    expect(bandcamp.match(new URL("https://example.com/album/name"))).toBe(
      false,
    );
  });

  it("should fetch the page to find the album ID", async () => {
    const fetch = fetchPage(ALBUM_PAGE);
    const url = new URL("https://artist.bandcamp.com/album/name");
    const html = await bandcamp.render(url, { fetch });
    expect(fetch).toHaveBeenCalledWith(url);
    expect(html).toContain(
      'src="https://bandcamp.com/EmbeddedPlayer/album=1234567890/size=large/',
    );
    expect(html).toContain('height="470"');
  });

  it("should embed tracks with a shorter player", async () => {
    const html = await bandcamp.render(
      new URL("https://artist.bandcamp.com/track/name"),
      {
        fetch: fetchPage(
          '<meta property="og:video" content="https://bandcamp.com/EmbeddedPlayer/track=42/">',
        ),
      },
    );
    expect(html).toContain("EmbeddedPlayer/track=42/");
    expect(html).toContain('height="442"');
  });

  it("should throw when the page can't be fetched or has no player", async () => {
    const url = new URL("https://artist.bandcamp.com/album/name");
    await expect(
      bandcamp.render(url, { fetch: fetchPage("", 404) }),
    ).rejects.toThrow("failed with 404");
    await expect(
      bandcamp.render(url, { fetch: fetchPage("<html></html>") }),
    ).rejects.toThrow("No Bandcamp player");
  });
});
