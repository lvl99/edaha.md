import { describe, expect, it } from "vitest";
import {
  changeArticleReferences,
  changeBodyReferences,
  fileFilters,
  fileKind,
  fileReferences,
  MAX_FILES_PER_PAGE,
  queryFiles,
} from "..";
import type { IndexedFile } from "../../types";

/** A file with defaults */
const file = (overrides: Partial<IndexedFile>): IndexedFile => ({
  type: "news",
  slug: "hello",
  name: "a.png",
  kind: "image",
  size: 100,
  updated: "2026-11-01T00:00:00.000Z",
  ...overrides,
});

describe("fileKind", () => {
  it("should tell a file's kind by its extension, ignoring case", () => {
    expect(fileKind("photo.JPG")).toBe("image");
    expect(fileKind("guide.pdf")).toBe("document");
    expect(fileKind("site.tar.gz")).toBe("archive");
    expect(fileKind("clip.webm")).toBe("video");
    expect(fileKind("song.mp3")).toBe("audio");
    expect(fileKind("data.bin")).toBe("other");
    expect(fileKind("README")).toBe("other");
  });
});

describe("queryFiles and fileFilters", () => {
  const files = [
    file({ name: "B.png", size: 300 }),
    file({ name: "a.pdf", kind: "document", size: 50 }),
    file({ type: "page", slug: "about", name: "c.zip", kind: "archive" }),
  ];
  const names = (query: Parameters<typeof queryFiles>[1]) =>
    queryFiles(files, query).files.map((f) => f.name);

  it("should search names and filter by kind and article type", () => {
    expect(names({ search: " b. " })).toEqual(["B.png"]);
    expect(names({ kind: "document" })).toEqual(["a.pdf"]);
    expect(names({ type: "page" })).toEqual(["c.zip"]);
  });

  it("should sort by location then name by default, or by name, kind or size, either way", () => {
    expect(names(undefined)).toEqual(["a.pdf", "B.png", "c.zip"]);
    expect(names({ sort: "name" })).toEqual(["a.pdf", "B.png", "c.zip"]);
    expect(names({ sort: "name", order: "desc" })).toEqual([
      "c.zip",
      "B.png",
      "a.pdf",
    ]);
    expect(names({ sort: "kind" })).toEqual(["c.zip", "a.pdf", "B.png"]);
    // Largest first by default
    expect(names({ sort: "size" })).toEqual(["B.png", "c.zip", "a.pdf"]);
    expect(names({ sort: "size", order: "asc" })).toEqual([
      "a.pdf",
      "c.zip",
      "B.png",
    ]);
    expect(names({ sort: "location", order: "desc" })).toEqual([
      "c.zip",
      "a.pdf",
      "B.png",
    ]);
  });

  it("should give one page at a time, keeping pages in range", () => {
    expect(queryFiles(files, { perPage: 2, page: 2 })).toMatchObject({
      files: [files[2]],
      total: 3,
      page: 2,
      pages: 2,
      perPage: 2,
    });
    expect(queryFiles(files, { perPage: 500, page: 9 })).toMatchObject({
      page: 1,
      perPage: MAX_FILES_PER_PAGE,
    });
    expect(queryFiles([], { perPage: 0, page: -1 })).toMatchObject({
      pages: 1,
      page: 1,
      perPage: 1,
    });
  });

  it("should give the kinds and article types in use", () => {
    expect(fileFilters(files)).toEqual({
      kinds: ["archive", "document", "image"],
      types: ["news", "page"],
    });
  });
});

describe("fileReferences", () => {
  it("should refer to a file by name in its own article, and by path or address anywhere", () => {
    expect(
      fileReferences(
        "photo.png",
        "/news/hello/photo.png",
        "https://example.com",
        true,
      ),
    ).toEqual([
      "photo.png",
      "./photo.png",
      "/news/hello/photo.png",
      "https://example.com/news/hello/photo.png",
    ]);
    expect(
      fileReferences("photo.png", "/news/hello/photo.png", undefined, false),
    ).toEqual(["/news/hello/photo.png"]);
  });
});

