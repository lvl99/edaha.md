import { describe, expect, it } from "vitest";
import {
  articleMetadata,
  fieldKind,
  fieldOptions,
  MetadataValidator,
  parseMetadata,
  resolveFileFields,
  templateMetadata,
  typeMetadataKeys,
  type MetadataDefinitions,
} from "..";

/** Definitions like the brief's examples */
const DEFINITIONS: MetadataDefinitions = {
  featured: {
    title: "Featured Image",
    type: "string",
    $edahaField: { file: { accept: "image/*" } },
  },
  rating: {
    type: "number",
    minimum: 0,
    maximum: 10,
    $edahaField: { number: { step: 1 } },
  },
  credit: {
    type: "object",
    properties: {
      name: { type: "string", $edahaField: { text: true } },
      homepage: { type: "string", format: "uri", $edahaField: { url: true } },
    },
    required: ["name"],
  },
  images: {
    type: "array",
    items: { type: "string", $edahaField: { file: true } },
    maxItems: 2,
  },
};

describe("parseMetadata", () => {
  it("should read definitions, or none", () => {
    expect(parseMetadata(DEFINITIONS)).toBe(DEFINITIONS);
    expect(parseMetadata(undefined)).toEqual({});
    expect(parseMetadata(null)).toEqual({});
  });

  it("should reject core setting names and unusable keys", () => {
    expect(() =>
      parseMetadata({ author: { type: "object", properties: {} } }),
    ).toThrow(
      '"metadata.author" can\'t be used: "author" is a core setting of every article',
    );
    expect(() =>
      parseMetadata({ "2nd": { $edahaField: { text: true } } }),
    ).toThrow('"metadata.2nd" must start with a letter or "_"');
    expect(() => parseMetadata(["featured"])).toThrow(
      '"metadata" must be a map of settings',
    );
  });

  it("should require exactly one field kind for every value, through objects and lists", () => {
    expect(() => parseMetadata({ a: { type: "string" } })).toThrow(
      '"metadata.a.$edahaField" must be a map of settings',
    );
    expect(() =>
      parseMetadata({ a: { type: "string", $edahaField: { title: "A" } } }),
    ).toThrow(
      '"metadata.a.$edahaField" must have exactly one field kind (text, email',
    );
    expect(() =>
      parseMetadata({
        a: { type: "string", $edahaField: { text: true, textarea: true } },
      }),
    ).toThrow("not text and textarea");
    expect(() =>
      parseMetadata({
        a: { type: "object", properties: { b: { type: "string" } } },
      }),
    ).toThrow('"metadata.a.properties.b.$edahaField"');
    expect(() => parseMetadata({ a: { type: "object" } })).toThrow(
      '"metadata.a.properties" must be a map of settings',
    );
    expect(() => parseMetadata({ a: { type: "array" } })).toThrow(
      '"metadata.a.items" must be a map of settings',
    );
  });

  it("should reject schemas ajv can't compile", () => {
    expect(() =>
      parseMetadata({ a: { type: "strin", $edahaField: { text: true } } }),
    ).toThrow('"metadata.a" isn\'t a valid JSON Schema');
  });
});

describe("fieldKind and fieldOptions", () => {
  it("should give a field's kind and its options", () => {
    expect(fieldKind({ title: "A", file: { accept: "image/*" } })).toBe("file");
    expect(fieldOptions({ file: { accept: "image/*" } })).toEqual({
      accept: "image/*",
    });
    expect(fieldOptions({ checkbox: true })).toEqual({});
  });
});

describe("typeMetadataKeys", () => {
  it("should give the listed fields, none for false, or all", () => {
    expect(typeMetadataKeys(DEFINITIONS, ["rating"])).toEqual(["rating"]);
    expect(typeMetadataKeys(DEFINITIONS, false)).toEqual([]);
    expect(typeMetadataKeys(DEFINITIONS, undefined)).toEqual([
      "featured",
      "rating",
      "credit",
      "images",
    ]);
  });
});

describe("MetadataValidator", () => {
  it("should give every problem with a value, by its path", () => {
    const validator = new MetadataValidator(DEFINITIONS);
    expect(validator.validate("rating", 5)).toEqual([]);
    expect(validator.validate("rating", 11)).toEqual([
      { path: "rating", message: "must be <= 10", level: "error" },
    ]);
    expect(
      validator.validate("credit", { homepage: "nope" }).map((p) => p.path),
    ).toEqual(["credit", "credit/homepage"]);
    expect(validator.validate("images", ["a.png", 2, 3])).toEqual([
      {
        path: "images",
        message: "must NOT have more than 2 items",
        level: "error",
      },
      { path: "images/1", message: "must be string", level: "error" },
      { path: "images/2", message: "must be string", level: "error" },
    ]);
    // Compiled once, so the same again
    expect(validator.validate("rating", 11)).toHaveLength(1);
  });
});

describe("articleMetadata", () => {
  it("should validate the type's fields and warn about others", () => {
    const validator = new MetadataValidator(DEFINITIONS);
    expect(
      articleMetadata(
        {
          date: "2026-10-19",
          title: "Hi",
          featured: "a.png",
          rating: 20,
          images: ["b.png"],
          oops: true,
        },
        ["featured", "rating"],
        validator,
        "News",
      ),
    ).toEqual({
      values: { featured: "a.png", rating: 20 },
      problems: [
        { path: "rating", message: "must be <= 10", level: "error" },
        { path: "images", message: "isn't used by News", level: "warning" },
        { path: "oops", message: "isn't a known setting", level: "warning" },
      ],
    });
  });
});

describe("resolveFileFields and templateMetadata", () => {
  it("should make file fields' relative names into paths, through objects and lists", () => {
    expect(resolveFileFields(DEFINITIONS.featured!, "a.png", "/news/hi/")).toBe(
      "/news/hi/a.png",
    );
    expect(
      resolveFileFields(
        DEFINITIONS.featured!,
        "https://x.com/a.png",
        "/news/hi/",
      ),
    ).toBe("https://x.com/a.png");
    expect(
      resolveFileFields(DEFINITIONS.images!, ["a.png", "/b.png"], "/news/hi/"),
    ).toEqual(["/news/hi/a.png", "/b.png"]);
    expect(
      resolveFileFields(
        {
          type: "object",
          properties: {
            photo: { type: "string", $edahaField: { file: true } },
            name: { type: "string", $edahaField: { text: true } },
          },
        },
        { photo: "a.png", name: "a.png", extra: "a.png" },
        "/news/hi/",
      ),
    ).toEqual({ photo: "/news/hi/a.png", name: "a.png", extra: "a.png" });
    expect(resolveFileFields(DEFINITIONS.rating!, 3, "/news/hi/")).toBe(3);
  });

  it("should give templates the valid values only, with file paths", () => {
    expect(
      templateMetadata(
        {
          values: { featured: "a.png", rating: 20, images: ["b.png", 2] },
          problems: [
            { path: "rating", message: "must be <= 10", level: "error" },
            { path: "images/1", message: "must be string", level: "error" },
            {
              path: "oops",
              message: "isn't a known setting",
              level: "warning",
            },
          ],
        },
        DEFINITIONS,
        "/news/hi/",
      ),
    ).toEqual({ featured: "/news/hi/a.png" });
  });
});
