// Default values and show/hide conditions of editor fields (`$edahaField`), for article metadata and embed options.
// Has no Node.js imports, so the editor's page can use it too.
import type { MetadataSchema } from "../metadata/index.ts";

/** A value a condition compares with */
export type ConditionValue = string | number | boolean | null;

/** Operators comparing a value with one value */
export type ConditionOperator = "=" | "!=" | ">" | ">=" | "<" | "<=";

/** Operators checking whether a value is in a list of values */
export type ConditionListOperator = "in" | "not-in";

/**
 * One condition: a value's path (dot notation from the top of the values, e.g. "credit.name" or "images.0"), an
 * operator, and what it is compared with.
 *
 * @example
 * ["layout", "=", "large"]
 * ["layout", "in", ["slim", "large"]]
 */
export type MatchCondition =
  | readonly [string, ConditionOperator, ConditionValue]
  | readonly [string, ConditionListOperator, readonly ConditionValue[]];

/** Conditions that must all match (`and`), or any of which must match (`or`) */
export type MatchConditionsUnion =
  { readonly and: FieldConditions } | { readonly or: FieldConditions };

/** One group of conditions, or a list of conditions and groups that must all match */
export type MatchConditions = MatchConditionsUnion | readonly FieldConditions[];

/** A field's `showWhen` or `hideWhen`: one condition, or groups of them */
export type FieldConditions = MatchCondition | MatchConditions;

/** The settings `$edahaField` can have besides the field's kind and labels */
export interface EdahaFieldExtensions {
  /** The value used when there is none (also saved by the editor) */
  defaultValue?: ConditionValue | undefined;
  /** Show the field (and keep its value) only when these match */
  showWhen?: FieldConditions | undefined;
  /** Hide the field (and leave out its value) when these match */
  hideWhen?: FieldConditions | undefined;
}

/** Operators comparing with one value */
const OPERATORS = ["=", "!=", ">", ">=", "<", "<="];

/** Operators comparing with a list of values */
const LIST_OPERATORS = ["in", "not-in"];

/** Whether a value can be compared by a condition */
const isConditionValue = (value: unknown): value is ConditionValue =>
  value === null || ["string", "number", "boolean"].includes(typeof value);

/** Whether a value is one condition (rather than a list of groups) */
const isCondition = (value: unknown): value is MatchCondition =>
  Array.isArray(value) && typeof value[0] === "string";

/** Whether conditions are a list of conditions and groups (rather than one condition or group) */
const isConditionList = (
  value: FieldConditions,
): value is readonly FieldConditions[] =>
  Array.isArray(value) && !isCondition(value);

/**
 * Check a field's `showWhen` or `hideWhen` is made of conditions and `and`/`or` groups. Throws an Error naming where
 * the problem is.
 *
 * @example
 * checkConditions({ or: [["layout", "=", "slim"], ["layout", "=", "large"]] }, '"showWhen"');
 */
export const checkConditions = (value: unknown, what: string): void => {
  if (isCondition(value)) {
    const [path, operator, compared] = value as readonly unknown[];
    const valid =
      value.length === 3 &&
      path !== "" &&
      (OPERATORS.includes(operator as string)
        ? isConditionValue(compared)
        : LIST_OPERATORS.includes(operator as string) &&
          Array.isArray(compared) &&
          compared.every(isConditionValue));
    if (!valid)
      throw new Error(
        `${what} must be a condition like ["layout", "=", "large"] (operators: ${[...OPERATORS, ...LIST_OPERATORS].join(" ")}; "in" and "not-in" compare with a list of values), got ${JSON.stringify(value)}`,
      );
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => checkConditions(item, `${what}.${index}`));
    return;
  }
  const keys =
    value && typeof value === "object" ? Object.keys(value) : undefined;
  if (keys?.length !== 1 || !["and", "or"].includes(keys[0] as string))
    throw new Error(
      `${what} must be a condition, or a group with one "and" or "or" list of conditions, got ${JSON.stringify(value)}`,
    );
  checkConditions(
    (value as Record<string, unknown>)[keys[0] as string],
    `${what}.${keys[0] as string}`,
  );
};

