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

/** The problems with exactly the value at a path */
export const problemsAt = (
  problems: MetadataProblem[],
  path: string,
): MetadataProblem[] => problems.filter((problem) => problem.path === path);
