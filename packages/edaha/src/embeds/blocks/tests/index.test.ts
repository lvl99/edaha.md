import { describe, expect, it } from "vitest";
import { EMBED_BLOCK, embedBlock, embedContent } from "..";

/** The key and content of every embed block in a text */
const blocks = (text: string) =>
  [...text.matchAll(EMBED_BLOCK)].map(([, key, content]) => [key, content]);

describe("EMBED_BLOCK", () => {
  it("should find keyed blocks, closed with or without their key, and old blocks without one", () => {
    expect(
      blocks(
        "<!-- embed:youtube -->a<!-- /embed:youtube --> <!--embed:my-embed-->\nb\n<!--/embed--> <!-- embed -->c<!-- /embed -->",
      ),
    ).toEqual([
      ["youtube", "a"],
      ["my-embed", "\nb\n"],
      [undefined, "c"],
    ]);
  });

  it("should not close a block with another embed's key, or read keys that aren't kebab-case", () => {
    expect(blocks("<!-- embed:a -->x<!-- /embed:b -->")).toEqual([]);
    expect(blocks("<!-- embed:A -->x<!-- /embed:A -->")).toEqual([]);
  });
});

describe("embedContent", () => {
  it("should leave out blank lines around the content, keeping its first line's indentation", () => {
    expect(embedContent("\n  \n  graph TD;\n  A-->B;\n\n")).toBe(
      "  graph TD;\n  A-->B;",
    );
    expect(embedContent("\r\nhttps://youtu.be/x  ")).toBe("https://youtu.be/x");
  });
});

describe("embedBlock", () => {
  it("should write single-line content on one line, and other content between tags on their own lines", () => {
    expect(embedBlock("youtube", "https://youtu.be/x")).toBe(
      "<!-- embed:youtube -->https://youtu.be/x<!-- /embed:youtube -->",
    );
    expect(embedBlock("mermaidjs", "graph TD;\n  A-->B;")).toBe(
      "<!-- embed:mermaidjs -->\ngraph TD;\n  A-->B;\n<!-- /embed:mermaidjs -->",
    );
  });
});
