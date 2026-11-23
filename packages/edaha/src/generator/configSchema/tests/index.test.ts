import { describe, expect, it } from "vitest";
import { CONFIG_FORM_SCHEMA, configFormChanges, configFormProblems } from "..";
import { checkFieldSchema } from "../../metadata";

describe("CONFIG_FORM_SCHEMA", () => {
  it("should be a schema of editor fields, as articles' custom metadata", () => {
    for (const [key, schema] of Object.entries(
      CONFIG_FORM_SCHEMA.properties ?? {},
    ))
      expect(() => checkFieldSchema(schema, key)).not.toThrow();
    expect(Object.keys(CONFIG_FORM_SCHEMA.properties ?? {})).toEqual([
      "name",
      "description",
      "siteUrl",
      "theme",
    ]);
  });
});

describe("configFormChanges", () => {
  it("should trim text, and remove settings left empty", () => {
    expect(
      configFormChanges({
        name: " Notes ",
        description: "Things",
        siteUrl: " ",
        theme: undefined,
        other: 3,
      }),
    ).toEqual({
      name: "Notes",
      description: "Things",
      siteUrl: undefined,
      theme: undefined,
      other: 3,
    });
  });
});

describe("configFormProblems", () => {
  it("should accept the main settings, and empty optional ones", () => {
    expect(
      configFormProblems({
        name: "Notes",
        description: "Things",
        siteUrl: "https://example.com",
        theme: "../themes/plain",
      }),
    ).toEqual([]);
    expect(
      configFormProblems({ name: "Notes", description: "Things", siteUrl: "" }),
    ).toEqual([]);
  });

  it("should say what's wrong with each field, once", () => {
    expect(
      configFormProblems({ name: "  ", siteUrl: "ftp://example.com" }),
    ).toEqual([
      { path: "name", message: "is required", level: "error" },
      { path: "description", message: "is required", level: "error" },
      {
        path: "siteUrl",
        message: "must be a full web address, e.g. https://example.com",
        level: "error",
      },
    ]);
    expect(
      configFormProblems({
        name: "Notes",
        description: "Things",
        siteUrl: "x",
      }),
    ).toEqual([
      {
        path: "siteUrl",
        message: "must be a full web address, e.g. https://example.com",
        level: "error",
      },
    ]);
    expect(
      configFormProblems({ name: 3, description: "Things" })[0],
    ).toMatchObject({ path: "name", message: "must be text" });
  });
});
