import { describe, expect, it } from "vitest";
import youtubeDefault, { extractYouTubeId, youtube } from "..";

const context = { fetch: () => Promise.reject(new Error("no fetch")) };

describe("extractYouTubeId", () => {
  it("should find the ID in every form of YouTube URL", () => {
    for (const url of [
      "https://youtu.be/aju_UB5VIf8",
      "https://www.youtube.com/watch?v=aju_UB5VIf8&t=10",
      "https://youtube.com/embed/aju_UB5VIf8",
      "https://m.youtube.com/shorts/aju_UB5VIf8",
      "https://www.youtube.com/live/aju_UB5VIf8",
      "https://www.youtube-nocookie.com/embed/aju_UB5VIf8",
    ])
      expect(extractYouTubeId(new URL(url))).toBe("aju_UB5VIf8");
  });

  it("should throw when there is no valid ID", () => {
    for (const url of [
      "https://www.youtube.com/",
      "https://www.youtube.com/watch",
      "https://www.youtube.com/@channel",
      "https://youtu.be/short",
    ])
      expect(() => extractYouTubeId(new URL(url))).toThrow(
        "No YouTube video ID",
      );
  });
});

describe("youtube", () => {
  it("should match YouTube hosts only", () => {
    expect(youtubeDefault).toBe(youtube);
    expect(youtube.match(new URL("https://youtu.be/x"))).toBe(true);
    expect(youtube.match(new URL("https://www.youtube.com/watch?v=x"))).toBe(
      true,
    );
    expect(youtube.match(new URL("https://example.com/youtube"))).toBe(false);
  });

  it("should always embed from youtube-nocookie.com", async () => {
    const html = await youtube.render(
      new URL("https://www.youtube.com/watch?v=aju_UB5VIf8"),
      context,
    );
    expect(html).toContain(
      'src="https://www.youtube-nocookie.com/embed/aju_UB5VIf8"',
    );
    expect(html).toMatch(/^<iframe .*><\/iframe>$/);
    expect(html).not.toContain("www.youtube.com");
  });
});
