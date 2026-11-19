import { describe, expect, it } from "vitest";
import {
  editorKind,
  fieldChoices,
  fieldDescription,
  fieldLabel,
  inputAttributes,
  inputValue,
  problemsAt,
  setAt,
} from "..";

describe("fieldLabel and fieldDescription", () => {
  it("should use the field's, then the schema's, then the key", () => {
    expect(
      fieldLabel("a", {
        title: "Schema",
        $edahaField: { title: "Field", text: true },
      }),
    ).toBe("Field");
    expect(
      fieldLabel("a", { title: "Schema", $edahaField: { text: true } }),
    ).toBe("Schema");
    expect(fieldLabel("a", {})).toBe("a");
    expect(
      fieldDescription({
        description: "Schema",
        $edahaField: { description: "Field", text: true },
      }),
    ).toBe("Field");
    expect(fieldDescription({ description: "Schema" })).toBe("Schema");
    expect(fieldDescription({})).toBeUndefined();
  });
});

describe("editorKind", () => {
  it("should give the field's kind, or a map's or list's", () => {
    expect(editorKind({ $edahaField: { textarea: true } })).toBe("textarea");
    expect(editorKind({ type: "object", properties: {} })).toBe("object");
    expect(editorKind({ type: "array", items: {} })).toBe("list");
  });
});

describe("fieldChoices", () => {
  it("should use the field's options, the schema's enum, or its items' enum", () => {
    const options = [{ value: "a", title: "A" }];
    expect(
      fieldChoices({ enum: ["x"], $edahaField: { select: { options } } }),
    ).toBe(options);
    expect(
      fieldChoices({ enum: ["x", 2], $edahaField: { radio: true } }),
    ).toEqual([{ value: "x" }, { value: 2 }]);
    expect(
      fieldChoices({
        type: "array",
        items: { enum: ["y"] },
        $edahaField: { select: { multiple: true } },
      }),
    ).toEqual([{ value: "y" }]);
    expect(fieldChoices({ type: "array" })).toEqual([]);
  });
});

describe("inputAttributes", () => {
  it("should map schema keywords to HTML attributes, with the field's options winning", () => {
    expect(
      inputAttributes({
        type: "string",
        minLength: 1,
        maxLength: 30,
        pattern: "^[a-z]*$",
        $edahaField: {
          text: {
            maxLength: 20,
            placeholder: "a-z",
            list: true,
            multiple: true,
            options: [],
          },
        },
      }),
    ).toEqual({
      minlength: "1",
      maxlength: "20",
      pattern: "^[a-z]*$",
      placeholder: "a-z",
    });
    expect(
      inputAttributes({
        type: "number",
        minimum: 0,
        maximum: 10,
        multipleOf: 2,
        $edahaField: { number: { step: 1, min: null } },
      }),
    ).toEqual({ min: "0", max: "10", step: "1" });
    expect(inputAttributes({ type: "array" })).toEqual({});
  });
});

describe("setAt", () => {
  it("should set a value inside maps and lists without changing the original", () => {
    const original = { a: [1, 2], b: { c: 1 } };
    expect(setAt(original, ["a", "1"], 5)).toEqual({ a: [1, 5], b: { c: 1 } });
    expect(setAt(original, ["b", "d"], 2)).toEqual({
      a: [1, 2],
      b: { c: 1, d: 2 },
    });
    expect(original).toEqual({ a: [1, 2], b: { c: 1 } });
    expect(setAt(undefined, ["x", "y"], 1)).toEqual({ x: { y: 1 } });
    expect(setAt(original, [], 3)).toBe(3);
  });

  it("should leave out a map's key set to undefined", () => {
    expect(setAt({ a: 1, b: 2 }, ["b"], undefined)).toEqual({ a: 1 });
  });
});

describe("inputValue", () => {
  it("should read numbers, checkboxes and text, and nothing for empty text", () => {
    expect(inputValue("number", "3.5")).toBe(3.5);
    expect(inputValue("range", "2")).toBe(2);
    expect(inputValue("checkbox", false)).toBe(false);
    expect(inputValue("text", "hi")).toBe("hi");
    expect(inputValue("text", "")).toBeUndefined();
  });
});

describe("problemsAt", () => {
  it("should give the problems with exactly the value at a path", () => {
    const problems = [
      { path: "a", message: "x", level: "error" as const },
      { path: "a/b", message: "y", level: "error" as const },
    ];
    expect(problemsAt(problems, "a")).toEqual([problems[0]]);
  });
});
