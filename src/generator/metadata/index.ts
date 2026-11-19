import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import { fullFormats } from "ajv-formats/dist/formats.js";
import { isRelativeUrl } from "../format/index.ts";

/** The kinds of field the editor can show for a metadata value (the key under `$edahaField` that configures it) */
export const FIELD_KINDS = [
  "text",
  "email",
  "url",
  "tel",
  "color",
  "date",
  "time",
  "datetime-local",
  "number",
  "range",
  "textarea",
  "select",
  "checkbox",
  "radio",
  "file",
] as const;

/** A kind of field the editor can show */
export type FieldKind = (typeof FIELD_KINDS)[number];

/** A choice in a select or radio field */
export interface FieldChoice {
  value: string | number | boolean;
  title?: string | undefined;
  description?: string | undefined;
}

/**
 * How the editor shows a metadata value (`$edahaField`): an optional label, description and extra information, and
 * exactly one field kind, set to `true` or to its options (e.g. `{ file: { accept: "image/*" } }`).
 */
export interface EdahaField {
  title?: string | undefined;
  description?: string | undefined;
  info?: string | undefined;
  [kind: string]: unknown;
}

/** A custom metadata field's JSON Schema, with `$edahaField` saying how the editor shows it */
export interface MetadataSchema {
  title?: string | undefined;
  description?: string | undefined;
  type?: string | string[] | undefined;
  properties?: Record<string, MetadataSchema> | undefined;
  items?: MetadataSchema | undefined;
  required?: string[] | undefined;
  enum?: unknown[] | undefined;
  $edahaField?: EdahaField | undefined;
  [keyword: string]: unknown;
}

/** Custom metadata fields' schemas, by the key their values are stored under in articles */
export type MetadataDefinitions = Record<string, MetadataSchema>;

/** The settings every article has, which custom metadata can't use as keys */
export const CORE_FIELDS = [
  "type",
  "status",
  "date",
  "title",
  "template",
  "author",
  "excerpt",
  "thumbnail",
  "attachments",
  "tags",
];

/** A problem with an article's metadata: an invalid value (an error) or a setting that isn't used (a warning) */
export interface MetadataProblem {
  /** The value's path, e.g. "featured" or "images/2" */
  path: string;
  message: string;
  level: "error" | "warning";
}

/** Metadata keys: a letter or underscore, then letters, digits, underscores or hyphens */
const KEY = /^[A-Za-z_][\w-]*$/;

/** Check a value is a map (not a list), throwing an Error naming it if not */
const asMap = (value: unknown, what: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${what} must be a map of settings`);
  return value as Record<string, unknown>;
};

/**
 * The kind of field an `$edahaField` configures.
 *
 * @example
 * fieldKind({ title: "Image", file: { accept: "image/*" } }); // "file"
 */
export const fieldKind = (field: EdahaField): FieldKind =>
  FIELD_KINDS.find((kind) => kind in field) as FieldKind;

/**
 * A field kind's options, e.g. `{ accept: "image/*" }` for `{ file: { accept: "image/*" } }` (none for `true`).
 */
export const fieldOptions = (field: EdahaField): Record<string, unknown> => {
  const options = field[fieldKind(field)];
  return options && typeof options === "object"
    ? (options as Record<string, unknown>)
    : {};
};

/**
 * Check a schema has editor fields: objects need properties, lists need items (or one field for the whole list), and
 * every value has an `$edahaField` with exactly one field kind. Throws an Error naming the schema's path.
 */
const checkFields = (schema: unknown, path: string): void => {
  const fields = asMap(schema, `"${path}"`);
  if (fields.type === "object") {
    const properties = asMap(fields.properties, `"${path}.properties"`);
    for (const [name, property] of Object.entries(properties))
      checkFields(property, `${path}.properties.${name}`);
    return;
  }
  // A list is edited item by item, unless one field edits it all (e.g. a select with `multiple`)
  if (fields.type === "array" && fields.$edahaField === undefined) {
    checkFields(fields.items, `${path}.items`);
    return;
  }
  const field = asMap(fields.$edahaField, `"${path}.$edahaField"`);
  const kinds = FIELD_KINDS.filter((kind) => kind in field);
  if (kinds.length !== 1)
    throw new Error(
      `"${path}.$edahaField" must have exactly one field kind (${FIELD_KINDS.join(", ")}), not ${kinds.length ? kinds.join(" and ") : "none"}`,
    );
};

/**
 * An ajv instance for metadata schemas: every error reported, formats like `uri` and `email` checked, and `$edahaField`
 * allowed beside JSON Schema's own keywords.
 */
export const createAjv = (): Ajv => {
  const ajv = new Ajv({ allErrors: true, strict: false, formats: fullFormats });
  ajv.addKeyword({ keyword: "$edahaField", schemaType: "object" });
  return ajv;
};

/**
 * Read the config file's `metadata` setting: a map of keys to JSON Schemas with `$edahaField`s. Throws an Error if a
 * key is a core field's name or isn't a usable name, or a schema has no editor fields or can't be compiled.
 *
 * @example
 * parseMetadata({ featured: { type: "string", $edahaField: { file: { accept: "image/*" } } } });
 */
export const parseMetadata = (value: unknown): MetadataDefinitions => {
  if (value === undefined || value === null) return {};
  const definitions = asMap(value, '"metadata"');
  const ajv = createAjv();
  for (const [key, schema] of Object.entries(definitions)) {
    if (CORE_FIELDS.includes(key))
      throw new Error(
        `"metadata.${key}" can't be used: "${key}" is a core setting of every article`,
      );
    if (!KEY.test(key))
      throw new Error(
        `"metadata.${key}" must start with a letter or "_" and have only letters, digits, "_" and "-"`,
      );
    checkFields(schema, `metadata.${key}`);
    try {
      ajv.compile(schema as object);
    } catch (error) {
      throw new Error(
        `"metadata.${key}" isn't a valid JSON Schema: ${(error as Error).message}`,
        { cause: error },
      );
    }
  }
  return definitions as MetadataDefinitions;
};

