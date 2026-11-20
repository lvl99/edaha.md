import { describe, expect, it } from "vitest";
import {
  articleMetadata,
  fieldKind,
  fieldOptions,
  MetadataValidator,
  parseMetadata,
  plainMessage,
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

  it("should let maps and lists set only their group, editing lists item by item", () => {
    const list = {
      type: "array",
      items: { type: "string", $edahaField: { text: true } },
      $edahaField: { group: "files" },
    };
    expect(parseMetadata({ list })).toEqual({ list });
    expect(() =>
      parseMetadata({
        list: {
          type: "array",
          items: { type: "string" },
          $edahaField: { group: "files" },
        },
      }),
    ).toThrow('"metadata.list.items.$edahaField" must be a map of settings');
  });

  it("should accept one field for a whole list", () => {
    const tags = {
      type: "array",
      items: { type: "string", enum: ["a", "b"] },
      $edahaField: { select: { multiple: true } },
    };
    expect(parseMetadata({ tags2: tags })).toEqual({ tags2: tags });
  });

  it("should explain items and properties written as lists", () => {
    expect(() =>
      parseMetadata({
        source: {
          type: "array",
          items: [{ type: "string", $edahaField: { text: true } }],
        },
      }),
    ).toThrow(
      '"metadata.source.items" must be one schema for every item, not a list (remove the "-" before it)',
    );
    expect(() =>
      parseMetadata({
        source: {
          type: "object",
          properties: [{ type: "string", $edahaField: { text: true } }],
        },
      }),
    ).toThrow(
      '"metadata.source.properties" must be a map of each property\'s name to its schema, not a list',
    );
  });

  it("should reject schemas ajv can't compile", () => {
    expect(() =>
      parseMetadata({ a: { type: "strin", $edahaField: { text: true } } }),
    ).toThrow('"metadata.a" isn\'t a valid JSON Schema');
  });

  it("should check fields' default values and conditions, in groups too", () => {
    const conditional = {
      layout: {
        type: "string",
        $edahaField: { select: true, defaultValue: "large" },
      },
      credit: {
        type: "object",
        properties: {
          name: {
            type: "string",
            $edahaField: { text: true, hideWhen: ["layout", "=", "slim"] },
          },
        },
        $edahaField: { showWhen: { or: [["layout", "in", ["large"]]] } },
      },
    };
    expect(parseMetadata(conditional)).toBe(conditional);
    expect(() =>
      parseMetadata({
        a: { type: "string", $edahaField: { text: true, defaultValue: {} } },
      }),
    ).toThrow(
      '"metadata.a.$edahaField".defaultValue must be text, a number, true, false or null',
    );
    expect(() =>
      parseMetadata({
        a: {
          type: "object",
          properties: {},
          $edahaField: { showWhen: ["b", "~", 1] },
        },
      }),
    ).toThrow('"metadata.a.$edahaField".showWhen must be a condition like');
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
      { path: "rating", message: "must be at most 10", level: "error" },
    ]);
    expect(
      validator.validate("credit", { homepage: "nope" }).map((p) => p.path),
    ).toEqual(["credit/name", "credit/homepage"]);
    expect(validator.validate("images", ["a.png", 2, 3])).toEqual([
      {
        path: "images",
        message: "can have at most 2 items",
        level: "error",
      },
      { path: "images/1", message: "must be text", level: "error" },
      { path: "images/2", message: "must be text", level: "error" },
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
        { path: "rating", message: "must be at most 10", level: "error" },
        { path: "images", message: "isn't used by News", level: "warning" },
        { path: "oops", message: "isn't a known setting", level: "warning" },
      ],
    });
  });

  it("should fill in default values and leave out hidden fields' values", () => {
    const validator = new MetadataValidator({
      layout: {
        type: "string",
        enum: ["slim", "large"],
        $edahaField: { select: true, defaultValue: "slim" },
      },
      tracklist: {
        type: "boolean",
        $edahaField: { checkbox: true, hideWhen: ["layout", "=", "slim"] },
      },
    });
    expect(
      articleMetadata(
        { tracklist: "yes" },
        ["layout", "tracklist", "missing"],
        validator,
        "News",
      ),
    ).toEqual({ values: { layout: "slim" }, problems: [] });
    expect(
      articleMetadata(
        { layout: "large", tracklist: "yes" },
        ["layout", "tracklist"],
        validator,
        "News",
      ).problems,
    ).toEqual([
      { path: "tracklist", message: "must be yes or no", level: "error" },
    ]);
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
            { path: "rating", message: "must be at most 10", level: "error" },
            { path: "images/1", message: "must be text", level: "error" },
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

describe("plainMessage", () => {
  /** The message for the first problem with a value under a schema */
  const message = (schema: object, value: unknown) =>
    new MetadataValidator({
      a: { ...schema, $edahaField: { text: true } },
    }).validate("a", value)[0]?.message;

  it("should say what is wrong in plain words", () => {
    expect(message({ type: "number" }, "x")).toBe("must be a number");
    expect(message({ type: ["integer", "null"] }, "x")).toBe(
      "must be a whole number or empty",
    );
    expect(message({ type: "boolean" }, 1)).toBe("must be yes or no");
    expect(message({ type: "array" }, 1)).toBe("must be a list");
    expect(message({ type: "object" }, 1)).toBe("must be a group of settings");
    expect(message({ minimum: 1 }, 0)).toBe("must be at least 1");
    expect(message({ maximum: 1 }, 2)).toBe("must be at most 1");
    expect(message({ exclusiveMinimum: 1 }, 1)).toBe("must be more than 1");
    expect(message({ exclusiveMaximum: 1 }, 1)).toBe("must be less than 1");
    expect(message({ multipleOf: 5 }, 3)).toBe("must be a multiple of 5");
    expect(message({ minLength: 1 }, "")).toBe("can't be empty");
    expect(message({ minLength: 3 }, "a")).toBe(
      "must be at least 3 characters",
    );
    expect(message({ maxLength: 1 }, "ab")).toBe("must be at most 1 character");
    expect(message({ pattern: "^a$" }, "b")).toBe("isn't in the right form");
    expect(message({ format: "email" }, "x")).toBe("must be an email address");
    expect(message({ format: "uri" }, "x")).toBe(
      "must be a full web address, e.g. https://example.com",
    );
    expect(message({ format: "date" }, "x")).toBe(
      "must be a date, e.g. 2026-11-19",
    );
    expect(message({ format: "ipv4" }, "x")).toBe("must be an IPv4 address");
    expect(message({ format: "duration" }, "x")).toBe(
      "must be a valid duration",
    );
    expect(message({ enum: ["a", 2] }, "c")).toBe('must be one of "a", 2');
    expect(message({ const: 3 }, 4)).toBe("must be 3");
    expect(message({ minItems: 1 }, [])).toBe("must have at least 1 item");
    expect(message({ maxItems: 1 }, [1, 2])).toBe("can have at most 1 item");
    expect(message({ uniqueItems: true }, [1, 1])).toBe(
      "can't have the same item twice",
    );
    // Others keep ajv's message
    expect(message({ not: {} }, 1)).toBe("must NOT be valid");
  });

  it("should point at a missing or unknown property, so its field shows it", () => {
    const validator = new MetadataValidator({
      a: {
        type: "object",
        properties: { b: { $edahaField: { text: true } } },
        required: ["b"],
        additionalProperties: false,
      },
    });
    expect(validator.validate("a", { c: 1 })).toEqual([
      { path: "a/b", message: "is required", level: "error" },
      { path: "a/c", message: "isn't a known setting", level: "error" },
    ]);
  });

  it("should keep ajv's message for keywords it doesn't know", () => {
    expect(
      plainMessage({
        keyword: "custom",
        params: {},
        message: "is odd",
        instancePath: "",
        schemaPath: "",
      }),
    ).toBe("is odd");
  });
});
