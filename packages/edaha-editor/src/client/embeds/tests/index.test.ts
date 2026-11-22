// @vitest-environment jsdom
import { render } from "lit";
import { describe, expect, it } from "vitest";
import { embedIcon, embedName, previewAddress } from "..";

const EMBEDS = [{ key: "youtube", name: "YouTube video", icon: "<svg></svg>" }];

describe("embedName", () => {
  it("should name an embed by its plugin, or say it has none", () => {
    expect(embedName(EMBEDS, "youtube")).toBe("YouTube video");
    expect(embedName(EMBEDS, "vimeo")).toBe('Unknown embed "vimeo"');
    expect(embedName(EMBEDS, "")).toBe("Embed without a kind");
  });
});

describe("embedIcon", () => {
  it("should render a plugin's icon hidden from screen readers, or nothing", () => {
    const container = document.createElement("div");
    render(embedIcon(EMBEDS[0]), container);
    const icon = container.querySelector(".embed-icon")!;
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(icon.querySelector("svg")).not.toBeNull();
    expect(embedIcon(undefined)).toBe("");
    expect(embedIcon({ key: "a", name: "A" })).toBe("");
  });
});

describe("previewAddress", () => {
  it("should show previews from the previews' own origin on the editor's server", () => {
    const editor = { href: "http://127.0.0.1:5180/#news/hello" };
    expect(previewAddress("/preview/1/", editor)).toBe(
      "http://localhost:5180/preview/1/",
    );
    // Not loaded yet, or elsewhere (e.g. tests), it is kept as it is
    expect(previewAddress("", editor)).toBe("");
    expect(previewAddress("/preview/1/")).toBe("/preview/1/");
  });

  it("should show previews from the editor server given in full, from any page", () => {
    expect(previewAddress("http://127.0.0.1:5193/preview/1/?theme=dark")).toBe(
      "http://localhost:5193/preview/1/?theme=dark",
    );
    expect(previewAddress("https://example.com/frame/")).toBe(
      "https://example.com/frame/",
    );
  });
});
