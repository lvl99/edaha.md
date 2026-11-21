import { describe, expect, it } from "vitest";
import {
  isEmbedPlugin,
  type EmbedHeading,
  type EmbedRenderContext,
} from "@lvl99dotcom/edaha.md/embeds";
import tocDefault, {
  alphaNumber,
  DEFAULT_LIST_STYLES,
  LIST_STYLES,
  romanNumber,
  toc,
  tocList,
  tocMarker,
  tocTree,
  type TocItem,
} from "..";

/** A heading of a level, its ID made from its text */
const h = (level: number, text: string): EmbedHeading => ({
  level,
  text,
  id: text.toLowerCase().replace(/\W+/g, "-"),
});

/** A tree's markers and texts, nested, e.g. ["1. A", ["1.1. B"]] */
const outline = (items: TocItem[]): unknown[] =>
  items.flatMap(({ marker, heading, children }) => [
    `${marker} ${heading.text}`,
    ...(children.length ? [outline(children)] : []),
  ]);

/** What a block's render gets, with headings and options */
const context = (
  headings: EmbedHeading[],
  options: Record<string, unknown> = {},
): EmbedRenderContext => ({
  fetch,
  state: {},
  options,
  headings,
});

describe("toc", () => {
  it("should be an embed plugin with the toc key, whose content is optional", () => {
    expect(tocDefault).toBe(toc);
    expect(isEmbedPlugin(toc)).toBe(true);
    expect(toc.key).toBe("toc");
    expect(toc.contentOptional).toBe(true);
    expect(toc.editor.icon).toMatch(/^<svg /);
  });

  it("should have a list style option for each heading level, with its default", () => {
    expect(Object.keys(toc.options)).toEqual([
      "level1",
      "level2",
      "level3",
      "level4",
      "level5",
      "level6",
    ]);
    expect(
      Object.values(toc.options).map(
        (schema) => schema.$edahaField?.defaultValue,
      ),
    ).toEqual([
      "number",
      "number-depth",
      "number-depth",
      "alpha",
      "number-roman",
      "circle",
    ]);
    expect(toc.options.level1?.enum).toEqual(Object.keys(LIST_STYLES));
  });
});

describe("alphaNumber and romanNumber", () => {
  it("should write numbers in letters, going on after z", () => {
    expect([1, 2, 26, 27, 28, 52, 703].map(alphaNumber)).toEqual([
      "a",
      "b",
      "z",
      "aa",
      "ab",
      "az",
      "aaa",
    ]);
  });

  it("should write numbers in lowercase roman numerals", () => {
    expect([1, 3, 4, 9, 14, 40, 90, 400, 1994].map(romanNumber)).toEqual([
      "i",
      "iii",
      "iv",
      "ix",
      "xiv",
      "xl",
      "xc",
      "cd",
      "mcmxciv",
    ]);
  });
});

describe("tocMarker", () => {
  it("should mark each list style, adding its parents' markers for number-depth", () => {
    expect(tocMarker("number", 3, "b")).toEqual({
      marker: "3.",
      bullet: false,
      prefix: "3",
    });
    expect(tocMarker("alpha", 3, "")).toMatchObject({ marker: "c." });
    expect(tocMarker("number-roman", 3, "")).toMatchObject({ marker: "iii." });
    expect(tocMarker("number-depth", 3, "b.1")).toEqual({
      marker: "b.1.3.",
      bullet: false,
      prefix: "b.1.3",
    });
    // Without a parent, it is a number
    expect(tocMarker("number-depth", 3, "")).toMatchObject({ marker: "3." });
  });

  it("should mark bullets as decoration, passing on their parent's prefix", () => {
    expect(
      (["circle", "disc", "square", "diamond"] as const).map((style) =>
        tocMarker(style, 2, "b"),
      ),
    ).toEqual(
      ["∙", "◦", "▪", "⬩"].map((marker) => ({
        marker,
        bullet: true,
        prefix: "b",
      })),
    );
  });
});

