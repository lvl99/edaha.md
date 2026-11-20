import { describe, expect, it } from "vitest";
import {
  checkConditions,
  checkFieldExtensions,
  fieldShown,
  matchesConditions,
  resolveFields,
  valueAt,
  type MatchCondition,
} from "..";
import type { MetadataDefinitions } from "../../metadata";

/** Fields like the brief's Bandcamp options */
const FIELDS: MetadataDefinitions = {
  layout: {
    type: "string",
    enum: ["slim", "artwork-only", "large"],
    $edahaField: { select: true, defaultValue: "large" },
  },
  artwork: {
    type: "string",
    $edahaField: {
      checkbox: { value: "none" },
      showWhen: {
        or: [
          ["layout", "=", "slim"],
          ["layout", "=", "large"],
        ],
      },
    },
  },
  tracklist: {
    type: "boolean",
    $edahaField: {
      checkbox: true,
      defaultValue: false,
      hideWhen: ["layout", "=", "slim"],
    },
  },
  minimal: {
    type: "boolean",
    $edahaField: {
      checkbox: true,
      showWhen: {
        or: [
          ["layout", "=", "artwork-only"],
          ["layout", "=", "large"],
        ],
      },
      hideWhen: ["artwork", "=", "none"],
    },
  },
};

describe("checkConditions and checkFieldExtensions", () => {
  it("should accept conditions and groups of them", () => {
    for (const conditions of [
      ["layout", "=", "slim"],
      ["count", ">=", 2],
      ["layout", "not-in", ["slim", null]],
      { and: [["a", "!=", true], { or: [["b", "<", 1]] }] },
      [{ or: { and: [["a", "=", 1]] } }, { and: [["b", "=", 2]] }],
    ])
      expect(() => checkConditions(conditions, "showWhen")).not.toThrow();
  });

  it("should name what is wrong", () => {
    for (const conditions of [
      ["layout", "="],
      ["", "=", 1],
      ["layout", "~", 1],
      ["layout", "=", [1]],
      ["layout", "in", "slim"],
      ["layout", "in", [{}]],
    ])
      expect(() => checkConditions(conditions, "showWhen")).toThrow(
        "showWhen must be a condition like",
      );
    expect(() => checkConditions({ or: [["a", "=", {}]] }, "x")).toThrow(
      "x.or.0 must be a condition like",
    );
    for (const conditions of [{}, { and: [], or: [] }, { not: [] }, 1, null])
      expect(() => checkConditions(conditions, "x")).toThrow(
        'x must be a condition, or a group with one "and" or "or" list',
      );
  });

  it("should check default values and both kinds of conditions", () => {
    expect(() =>
      checkFieldExtensions(
        { text: true, defaultValue: null, showWhen: ["a", "=", 1] },
        "field",
      ),
    ).not.toThrow();
    expect(() =>
      checkFieldExtensions({ text: true, defaultValue: [1] }, "field"),
    ).toThrow("field.defaultValue must be text, a number, true, false or null");
    expect(() =>
      checkFieldExtensions({ text: true, hideWhen: "a" }, "field"),
    ).toThrow("field.hideWhen must be a condition, or a group");
  });
});

describe("valueAt", () => {
  it("should find values at dot paths", () => {
    const values = { credit: { name: "Ann" }, images: ["a.png"] };
    expect(valueAt(values, "credit.name")).toBe("Ann");
    expect(valueAt(values, "images.0")).toBe("a.png");
    expect(valueAt(values, "credit.name.first")).toBeUndefined();
    expect(valueAt(values, "missing.name")).toBeUndefined();
  });
});

