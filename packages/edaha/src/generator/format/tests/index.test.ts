import { describe, expect, it } from "vitest";
import {
  cropText,
  escapeHtml,
  formatBytes,
  formatDate,
  formatRfc822,
  isRelativeUrl,
  maskCode,
  rawHtml,
  replaceOutsideCode,
  replaceRawBlocks,
  stripHtml,
} from "..";

describe("replaceRawBlocks", () => {
  const show = (markdown: string) =>
    replaceRawBlocks(
      markdown,
      ({ content, block }) => `[${block ? "block" : "inline"}:${content}]`,
    );

  it("should find raw blocks on their own lines, without the line breaks inside their markers", () => {
    expect(show("A\n\n<!-- raw -->\n*a*\n\n# b\n<!-- /raw -->\n\nB")).toBe(
      "A\n\n[block:*a*\n\n# b]\n\nB",
    );
    expect(show("  <!--raw-->  \r\nx\r\n  <!--/raw-->  ")).toBe(
      "  [block:x]  ",
    );
    expect(show("<!-- raw -->x<!-- /raw -->")).toBe("[block:x]");
  });

  it("should find raw blocks within a line as inline, as they are", () => {
    expect(
      show("A <!-- raw --> *a* <!-- /raw -->\nB <!-- raw -->b<!-- /raw -->"),
    ).toBe("A [inline: *a* ]\nB [inline:b]");
  });

  it("should leave raw markers in code, and keep code in raw blocks", () => {
    expect(
      show(
        "`<!-- raw -->a<!-- /raw -->`\n\n```\n<!-- raw -->b<!-- /raw -->\n```\n\n<!-- raw -->\n```\nc\n<!-- /raw -->",
      ),
    ).toBe(
      "`<!-- raw -->a<!-- /raw -->`\n\n```\n<!-- raw -->b<!-- /raw -->\n```\n\n[block:```\nc]",
    );
  });

  it("should leave an unclosed raw marker as it is", () => {
    expect(show("<!-- raw -->a")).toBe("<!-- raw -->a");
  });
});

describe("rawHtml", () => {
  it("should write the content as character references, on one line", () => {
    expect(rawHtml({ content: "*a* -- <b>\r\n# c", block: true })).toBe(
      '\n\n<pre class="raw">&#42;a&#42; &#45;&#45; &#60;b&#62;&#10;&#35; c</pre>\n\n',
    );
    expect(rawHtml({ content: "é_1", block: false })).toBe(
      '<span class="raw">é&#95;1</span>',
    );
  });
});

describe("maskCode", () => {
  it("should blank out fenced code blocks and inline code, keeping positions", () => {
    const markdown =
      "A `<!-- x -->` and ``a ` b``\n\n```md\n<!-- x -->\n```\n\n~~~~\n~~~\n<!-- x -->\n~~~~~\nB <!-- x -->";
    const masked = maskCode(markdown);
    expect(masked).toHaveLength(markdown.length);
    expect(masked.match(/<!-- x -->/g)).toHaveLength(1);
    expect(masked.endsWith("B <!-- x -->")).toBe(true);
    expect(masked.startsWith("A ")).toBe(true);
  });

  it("should blank out an unclosed code block to the end", () => {
    expect(maskCode("A\n```\n<!-- x -->").trim()).toBe("A");
  });

  it("should leave text without code as it is", () => {
    expect(maskCode("A <!-- x --> B")).toBe("A <!-- x --> B");
  });
});

describe("replaceOutsideCode", () => {
  it("should replace matches outside code only, with their groups from the original text", () => {
    expect(
      replaceOutsideCode(
        "<!-- e -->a<!-- /e --> `<!-- e -->b<!-- /e -->` <!-- e -->c<!-- /e -->",
        /<!-- e -->(.*?)<!-- \/e -->/g,
        ([, value]) => `[${value}]`,
      ),
    ).toBe("[a] `<!-- e -->b<!-- /e -->` [c]");
  });

  it("should take the original text of a match around code", () => {
    expect(
      replaceOutsideCode(
        "<!-- e -->`code`<!-- /e -->",
        /<!-- e -->(.*?)<!-- \/e -->/,
        ([, value]) => `[${value}]`,
      ),
    ).toBe("[`code`]");
  });
});

describe("formatBytes", () => {
  it("should format sizes in bytes, KB, MB and GB", () => {
    expect(formatBytes(512)).toBe("512 bytes");
    expect(formatBytes(204800)).toBe("200 KB");
    expect(formatBytes(2621440)).toBe("2.5 MB");
    expect(formatBytes(5 * 1024 ** 4)).toBe("5120 GB");
  });
});

describe("dates", () => {
  it("should format readable and RFC 822 dates in UTC", () => {
    expect(formatDate("2026-10-19T23:54:00.000Z")).toBe("19 October 2026");
    expect(formatRfc822("2026-10-19T09:54:00.000Z")).toBe(
      "Mon, 19 Oct 2026 09:54:00 GMT",
    );
  });
});

describe("escapeHtml", () => {
  it("should escape HTML special characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });
});

describe("stripHtml", () => {
  it("should remove tags, decode entities and collapse whitespace", () => {
    expect(
      stripHtml(
        "<p>Fish &amp; <em>chips</em></p>\n<p>&#39;a&#x27; &nbsp;&lt;b&gt; &unknown;</p>",
      ),
    ).toBe("Fish & chips 'a' <b> &unknown;");
  });
});

describe("cropText", () => {
  it("should leave short text alone", () => {
    expect(cropText("Hello", 10)).toBe("Hello");
  });

  it("should crop at a word boundary and add an ellipsis", () => {
    expect(cropText("Hello wonderful world", 15)).toBe("Hello wonderful…");
    expect(cropText("Supercalifragilistic", 5)).toBe("Super…");
  });
});

describe("isRelativeUrl", () => {
  it("should only treat folder-relative URLs as relative", () => {
    expect(isRelativeUrl("thumb.jpg")).toBe(true);
    expect(isRelativeUrl("files/a b.pdf")).toBe(true);
    for (const url of [
      "",
      "https://a.com/x",
      "mailto:a@b.c",
      "/news/",
      "//cdn.com/x",
      "#top",
      "?page=2",
    ])
      expect(isRelativeUrl(url)).toBe(false);
  });
});