describe("tocTree", () => {
  it("should nest headings by level, marked in their level's list style", () => {
    const headings = [
      h(1, "A"),
      h(2, "B"),
      h(3, "C"),
      h(4, "D"),
      h(5, "E"),
      h(6, "F"),
      h(6, "G"),
      h(5, "H"),
      h(3, "I"),
      h(2, "J"),
      h(1, "K"),
    ];
    expect(outline(tocTree(headings, DEFAULT_LIST_STYLES))).toEqual([
      "1. A",
      [
        "1.1. B",
        ["1.1.1. C", ["a. D", ["i. E", ["∙ F", "∙ G"], "ii. H"]], "1.1.2. I"],
        "1.2. J",
      ],
      "2. K",
    ]);
  });

  it("should nest a skipped level straight under the nearest higher heading, and add parents' own markers", () => {
    const styles = [...DEFAULT_LIST_STYLES];
    styles[1] = "alpha";
    styles[5] = "number-depth";
    expect(
      outline(
        tocTree(
          [h(2, "A"), h(2, "B"), h(4, "C"), h(6, "D"), h(3, "E"), h(1, "F")],
          styles,
        ),
      ),
    ).toEqual(["a. A", "b. B", ["a. C", ["a.1. D"], "b.2. E"], "3. F"]);
  });

  it("should pass number-depth markers through bullets, and use numbers for levels without a style", () => {
    expect(
      outline(
        tocTree(
          [h(1, "A"), h(2, "B"), h(3, "C")],
          ["number", "circle", "number-depth"],
        ),
      ),
    ).toEqual(["1. A", ["∙ B", ["1.1. C"]]]);
    expect(outline(tocTree([h(2, "A")], []))).toEqual(["1. A"]);
    expect(tocTree([], DEFAULT_LIST_STYLES)).toEqual([]);
  });
});

describe("tocList", () => {
  it("should link to each heading in nested lists, hiding bullets from screen readers", () => {
    expect(
      tocList(
        tocTree(
          [h(2, "Fish & chips"), { level: 6, text: "<b>", id: 'a"b' }],
          DEFAULT_LIST_STYLES,
        ),
      ),
    ).toBe(
      '<ol role="list"><li><span class="toc-marker">1.</span> <a href="#fish-chips">Fish &amp; chips</a><ol role="list"><li><span class="toc-marker" aria-hidden="true">∙</span> <a href="#a&quot;b">&lt;b&gt;</a></li></ol></li></ol>',
    );
    expect(tocList([])).toBe("");
  });
});

describe("toc.build", () => {
  it("should render the table of contents in a nav, with its options", async () => {
    expect(
      await toc.build.render(
        "",
        context([h(2, "A"), h(3, "B")], { level2: "number", level3: "alpha" }),
      ),
    ).toBe(
      '<nav aria-label="Table of contents"><ol role="list"><li><span class="toc-marker">1.</span> <a href="#a">A</a><ol role="list"><li><span class="toc-marker">a.</span> <a href="#b">B</a></li></ol></li></ol></nav>',
    );
  });

  it("should use the default list styles for options not given", async () => {
    expect(
      await toc.build.render("", context([h(2, "A"), h(3, "B")])),
    ).toContain('<span class="toc-marker">1.1.</span> <a href="#b">B</a>');
  });

  it("should show the block's Markdown above the list, and only that without headings", async () => {
    expect(await toc.build.render("## Contents", context([h(2, "A")]))).toMatch(
      /^<h2 id="contents">Contents<\/h2>\n<nav /,
    );
    expect(await toc.build.render("  \n", context([]))).toBe("");
    expect(await toc.build.render("*Contents*", context([]))).toBe(
      "<p><em>Contents</em></p>\n",
    );
  });

  it("should style its lists once per page", async () => {
    const head = await toc.build.renderHead();
    expect(head).toMatch(/^<style>/);
    expect(head).toContain(".embed-toc ol { list-style: none;");
  });

  it("should show a note in the editor's frames, which don't show the article", async () => {
    expect(await toc.editor.render("Contents")).toBe(
      "<p>Contents</p>\n<p><em>Table of contents: the article's headings are listed here on the website.</em></p>",
    );
  });
});