/**
 * Check an `$edahaField`'s `defaultValue`, `showWhen` and `hideWhen`. Throws an Error naming where the problem is.
 *
 * @example
 * checkFieldExtensions({ select: true, defaultValue: "large" }, '"metadata.layout.$edahaField"');
 */
export const checkFieldExtensions = (
  field: Record<string, unknown>,
  what: string,
): void => {
  if (field.defaultValue !== undefined && !isConditionValue(field.defaultValue))
    throw new Error(
      `${what}.defaultValue must be text, a number, true, false or null`,
    );
  for (const name of ["showWhen", "hideWhen"])
    if (field[name] !== undefined)
      checkConditions(field[name], `${what}.${name}`);
};

/**
 * The value at a dot path inside values, e.g. "credit.name" or "images.0".
 *
 * @example
 * valueAt({ credit: { name: "Ann" } }, "credit.name"); // "Ann"
 */
export const valueAt = (values: unknown, path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined,
      values,
    );

/** Compare a value with one value: equal (a missing value equals null), or in order (numbers or text only) */
const compare = (
  value: unknown,
  operator: string,
  compared: ConditionValue,
): boolean => {
  const equal = value === compared || (value ?? null) === compared;
  if (operator === "=") return equal;
  if (operator === "!=") return !equal;
  if (
    typeof value !== typeof compared ||
    !["number", "string"].includes(typeof value)
  )
    return false;
  const [a, b] = [value as number, compared as number];
  return operator === ">"
    ? a > b
    : operator === ">="
      ? a >= b
      : operator === "<"
        ? a < b
        : a <= b;
};

/**
 * Whether values match conditions: one condition, `and` (all match) or `or` (any match) groups, or a list (all match).
 *
 * @example
 * matchesConditions({ layout: "slim" }, { or: [["layout", "=", "slim"], ["layout", "=", "large"]] }); // true
 * matchesConditions({ layout: "slim" }, ["layout", "in", ["large"]]); // false
 */
export const matchesConditions = (
  values: unknown,
  conditions: FieldConditions,
): boolean => {
  if (isConditionList(conditions))
    return conditions.every((item) => matchesConditions(values, item));
  if (isCondition(conditions)) {
    const [path, operator, compared] = conditions;
    const value = valueAt(values, path);
    if (operator !== "in" && operator !== "not-in")
      return compare(value, operator, compared as ConditionValue);
    const included = (compared as readonly ConditionValue[]).some((item) =>
      compare(value, "=", item),
    );
    return operator === "in" ? included : !included;
  }
  if ("and" in conditions) return matchesConditions(values, conditions.and);
  const any = conditions.or;
  return isConditionList(any)
    ? any.some((item) => matchesConditions(values, item))
    : matchesConditions(values, any);
};

/**
 * Whether a field shows: its `showWhen` matches (or it has none), and its `hideWhen` doesn't (or it has none).
 *
 * @example
 * fieldShown({ checkbox: true, showWhen: ["layout", "=", "large"] }, { layout: "slim" }); // false
 */
export const fieldShown = (
  field: EdahaFieldExtensions | undefined,
  values: unknown,
): boolean =>
  (!field?.showWhen || matchesConditions(values, field.showWhen)) &&
  !(field?.hideWhen && matchesConditions(values, field.hideWhen));

/** A field in a map of fields, and its path in the values */
interface FieldAt {
  path: string[];
  schema: MetadataSchema;
}