describe("changeBodyReferences", () => {
  const body = [
    'Look: ![A photo](photo.png "Title") and [the photo](./photo.png).',
    '<img src="/news/hello/photo.png" alt=""> and <a href="photo.png">a <b>link</b></a>.',
    "[Elsewhere](other.png) and `![code](photo.png)`",
    "",
    "```",
    "![fenced](photo.png)",
    "```",
  ].join("\n");
  const references = ["photo.png", "./photo.png", "/news/hello/photo.png"];

  it("should point references at a new file name, keeping their folder, outside code", () => {
    expect(
      changeBodyReferences(body, references, { rename: "photo.jpg" }),
    ).toEqual({
      markdown: [
        'Look: ![A photo](photo.jpg "Title") and [the photo](./photo.jpg).',
        '<img src="/news/hello/photo.jpg" alt=""> and <a href="photo.jpg">a <b>link</b></a>.',
        "[Elsewhere](other.png) and `![code](photo.png)`",
        "",
        "```",
        "![fenced](photo.png)",
        "```",
      ].join("\n"),
      count: 4,
    });
  });

  it("should remove images and keep links' text", () => {
    expect(changeBodyReferences(body, references, { remove: true })).toEqual({
      markdown: [
        "Look:  and the photo.",
        " and a <b>link</b>.",
        "[Elsewhere](other.png) and `![code](photo.png)`",
        "",
        "```",
        "![fenced](photo.png)",
        "```",
      ].join("\n"),
      count: 4,
    });
  });
});

describe("changeArticleReferences", () => {
  const source = [
    "<!--yaml",
    "date: 2026-10-19T09:54:00.000Z",
    "thumbnail: photo.png",
    "attachments:",
    "  - url: photo.png",
    "    name: Photo",
    "  - url: guide.pdf",
    "    thumbnail: photo.png",
    "  - photo.png",
    "  - other.zip",
    "-->",
    "",
    "# Hello",
    "",
    "![](photo.png)",
    "",
  ].join("\n");
  const references = ["photo.png"];

  it("should change references in the settings and body, keeping the header's format", () => {
    expect(
      changeArticleReferences(source, references, { rename: "photo.jpg" }),
    ).toBe(
      [
        "<!--yaml",
        "date: 2026-10-19T09:54:00.000Z",
        "thumbnail: photo.jpg",
        "attachments:",
        "  - url: photo.jpg",
        "    name: Photo",
        "  - url: guide.pdf",
        "    thumbnail: photo.jpg",
        "  - photo.jpg",
        "  - other.zip",
        "-->",
        "",
        "# Hello",
        "",
        "![](photo.jpg)",
        "",
      ].join("\n"),
    );
  });

  it("should clear thumbnails and remove attachments that are the file", () => {
    expect(changeArticleReferences(source, references, { remove: true })).toBe(
      [
        "<!--yaml",
        "date: 2026-10-19T09:54:00.000Z",
        "attachments:",
        "  - url: guide.pdf",
        "  - other.zip",
        "-->",
        "",
        "# Hello",
        "",
        "",
        "",
      ].join("\n"),
    );
    // Without attachments left, the setting goes
    expect(
      changeArticleReferences(
        '<!--json\n{ "attachments": ["photo.png"] }\n-->\nText',
        references,
        { remove: true },
      ),
    ).toBe("<!--json\n{}\n-->\nText");
  });

  it("should keep the header as written when only the body changes", () => {
    expect(
      changeArticleReferences(
        "<!--yml\ndate:   2026-10-19\n-->\n![](photo.png)",
        references,
        { rename: "a.png" },
      ),
    ).toBe("<!--yml\ndate:   2026-10-19\n-->\n![](a.png)");
    expect(
      changeArticleReferences("No header ![](photo.png)", references, {
        rename: "a.png",
      }),
    ).toBe("No header ![](a.png)");
  });

  it("should give nothing for articles that don't refer to the file", () => {
    expect(
      changeArticleReferences("# Hi\n\nNo files here.", references, {
        remove: true,
      }),
    ).toBeUndefined();
    // Mentioned, but not referred to
    expect(
      changeArticleReferences(
        "<!--yaml\nattachments:\n  - name: x\n-->\nThe file photo.png",
        references,
        { remove: true },
      ),
    ).toBeUndefined();
  });
});