/**
 * The custom metadata fields an article type uses: those its `metadata` setting lists, none for `false`, or all when
 * it has none.
 *
 * @example
 * typeMetadataKeys({ featured: {...}, images: {...} }, ["featured"]); // ["featured"]
 */
export const typeMetadataKeys = (
  definitions: MetadataDefinitions,
  typeMetadata: string[] | false | undefined,
): string[] =>
  typeMetadata === undefined
    ? Object.keys(definitions)
    : typeMetadata === false
      ? []
      : typeMetadata;

/** An ajv error as a problem with a value */
const problem = (key: string, error: ErrorObject): MetadataProblem => ({
  path: key + error.instancePath,
  // ajv always describes its errors
  message: error.message as string,
  level: "error",
});

/**
 * Validates articles' custom metadata values against their schemas, compiling each schema once.
 *
 * @example
 * const validator = new MetadataValidator(config.metadata);
 * validator.validate("featured", 3); // [{ path: "featured", message: "must be string", level: "error" }]
 */
export class MetadataValidator {
  private readonly ajv = createAjv();

  private readonly compiled = new Map<string, ValidateFunction>();

  /** The custom metadata fields' schemas, by key */
  readonly definitions: MetadataDefinitions;

  constructor(definitions: MetadataDefinitions) {
    this.definitions = definitions;
  }

  /** The problems with a value of a custom metadata field (none if it's valid) */
  validate(key: string, value: unknown): MetadataProblem[] {
    let validate = this.compiled.get(key);
    if (!validate) {
      validate = this.ajv.compile(this.definitions[key] as object);
      this.compiled.set(key, validate);
    }
    if (validate(value)) return [];
    // A value that isn't valid always has errors
    return (validate.errors as ErrorObject[]).map((error) =>
      problem(key, error),
    );
  }
}

/** An article's custom metadata: every value its type uses, and the problems found */
export interface ArticleMetadata {
  /** The values of the custom fields the article's type uses (valid or not), by key */
  values: Record<string, unknown>;
  /** Invalid values (errors), and settings the type doesn't use or nobody defined (warnings) */
  problems: MetadataProblem[];
}

/**
 * Read an article's custom metadata from its settings: validate the values of the fields its type uses, and warn about
 * values of fields its type doesn't use and settings that aren't core or defined.
 *
 * @param typeLabel - the type's plural label, for warnings, e.g. "News"
 *
 * @example
 * articleMetadata({ date, featured: "a.png", oops: 1 }, ["featured"], validator, "News");
 * // { values: { featured: "a.png" }, problems: [{ path: "oops", message: "isn't a known setting", level: "warning" }] }
 */
export const articleMetadata = (
  settings: Record<string, unknown>,
  keys: string[],
  validator: MetadataValidator,
  typeLabel: string,
): ArticleMetadata => {
  const values: Record<string, unknown> = {};
  const problems: MetadataProblem[] = [];
  for (const [key, value] of Object.entries(settings)) {
    if (CORE_FIELDS.includes(key)) continue;
    if (keys.includes(key)) {
      values[key] = value;
      problems.push(...validator.validate(key, value));
    } else
      problems.push({
        path: key,
        message:
          key in validator.definitions
            ? `isn't used by ${typeLabel}`
            : "isn't a known setting",
        level: "warning",
      });
  }
  return { values, problems };
};

/**
 * Make a value's file fields' relative file names into paths on the website (like `thumbnail`), following its
 * schema's objects and lists.
 *
 * @example
 * resolveFileFields({ $edahaField: { file: true } }, "photo.png", "/news/hello/"); // "/news/hello/photo.png"
 */
export const resolveFileFields = (
  schema: MetadataSchema,
  value: unknown,
  articleUrl: string,
): unknown => {
  if (Array.isArray(value) && schema.items)
    return value.map((item) =>
      resolveFileFields(schema.items as MetadataSchema, item, articleUrl),
    );
  if (value && typeof value === "object" && schema.properties)
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => {
        const property = schema.properties?.[name];
        return [
          name,
          property ? resolveFileFields(property, item, articleUrl) : item,
        ];
      }),
    );
  return typeof value === "string" &&
    schema.$edahaField &&
    "file" in schema.$edahaField &&
    isRelativeUrl(value)
    ? articleUrl + value
    : value;
};

/**
 * An article's custom metadata for templates (`article.meta`): its type's valid values, with file fields as paths on
 * the website. Values with errors are left out.
 */
export const templateMetadata = (
  metadata: ArticleMetadata,
  definitions: MetadataDefinitions,
  articleUrl: string,
): Record<string, unknown> => {
  const invalid = new Set(
    metadata.problems
      .filter((problem) => problem.level === "error")
      .map((problem) => problem.path.split("/")[0]),
  );
  return Object.fromEntries(
    Object.entries(metadata.values)
      .filter(([key]) => !invalid.has(key))
      .map(([key, value]) => [
        key,
        resolveFileFields(
          definitions[key] as MetadataSchema,
          value,
          articleUrl,
        ),
      ]),
  );
};

/** Check a map key is used only for keys listed, for the type's `metadata` setting */
export const parseTypeMetadata = (
  value: unknown,
  what: string,
): string[] | false | undefined => {
  if (value === undefined || value === null) return undefined;
  if (value === false) return false;
  if (!Array.isArray(value) || value.some((key) => typeof key !== "string"))
    throw new Error(
      `${what} must be a list of metadata keys, or false for none`,
    );
  return value as string[];
};
