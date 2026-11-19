import { describe, expect, it } from "vitest";
import { editorHtmlToMarkdown, filesUrl, markdownToEditorHtml } from "..";

const BASE = filesUrl("article", "hello");

describe("filesUrl", () => {
  it("should point at the editor's file route", () => {
    expect(BASE).toBe("/files/article/hello/");
  });
});

describe("markdownToEditorHtml", () => {
  it("should turn shortcodes into editor blocks and resolve relative URLs", () => {
    expect(
      markdownToEditorHtml(
        'Intro "quoted" ![pic](a.png) <!-- readmore -->Rest\n\n<!-- embed:youtube --> https://youtu.be/x?a=1&b=2 <!-- /embed:youtube -->\n\n<!-- embed:mermaidjs -->\ngraph TD;\n\n  A-->B;\n<!-- /embed:mermaidjs -->\n\n<!-- embed -->old<!-- /embed -->',
        BASE,
      ),
    ).toBe(
      '<p>Intro &quot;quoted&quot; <img src="/files/article/hello/a.png" alt="pic"></p>\n<hr class="readmore">\n<p>Rest</p>\n<div class="embed" data-embed="youtube" data-content=" https://youtu.be/x?a=1&amp;b=2"></div>\n<div class="embed" data-embed="mermaidjs" data-content="graph TD;&#10;&#10;  A--&gt;B;"></div>\n<div class="embed" data-embed="" data-content="old"></div>\n',
    );
  });
});

describe("embed blocks without settings", () => {
  it("should keep embed blocks without a key or content as old, empty blocks, and leave out other empty elements", () => {
    expect(
      editorHtmlToMarkdown(
        '<p>a<span></span>b</p><div class="embed"></div>',
        BASE,
      ),
    ).toBe("ab\n\n<!-- embed --><!-- /embed -->");
  });
});

describe("raw blocks in the editor", () => {
  it("should turn raw blocks into editor HTML holding their content as it is, and back", () => {
    const source =
      "A <!-- raw -->*a*  <b><!-- /raw --> b\n\n<!-- raw -->\n```\n<!-- readmore -->\n\n  # c\n<!-- /raw -->\n\nEnd";
    const html = markdownToEditorHtml(source, BASE);
    expect(html).toContain('<span class="raw">*a*\u00a0\u00a0&lt;b&gt;</span>');
    expect(html).toContain(
      '<pre class="raw">&#96;&#96;&#96;&#10;&#60;&#33;&#45;&#45; readmore',
    );
    expect(html).not.toContain('class="readmore"');
    expect(editorHtmlToMarkdown(html, BASE)).toBe(source);
  });
});

describe("markdownToEditorHtml in code", () => {
  it("should leave shortcodes in code as they are", () => {
    const html = markdownToEditorHtml(
      "`<!-- readmore -->`\n\n```md\n<!-- embed:youtube -->https://youtu.be/x<!-- /embed:youtube -->\n```",
      BASE,
    );
    expect(html).not.toContain('class="readmore"');
    expect(html).not.toContain('class="embed"');
    expect(html).toContain("&lt;!-- readmore --&gt;");
    expect(html).toContain("&lt;!-- embed:youtube --&gt;https://youtu.be/x");
  });
});

describe("editorHtmlToMarkdown", () => {
  it("should turn editor blocks back into shortcodes and file URLs into relative ones", () => {
    expect(
      editorHtmlToMarkdown(
        '<p>Intro <img src="/files/article/hello/a.png" alt="pic"> <a href="https://example.com">link</a></p><hr class="readmore"><div class="embed" data-embed="youtube" data-content=" https://youtu.be/x "></div><div class="embed" data-embed="mermaidjs" data-content="graph TD;\n\n  A--&gt;B;\n"></div><div class="embed" data-embed="" data-content="old"></div><p></p><hr><h2>Sub</h2><p><em>em</em> <strong>strong</strong></p>',
        BASE,
      ),
    ).toBe(
      "Intro ![pic](a.png) [link](https://example.com)\n\n<!-- readmore -->\n\n<!-- embed:youtube --> https://youtu.be/x<!-- /embed:youtube -->\n\n<!-- embed:mermaidjs -->\ngraph TD;\n\n  A-->B;\n<!-- /embed:mermaidjs -->\n\n<!-- embed -->old<!-- /embed -->\n\n---\n\n## Sub\n\n*em* **strong**",
    );
  });

  it("should write lists with single-space markers, keeping ordered list starts", () => {
    expect(
      editorHtmlToMarkdown(
        '<ul><li><p>one</p></li><li><p>two</p><p>more</p></li></ul><ol start="3"><li><p>three</p></li><li><p>four</p></li></ol><ol><li>a</li></ol>',
        BASE,
      ),
    ).toBe("- one\n- two\n\n  more\n\n3. three\n4. four\n\n1. a");
  });

  it("should write tables as GFM tables, with the first row as the header", () => {
    expect(
      editorHtmlToMarkdown(
        "<table><colgroup><col></colgroup><thead><tr><th><p>Data</p></th><th>Kept | for</th></tr></thead><tbody><tr><td><p>A cookie (<code>__session</code>)</p><p>more</p></td><td>30 days</td></tr></tbody></table>",
        BASE,
      ),
    ).toBe(
      "| Data | Kept \\| for |\n| --- | --- |\n| A cookie (`__session`) more | 30 days |",
    );
  });

  it("should not escape numbers at the start of headings", () => {
    expect(
      editorHtmlToMarkdown(
        "<h2>1. Data controller</h2><p>2. Not a list</p>",
        BASE,
      ),
    ).toBe("## 1. Data controller\n\n2\\. Not a list");
  });

  it("should keep small, big and details blocks as HTML, with Markdown inside details", () => {
    expect(
      editorHtmlToMarkdown(
        '<p>A <small>tiny</small> and <big>huge</big> word</p><details><summary>More <em>info</em></summary><div data-type="detailsContent"><p>Hidden <strong>bold</strong></p></div></details>',
        BASE,
      ),
    ).toBe(
      "A <small>tiny</small> and <big>huge</big> word\n\n<details>\n<summary>More <em>info</em></summary>\n\nHidden **bold**\n\n</details>",
    );
    expect(
      editorHtmlToMarkdown("<details><p>No summary</p></details>", BASE),
    ).toBe("<details>\n<summary></summary>\n\nNo summary\n\n</details>");
  });

  it("should round-trip article markdown", () => {
    const markdown =
      "Intro with a [link](https://example.com) and ![image](thumb.png).\n\n<!-- readmore -->\n\nThe rest.\n\n## Sub\n\n- one\n- two\n\n<!-- embed:youtube -->https://youtu.be/aju_UB5VIf8<!-- /embed:youtube -->\n\n<!-- embed:mermaidjs -->\ngraph TD;\n\n  A-->B;\n<!-- /embed:mermaidjs -->\n\n> quote\n\n```\ncode\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nSome <small>small</small> and <big>big</big> text\n\n<details>\n<summary>More</summary>\n\nHidden\n\n- a\n- b\n\n</details>";
    expect(
      editorHtmlToMarkdown(markdownToEditorHtml(markdown, BASE), BASE),
    ).toBe(markdown);
  });
});
