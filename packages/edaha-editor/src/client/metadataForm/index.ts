import {
  fieldKind,
  fieldOptions,
  hasFieldKind,
  type EdahaField,
  type FieldChoice,
  type FieldKind,
  type MetadataProblem,
  type MetadataSchema,
} from "@lvl99dotcom/edaha.md/generator/metadata";

/**
 * A metadata value's label: its field's title, its schema's title, or its key.
 *
 * @example
 * fieldLabel("featured", { title: "Featured Image", $edahaField: { file: true } }); // "Featured Image"
 */
export const fieldLabel = (key: string, schema: MetadataSchema): string =>
  schema.$edahaField?.title ?? schema.title ?? key;

/** A metadata value's description: its field's, or its schema's */
export const fieldDescription = (schema: MetadataSchema): string | undefined =>
  schema.$edahaField?.description ?? schema.description;

/**
 * How a value is edited: the kind of its field, "object" for a map of fields, "list" for a list edited item by item.
 */
export const editorKind = (
  schema: MetadataSchema,
): FieldKind | "object" | "list" => {
  if (hasFieldKind(schema.$edahaField))
    return fieldKind(schema.$edahaField as EdahaField);
  return schema.type === "object" ? "object" : "list";
};

/**
 * The choices of a select or radio field: its own `options`, or its schema's `enum` (its items' for a whole list).
 *
 * @example
 * fieldChoices({ enum: ["a", "b"], $edahaField: { select: true } }); // [{ value: "a" }, { value: "b" }]
 */
export const fieldChoices = (schema: MetadataSchema): FieldChoice[] => {
  const options = schema.$edahaField ? fieldOptions(schema.$edahaField) : {};
  if (Array.isArray(options.options)) return options.options as FieldChoice[];
  const values = schema.enum ?? schema.items?.enum ?? [];
  return values.map((value) => ({ value: value as FieldChoice["value"] }));
};

/** Field options that are the input's HTML attributes under another name */
const ATTRIBUTE_NAMES: Record<string, string> = {
  minLength: "minlength",
  maxLength: "maxlength",
};

/** JSON Schema keywords that become the input's HTML attributes */
const SCHEMA_ATTRIBUTES: Record<string, string> = {
  minLength: "minlength",
  maxLength: "maxlength",
  pattern: "pattern",
  minimum: "min",
  maximum: "max",
  multipleOf: "step",
};

/** Field options that aren't HTML attributes */
const NOT_ATTRIBUTES = ["options", "list", "multiple"];

/**
 * A field's HTML attributes: from its schema's keywords (e.g. `minimum` becomes `min`), then its own options (e.g.
 * `accept`, `step`, `rows`), which win.
 *
 * @example
 * inputAttributes({ type: "number", maximum: 10, $edahaField: { number: { step: 1 } } }); // { max: "10", step: "1" }
 */
export const inputAttributes = (
  schema: MetadataSchema,
): Record<string, string> => {
  const attributes: Record<string, string> = {};
  for (const [keyword, attribute] of Object.entries(SCHEMA_ATTRIBUTES))
    if (schema[keyword] !== undefined)
      attributes[attribute] = String(schema[keyword]);
  const options = schema.$edahaField ? fieldOptions(schema.$edahaField) : {};
  for (const [name, value] of Object.entries(options))
    if (!NOT_ATTRIBUTES.includes(name) && value !== undefined && value !== null)
      attributes[ATTRIBUTE_NAMES[name] ?? name.toLowerCase()] = String(value);
  return attributes;
};

/**
 * Set a value inside another at a path of keys and list positions, without changing the original. Setting undefined
 * leaves out a map's key.
 *
 * @example
 * setAt({ a: [1, 2] }, ["a", "1"], 5); // { a: [1, 5] }
 * setAt({ a: 1, b: 2 }, ["b"], undefined); // { a: 1 }
 */
export const setAt = (
  root: unknown,
  path: string[],
  value: unknown,
): unknown => {
  const [key, ...rest] = path;
  if (key === undefined) return value;
  if (Array.isArray(root)) {
    const list = [...(root as unknown[])];
    list[Number(key)] = setAt(list[Number(key)], rest, value);
    return list;
  }
  const map = { ...(root && typeof root === "object" ? root : {}) } as Record<
    string,
    unknown
  >;
  const next = setAt(map[key], rest, value);
  return Object.fromEntries(
    Object.entries({ ...map, [key]: next }).filter(
      ([, item]) => item !== undefined,
    ),
  );
};

/**
 * Read an input's value for a field kind: numbers as numbers, checkboxes as true or false, and other text as text
 * (undefined when empty, so the value is left out).
 *
 * @example
 * inputValue("number", "3.5"); // 3.5
 * inputValue("text", ""); // undefined
 */
export const inputValue = (
  kind: FieldKind,
  input: string | boolean,
): unknown => {
  if (typeof input === "boolean") return input;
  if (input === "") return undefined;
  return kind === "number" || kind === "range" ? Number(input) : input;
};

/**
 * The values a checkbox saves: its `value` option when checked and nothing when not (e.g. `{ checkbox: { value:
 * "none" } }`), or true and false.
 *
 * @example
 * checkboxValues({ $edahaField: { checkbox: { value: "none" } } }); // { checked: "none", unchecked: undefined }
 * checkboxValues({ $edahaField: { checkbox: true } }); // { checked: true, unchecked: false }
 */
export const checkboxValues = (
  schema: MetadataSchema,
): { checked: unknown; unchecked: unknown } => {
  const { value } = schema.$edahaField ? fieldOptions(schema.$edahaField) : {};
  return value === undefined
    ? { checked: true, unchecked: false }
    : { checked: value, unchecked: undefined };
};

/** A colour written with or without its "#", e.g. "0687f5" or "#0687F5" */
const COLOUR = /^#?([0-9a-f]{6})$/i;

/**
 * A colour field's value as its input shows it: with a "#" (e.g. "0687f5" as "#0687f5"), or empty when it isn't a
 * colour.
 *
 * @example
 * colourInputValue("0687F5"); // "#0687f5"
 */
export const colourInputValue = (value: unknown): string => {
  const match = COLOUR.exec(String(value ?? ""));
  return match ? `#${(match[1] as string).toLowerCase()}` : "";
};

/**
 * A colour chosen in a colour field, written like the field's value (or default) was: without a "#" if it had none.
 *
 * @example
 * colourValue("#051c2c", "ffffff"); // "051c2c"
 * colourValue("#051c2c", undefined); // "#051c2c"
 */
export const colourValue = (input: string, current: unknown): string =>
  typeof current === "string" && /^[0-9a-f]{6}$/i.test(current)
    ? input.replace(/^#/, "")
    : input;

/** The problems with exactly the value at a path */
export const problemsAt = (
  problems: MetadataProblem[],
  path: string,
): MetadataProblem[] => problems.filter((problem) => problem.path === path);
