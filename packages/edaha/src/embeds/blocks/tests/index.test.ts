import { describe, expect, it } from "vitest";
import {
  EMBED_BLOCK,
  embedBlock,
  embedContent,
  embedOptionsOf,
  embedText,
  splitEmbed,
} from "..";

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

  it("should write options in YAML before the content", () => {
    const block = embedBlock("bandcamp", "https://a.bandcamp.com/album/b", {
      layout: "large",
      tracklist: true,
    });
    expect(block).toBe(
      "<!-- embed:bandcamp -->\n<!--yaml\nlayout: large\ntracklist: true\n-->\nhttps://a.bandcamp.com/album/b\n<!-- /embed:bandcamp -->",
    );
    // Read back as written
    expect(splitEmbed(blocks(block)[0]?.[1] as string)).toEqual({
      content: "https://a.bandcamp.com/album/b",
      options: { layout: "large", tracklist: true },
    });
  });
});

describe("embedText and embedOptionsOf", () => {
  it("should write what is between a block's tags, and read options from JSON", () => {
    expect(embedText("x")).toBe("x");
    expect(embedText("x", { a: 1 })).toBe("<!--yaml\na: 1\n-->\nx");
    expect(embedOptionsOf('{"a":1}')).toEqual({ a: 1 });
    for (const json of [null, "", "{", "[1]", "null", "3"])
      expect(embedOptionsOf(json)).toEqual({});
  });
});

describe("splitEmbed", () => {
  it("should read a block's options in YAML or JSON, and its content", () => {
    expect(splitEmbed("\nhttps://youtu.be/x\n")).toEqual({
      content: "https://youtu.be/x",
      options: {},
    });
    expect(splitEmbed('<!--json\n{ "a": 1 }\n-->x')).toEqual({
      content: "x",
      options: { a: 1 },
    });
    // Empty options are none
    expect(splitEmbed("<!--yml\n-->\nx")).toEqual({
      content: "x",
      options: {},
    });
    expect(splitEmbed("<!--json\n\n-->\nx")).toEqual({
      content: "x",
      options: {},
    });
  });

  it("should say why options can't be read", () => {
    expect(splitEmbed("<!--json\n{ a\n-->\nx")).toMatchObject({
      content: "x",
      options: {},
      optionsError: expect.stringContaining("The options can't be read:"),
    });
    expect(splitEmbed("<!--yaml\n- a\n-->\nx")).toEqual({
      content: "x",
      options: {},
      optionsError: "The options must be a map of names to values",
    });
  });
});
