// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

describe("main", () => {
  it("should define the editor's elements", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]"));
    await import("../main");
    for (const tag of [
      "blog-editor",
      "blog-article",
      "blog-article-data-field",
      "blog-article-data-group",
      "blog-richtext",
    ])
      expect(customElements.get(tag), tag).toBeDefined();
  });
});
