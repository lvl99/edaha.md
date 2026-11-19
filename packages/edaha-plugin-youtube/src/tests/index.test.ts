import { describe, expect, it } from "vitest";
import { isEmbedPlugin } from "@lvl99dotcom/edaha.md/embeds";
import youtubeDefault, { extractYouTubeId, youtube } from "..";

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
  it("should be an embed plugin with the youtube key, allowing youtube-nocookie.com frames", () => {
    expect(youtubeDefault).toBe(youtube);
    expect(isEmbedPlugin(youtube)).toBe(true);
    expect(youtube.key).toBe("youtube");
    expect(youtube.sources.frame).toEqual(["https://www.youtube-nocookie.com"]);
    expect(youtube.editor.icon).toMatch(/^<svg /);
  });

  it("should always embed from youtube-nocookie.com", async () => {
    const html = await youtube.build.render(
      "https://www.youtube.com/watch?v=aju_UB5VIf8",
    );
    expect(html).toContain(
      'src="https://www.youtube-nocookie.com/embed/aju_UB5VIf8"',
    );
    expect(html).toMatch(/^<iframe .*><\/iframe>$/);
    expect(html).not.toContain("www.youtube.com");
  });

  it("should throw for anything but a YouTube video URL", async () => {
    await expect(youtube.build.render("not a url")).rejects.toThrow(
      "Invalid URL",
    );
    await expect(
      youtube.build.render("https://example.com/watch?v=aju_UB5VIf8"),
    ).rejects.toThrow("is not a YouTube URL");
    await expect(
      youtube.build.render("https://www.youtube.com/@channel"),
    ).rejects.toThrow("No YouTube video ID");
  });
});
