import { describe, expect, it } from "vitest";
import {
  cropText,
  escapeHtml,
  formatBytes,
  formatDate,
  formatRfc822,
  isRelativeUrl,
  stripHtml,
} from "..";

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
