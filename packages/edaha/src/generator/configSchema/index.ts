// The config file's main settings as a JSON Schema with `$edahaField`s, so an app can show them as a form (as the
// editor shows articles' custom metadata and embed options) and check them field by field. Has no Node.js imports, so
// a page can use it too. The config file's own checks (`parseConfig`, `updateConfigFile`) still decide what's valid.
import type { ErrorObject } from "ajv";
import {
  createAjv,
  plainMessage,
  type MetadataProblem,
  type MetadataSchema,
} from "../metadata/index.ts";

/** The config file's main settings' fields: the site's name and description, its website address and its theme */
export const CONFIG_FORM_SCHEMA: MetadataSchema = {
  type: "object",
  required: ["name", "description"],
  properties: {
    name: {
      type: "string",
      $edahaField: { title: "Name", text: true },
    },
    description: {
      type: "string",
      $edahaField: { title: "Description", textarea: true },
    },
    siteUrl: {
      type: "string",
      format: "uri",
      pattern: "^https?://[^/]",
      $edahaField: {
        title: "Website address",
        description:
          "The website's full address, for its feeds, e.g. https://example.com. The SITE_URL environment variable is used instead when it's set.",
        url: true,
      },
    },
    theme: {
      type: "string",
      $edahaField: {
        title: "Theme",
        description:
          "A theme's folder (starting with . or absolute) or an installed theme package's name. Leave it empty for the default theme.",
        text: true,
      },
    },
  },
};

/** The config form's settings that aren't set: empty text means the setting is left out */
const isEmpty = (value: unknown) =>
  value === undefined || (typeof value === "string" && value.trim() === "");

/**
 * A config form's values as config file changes (see `updateConfigFile`): text is trimmed, and an empty optional field
 * removes its setting (`undefined`).
 *
 * @example
 * configFormChanges({ name: " Notes ", siteUrl: "" }); // { name: "Notes", siteUrl: undefined }
 */
export const configFormChanges = (
  values: Readonly<Record<string, unknown>>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      isEmpty(value)
        ? undefined
        : typeof value === "string"
          ? value.trim()
          : value,
    ]),
  );

/** Checks values against the config form's schema (compiled once, when first used) */
let validate:
  | (((values: unknown) => boolean) & { errors?: ErrorObject[] | null })
  | undefined;

/** A problem's message: the website address's pattern (http or https only) reads like its format */
const problemMessage = (error: ErrorObject) =>
  error.keyword === "pattern"
    ? "must be a full web address, e.g. https://example.com"
    : plainMessage(error);

/**
 * Problems with a config form's values, field by field, in plain words (as articles' metadata problems), e.g. a missing
 * name or a website address that isn't a full address. Values are checked as `configFormChanges` gives them, so text
 * that's only spaces is missing, and empty optional fields are fine (their settings are removed).
 *
 * @example
 * configFormProblems({ name: " ", description: "Notes" }); // [{ path: "name", message: "is required", level: "error" }]
 */
export const configFormProblems = (
  values: Readonly<Record<string, unknown>>,
): MetadataProblem[] => {
  validate ??= createAjv().compile(CONFIG_FORM_SCHEMA);
  const changes = configFormChanges(values);
  const set = Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  );
  if (validate(set)) return [];
  const problems = (validate.errors as ErrorObject[]).map((error) => ({
    path:
      (error.params as { missingProperty?: string }).missingProperty ??
      error.instancePath.slice(1),
    message: problemMessage(error),
    level: "error" as const,
  }));
  // One problem per field: the first
  return problems.filter(
    (problem, index) =>
      problems.findIndex(({ path }) => path === problem.path) === index,
  );
};
