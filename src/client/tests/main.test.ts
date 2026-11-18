// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

describe("main", () => {
  it("should define the editor's elements", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]"));
    await import("../main");
    for (const tag of [
      "edaha-editor",
      "edaha-article",
      "edaha-article-data-field",
      "edaha-article-data-group",
      "edaha-richtext",
    ])
      expect(customElements.get(tag), tag).toBeDefined();
  });
});