describe("matchesConditions", () => {
  const values = { layout: "slim", count: 3, on: true, empty: null };

  it("should compare values", () => {
    expect(matchesConditions(values, ["layout", "=", "slim"])).toBe(true);
    expect(matchesConditions(values, ["layout", "!=", "slim"])).toBe(false);
    // A missing value equals null
    expect(matchesConditions(values, ["missing", "=", null])).toBe(true);
    expect(matchesConditions(values, ["empty", "!=", null])).toBe(false);
    expect(matchesConditions(values, ["on", "=", true])).toBe(true);
    expect(matchesConditions(values, ["count", ">", 2])).toBe(true);
    expect(matchesConditions(values, ["count", ">=", 4])).toBe(false);
    expect(matchesConditions(values, ["count", "<", 3])).toBe(false);
    expect(matchesConditions(values, ["count", "<=", 3])).toBe(true);
    expect(matchesConditions(values, ["layout", "<", "t"])).toBe(true);
    // Only numbers with numbers, and text with text, are in order
    expect(matchesConditions(values, ["count", ">", "2"])).toBe(false);
    expect(matchesConditions(values, ["on", ">", false])).toBe(false);
    expect(matchesConditions(values, ["layout", "in", ["large", "slim"]])).toBe(
      true,
    );
    expect(matchesConditions(values, ["layout", "not-in", ["slim"]])).toBe(
      false,
    );
    expect(matchesConditions(values, ["missing", "in", [null]])).toBe(true);
  });

  it("should match groups of conditions", () => {
    const slim: MatchCondition = ["layout", "=", "slim"];
    const many: MatchCondition = ["count", ">", 5];
    expect(matchesConditions(values, { and: [slim, many] })).toBe(false);
    expect(matchesConditions(values, { or: [slim, many] })).toBe(true);
    expect(matchesConditions(values, { or: slim })).toBe(true);
    expect(matchesConditions(values, { and: many })).toBe(false);
    // Nested groups, and a list of groups that must all match
    expect(
      matchesConditions(values, {
        or: [{ and: [many] }, { or: { and: [slim] } }],
      }),
    ).toBe(true);
    expect(matchesConditions(values, [{ or: [slim] }, { and: [many] }])).toBe(
      false,
    );
  });
});

describe("fieldShown", () => {
  it("should show a field when its showWhen matches and its hideWhen doesn't", () => {
    const field = {
      showWhen: ["layout", "=", "large"],
      hideWhen: ["artwork", "=", "none"],
    } as const;
    expect(fieldShown(undefined, {})).toBe(true);
    expect(fieldShown({}, {})).toBe(true);
    expect(fieldShown(field, { layout: "large" })).toBe(true);
    expect(fieldShown(field, { layout: "slim" })).toBe(false);
    expect(fieldShown(field, { layout: "large", artwork: "none" })).toBe(false);
  });
});

describe("resolveFields", () => {
  it("should fill in shown fields' defaults and leave out hidden fields' values", () => {
    expect(resolveFields(FIELDS, {})).toEqual({
      values: { layout: "large", tracklist: false },
      hidden: new Set(),
    });
    expect(
      resolveFields(FIELDS, { layout: "slim", tracklist: true, minimal: true }),
    ).toEqual({
      values: { layout: "slim" },
      hidden: new Set(["tracklist", "minimal"]),
    });
    // Hiding a value shows another
    expect(
      resolveFields(FIELDS, {
        layout: "artwork-only",
        artwork: "none",
        minimal: true,
      }),
    ).toEqual({
      values: { layout: "artwork-only", tracklist: false, minimal: true },
      hidden: new Set(["artwork"]),
    });
    expect(resolveFields(FIELDS, { artwork: "none", minimal: true })).toEqual({
      values: { layout: "large", artwork: "none", tracklist: false },
      hidden: new Set(["minimal"]),
    });
  });

  it("should apply conditions to groups and the fields in them", () => {
    const fields: MetadataDefinitions = {
      credit: {
        type: "object",
        properties: {
          name: {
            type: "string",
            $edahaField: { text: true, defaultValue: "Ann" },
          },
          url: {
            type: "string",
            $edahaField: { url: true, showWhen: ["credit.name", "!=", "Ann"] },
          },
        },
        $edahaField: { hideWhen: ["off", "=", true] },
      },
      off: { type: "boolean", $edahaField: { checkbox: true } },
      // A group without its own $edahaField
      extra: { type: "object", properties: {} },
    };
    expect(resolveFields(fields, { credit: { url: "x" } })).toEqual({
      values: { credit: { name: "Ann" } },
      hidden: new Set(["credit.url"]),
    });
    expect(
      resolveFields(fields, { credit: { name: "Bo", url: "x" }, off: true }),
    ).toEqual({
      values: { off: true },
      hidden: new Set(["credit", "credit.name", "credit.url"]),
    });
    // A group's value that isn't a map is replaced to hold its fields' defaults
    expect(resolveFields(fields, { credit: "Ann" }).values).toEqual({
      credit: { name: "Ann" },
    });
  });

  it("should stop when conditions contradict each other", () => {
    const fields: MetadataDefinitions = {
      a: {
        type: "string",
        $edahaField: {
          text: true,
          defaultValue: "x",
          hideWhen: ["b", "=", "y"],
        },
      },
      b: {
        type: "string",
        $edahaField: {
          text: true,
          defaultValue: "y",
          hideWhen: ["a", "=", "x"],
        },
      },
    };
    // It still gives values
    expect(resolveFields(fields, {}).values).toBeTypeOf("object");
  });
});
