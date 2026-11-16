import { describe, expect, it } from "vitest";
import { defaultTypeConfig } from "../../config";
import { checkTypePaths, folderPath, folderUrl, slugProblem } from "..";

const types = {
  news: defaultTypeConfig("news"),
  page: { ...defaultTypeConfig("page"), path: "" },
};

describe("folderPath and folderUrl", () => {
  it("should join non-empty segments into folders", () => {
    expect(folderPath("", "news")).toBe("news/");
    expect(folderPath("docs", "news")).toBe("docs/news/");
    expect(folderPath("", "")).toBe("");
    expect(folderUrl("news/")).toBe("/news/");
    expect(folderUrl("")).toBe("/");
  });
});

describe("checkTypePaths", () => {
  it("should accept distinct paths", () => {
    expect(() => checkTypePaths("", types)).not.toThrow();
  });

  it("should reject types sharing a path", () => {
    expect(() =>
      checkTypePaths("", {
        ...types,
        other: { ...defaultTypeConfig("other"), path: "news" },
      }),
    ).toThrow('types "news" and "other" have the same path "news"');
  });

  it("should reject reserved paths at the website's root only", () => {
    const app = { app: defaultTypeConfig("app") };
    expect(() => checkTypePaths("", app, ["app"])).toThrow(
      'type "app" can\'t use the path "app", which is reserved',
    );
    expect(() => checkTypePaths("", app)).not.toThrow();
    expect(() => checkTypePaths("docs", app, ["app"])).not.toThrow();
  });
});

describe("slugProblem", () => {
  it("should reject list folders and numbers in any type", () => {
    expect(slugProblem("tags", "news", "", types)).toBe(
      'the slug "tags" is used by tag lists',
    );
    expect(slugProblem("authors", "news", "", types)).toBe(
      'the slug "authors" is used by author lists',
    );
    expect(slugProblem("2", "news", "", types)).toBe(
      'the slug "2" is used by list pages',
    );
    expect(slugProblem("hello", "news", "", types)).toBeUndefined();
  });

  it("should reject reserved paths and other types' paths at the website's root", () => {
    expect(slugProblem("app", "page", "", types, ["app"])).toBe(
      'the slug "app" is reserved',
    );
    expect(slugProblem("app", "page", "", types)).toBeUndefined();
    expect(slugProblem("news", "page", "", types)).toBe(
      'the slug "news" is the path of type "news"',
    );
    expect(slugProblem("about", "page", "", types)).toBeUndefined();
    // Not at the root: under a site path or a type path
    expect(slugProblem("app", "page", "docs", types, ["app"])).toBeUndefined();
    expect(slugProblem("app", "news", "", types, ["app"])).toBeUndefined();
    // A type that isn't configured is at its own path
    expect(slugProblem("app", "video", "", types, ["app"])).toBeUndefined();
  });
});
