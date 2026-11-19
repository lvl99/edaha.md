import { describe, expect, it } from "vitest";
import { isEmbedPlugin } from "@lvl99dotcom/edaha.md/embeds";
import mermaidjsDefault, { MERMAID_URL, mermaidjs } from "..";

describe("mermaidjs", () => {
  it("should be an embed plugin with the mermaidjs key, allowing scripts from jsDelivr", () => {
    expect(mermaidjsDefault).toBe(mermaidjs);
    expect(isEmbedPlugin(mermaidjs)).toBe(true);
    expect(mermaidjs.key).toBe("mermaidjs");
    expect(mermaidjs.sources.script).toEqual(["https://cdn.jsdelivr.net"]);
    expect(mermaidjs.editor.icon).toMatch(/^<svg /);
  });

  it("should keep the diagram's code in the page, escaped", async () => {
    expect(await mermaidjs.build.render("graph TD;\n  A-->B;")).toBe(
      '<pre class="mermaid">graph TD;\n  A--&gt;B;</pre>',
    );
  });

  it("should reject a diagram without code", async () => {
    await expect(mermaidjs.build.render("  ")).rejects.toThrow(
      "the diagram has no code",
    );
  });

  it("should load a pinned Mermaid from jsDelivr once per page, in the page's theme", async () => {
    expect(MERMAID_URL).toMatch(
      /^https:\/\/cdn\.jsdelivr\.net\/npm\/mermaid@\d+\.\d+\.\d+\/dist\/mermaid\.esm\.min\.mjs$/,
    );
    const foot = await mermaidjs.build.renderFoot();
    expect(foot).toContain(`import mermaid from "${MERMAID_URL}";`);
    expect(foot).toContain('theme: dark ? "dark" : "default"');
    expect(foot).toContain(
      'mermaid.run({ querySelector: ".embed-mermaidjs .mermaid" })',
    );
  });
});