/** Every field in a map of fields, a group (map) before the fields in it; lists' items aren't included */
const fieldsIn = (
  schemas: Record<string, MetadataSchema>,
  parent: string[] = [],
): FieldAt[] =>
  Object.entries(schemas).flatMap(([name, schema]) => {
    const field = { path: [...parent, name], schema };
    return schema.type === "object" && schema.properties
      ? [field, ...fieldsIn(schema.properties, field.path)]
      : [field];
  });

/** Set (or, for undefined, leave out) a value in a map at a path of keys, without changing the original */
const withValueAt = (
  values: Record<string, unknown>,
  [key, ...rest]: string[],
  value: unknown,
): Record<string, unknown> => {
  const current = values[key as string];
  const next = rest.length
    ? withValueAt(
        current && typeof current === "object"
          ? (current as Record<string, unknown>)
          : {},
        rest,
        value,
      )
    : value;
  return next === undefined
    ? Object.fromEntries(
        Object.entries(values).filter(([name]) => name !== key),
      )
    : { ...values, [key as string]: next };
};

/** Values with their fields' defaults and hidden fields applied, and which fields are hidden */
export interface ResolvedFields {
  /** The values: a shown field without a value has its default, and a hidden field's value is left out */
  values: Record<string, unknown>;
  /** The hidden fields' paths, in dot notation, e.g. "credit.name" */
  hidden: Set<string>;
}

/**
 * Apply fields' `defaultValue`, `showWhen` and `hideWhen` to values: shown fields without a value get their default,
 * and hidden fields' values (and those of fields in a hidden group) are left out. Conditions are checked again until
 * nothing changes, as hiding or filling in one value can show or hide another. The values are in the fields' order,
 * then any values without a field.
 *
 * @example
 * resolveFields(
 *   { layout: { type: "string", $edahaField: { select: true, defaultValue: "large" } },
 *     tracklist: { type: "boolean", $edahaField: { checkbox: true, hideWhen: ["layout", "=", "slim"] } } },
 *   { tracklist: true },
 * ); // { values: { layout: "large", tracklist: true }, hidden: Set {} }
 */
export const resolveFields = (
  schemas: Record<string, MetadataSchema>,
  values: Record<string, unknown>,
): ResolvedFields => {
  const fields = fieldsIn(schemas);
  /** The values with some fields hidden, and the others' defaults filled in */
  const apply = (hidden: Set<string>) =>
    fields.reduce((result, { path, schema }) => {
      const key = path.join(".");
      const { defaultValue } = (schema.$edahaField ??
        {}) as EdahaFieldExtensions;
      if (hidden.has(key))
        return valueAt(result, key) === undefined
          ? result
          : withValueAt(result, path, undefined);
      return defaultValue !== undefined && valueAt(result, key) === undefined
        ? withValueAt(result, path, defaultValue)
        : result;
    }, values);
  /** The fields hidden by the conditions, checked on the values (with a hidden group's fields hidden too) */
  const hiddenBy = (current: Record<string, unknown>) =>
    fields.reduce((hidden, { path, schema }) => {
      if (
        hidden.has(path.slice(0, -1).join(".")) ||
        !fieldShown(schema.$edahaField as EdahaFieldExtensions, current)
      )
        hidden.add(path.join("."));
      return hidden;
    }, new Set<string>());
  // Each round starts again from the given values, so a value hidden in one round can show in the next. It stops when
  // the same fields are hidden twice; the limit stops conditions that contradict each other going on forever.
  let hidden = new Set<string>();
  let current = apply(hidden);
  for (let round = 0; round <= fields.length; round++) {
    const next = hiddenBy(current);
    if ([...next].join("\0") === [...hidden].join("\0")) break;
    hidden = next;
    current = apply(hidden);
  }
  // In the fields' order, then any other values
  const order = Object.keys(schemas);
  const ordered = Object.fromEntries(
    Object.entries(current).sort(
      ([a], [b]) =>
        (order.indexOf(a) + 1 || Infinity) - (order.indexOf(b) + 1 || Infinity),
    ),
  );
  return { values: ordered, hidden };
};
