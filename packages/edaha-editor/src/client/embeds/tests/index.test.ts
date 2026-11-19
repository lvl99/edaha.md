// @vitest-environment jsdom
import { render } from "lit";
import { describe, expect, it } from "vitest";
import { embedIcon, embedName } from "..";

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
