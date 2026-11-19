import { describe, expect, it } from "vitest";
import { BUILT_IN_GROUPS, metadataLayout, parseMetadataGroups } from "..";
import { parseConfig } from "../../config";
import type { MetadataDefinitions } from "../../metadata";

/** A text field in a group */
const inGroup = (group?: unknown) => ({
  type: "string",
  $edahaField: { text: true, ...(group === undefined ? {} : { group }) },
});

/** The layout's groups as "key: field, field" */
const summary = (definitions: MetadataDefinitions, groups = {}) =>
  metadataLayout(definitions, parseMetadataGroups(groups)).map(
    ({ key, fields }) => `${key}: ${fields.join(", ")}`,
  );

describe("parseMetadataGroups", () => {
  it("should read groups with a title, description, place and whether they start open", () => {
    expect(
      parseMetadataGroups({
        seo: {
          title: " SEO ",
          description: "For search engines",
          after: "info",
          openedByDefault: true,
        },
        extra: { title: "Extra" },
      }),
    ).toEqual({
      seo: {
        title: "SEO",
        description: "For search engines",
        after: "info",
        openedByDefault: true,
      },
      extra: {
        title: "Extra",
        description: undefined,
        after: undefined,
        openedByDefault: false,
      },
    });
    expect(parseMetadataGroups(undefined)).toEqual({});
    expect(parseMetadataGroups(null)).toEqual({});
  });

  it("should reject built-in keys, unusable keys and invalid settings", () => {
    expect(() => parseMetadataGroups({ files: { title: "F" } })).toThrow(
      '"metadataGroups.files" can\'t be used: "files" is a built-in group',
    );
    expect(() => parseMetadataGroups({ "1st": { title: "F" } })).toThrow(
      '"metadataGroups.1st" must start with a letter',
    );
    expect(() => parseMetadataGroups({ a: {} })).toThrow(
      '"metadataGroups.a".title is required',
    );
    expect(() => parseMetadataGroups({ a: { title: " " } })).toThrow(
      '"metadataGroups.a".title must be non-empty text',
    );
    expect(() =>
      parseMetadataGroups({ a: { title: "A", openedByDefault: "yes" } }),
    ).toThrow('"metadataGroups.a".openedByDefault must be true or false');
    expect(() =>
      parseMetadataGroups({ a: { title: "A", open: true } }),
    ).toThrow('"metadataGroups.a" has unknown settings: "open"');
    expect(() => parseMetadataGroups({ a: "A" })).toThrow(
      '"metadataGroups.a" must be a map of settings',
    );
    expect(() => parseMetadataGroups([])).toThrow(
      '"metadataGroups" must be a map of settings',
    );
  });
});

describe("metadataLayout", () => {
  it("should give the built-in groups with their core settings, with custom fields in Custom by default", () => {
    expect(summary({ mood: inGroup(), rating: inGroup() })).toEqual([
      "info: type, status, slug, date, author",
      "categorise: tags",
      "customise: excerpt, template",
      "files: thumbnail, attachments, uploaded",
      "custom: mood, rating",
    ]);
    expect(
      metadataLayout({}, {}).map(({ key, title, openedByDefault }) => [
        key,
        title,
        openedByDefault,
      ]),
    ).toEqual([
      ["info", "Info", true],
      ["categorise", "Categorise", false],
      ["customise", "Customise", true],
      ["files", "Files", true],
      ["custom", "Custom", false],
    ]);
    // The built-in groups aren't changed
    expect(BUILT_IN_GROUPS[3]?.fields).toEqual([
      "thumbnail",
      "attachments",
      "uploaded",
    ]);
  });

  it("should put fields in their group, after the field they name or at its end", () => {
    expect(
      summary({
        hero: inGroup({ key: "files", after: "thumbnail" }),
        gallery: inGroup("files"),
        credit: inGroup({ key: "files", after: "hero" }),
        // Maps and lists can set only their group
        mood: {
          type: "object",
          properties: {},
          $edahaField: { group: "info" },
        },
      }),
    ).toContain(
      "files: thumbnail, hero, credit, attachments, uploaded, gallery",
    );
    expect(
      summary({
        mood: {
          type: "object",
          properties: {},
          $edahaField: { group: "info" },
        },
      })[0],
    ).toBe("info: type, status, slug, date, author, mood");
  });

  it("should put custom groups after the group they name, or at the end", () => {
    expect(
      summary(
        { score: inGroup("seo"), notes: inGroup({ key: "extra" }) },
        {
          extra: { title: "Extra" },
          seo: { title: "SEO", after: "info", openedByDefault: true },
          more: { title: "More", after: "seo" },
        },
      ),
    ).toEqual([
      "info: type, status, slug, date, author",
      "seo: score",
      "more: ",
      "categorise: tags",
      "customise: excerpt, template",
      "files: thumbnail, attachments, uploaded",
      "custom: ",
      "extra: notes",
    ]);
  });

  it("should reject unknown groups, and fields or groups following what isn't there", () => {
    expect(() => summary({ a: inGroup("nope") })).toThrow(
      '"metadata.a" is in group "nope", which isn\'t a built-in group or in "metadataGroups"',
    );
    expect(() =>
      summary({ a: inGroup({ key: "files", after: "tags" }) }),
    ).toThrow('"metadata.a" comes after "tags", which isn\'t in group "files"');
    // Following each other, neither can be placed
    expect(() =>
      summary({
        a: inGroup({ key: "files", after: "b" }),
        b: inGroup({ key: "files", after: "a" }),
      }),
    ).toThrow('"metadata.a" comes after "b", which isn\'t in group "files"');
    expect(() => summary({}, { seo: { title: "SEO", after: "nope" } })).toThrow(
      '"metadataGroups.seo" comes after "nope", which isn\'t a group',
    );
    expect(() => summary({ a: inGroup({ after: "x" }) })).toThrow(
      '"metadata.a.$edahaField.group".key is required',
    );
    expect(() => summary({ a: inGroup(3) })).toThrow(
      '"metadata.a.$edahaField.group" must be a map of settings',
    );
  });

  it("should stop the config being read with problems in its groups", () => {
    expect(() =>
      parseConfig({
        name: "N",
        description: "D",
        metadata: { a: inGroup("nope") },
      }),
    ).toThrow('config: "metadata.a" is in group "nope"');
    expect(
      parseConfig({
        name: "N",
        description: "D",
        metadataGroups: { seo: { title: "SEO" } },
      }).metadataGroups,
    ).toEqual({
      seo: {
        title: "SEO",
        description: undefined,
        after: undefined,
        openedByDefault: false,
      },
    });
  });
});
