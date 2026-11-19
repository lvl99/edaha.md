import type { MetadataDefinitions } from "../metadata/index.ts";

/** A group of settings in the editor, as the config file's `metadataGroups` defines it */
export interface MetadataGroupConfig {
  /** The group's heading */
  title: string;
  /** Shown above the group's fields */
  description?: string | undefined;
  /** The group it comes after (by default, groups go at the end) */
  after?: string | undefined;
  /** Whether the group starts open. Default: false */
  openedByDefault: boolean;
}

/** A group of settings in the editor: its heading, and its fields' keys in order */
export interface MetadataGroup {
  key: string;
  title: string;
  description?: string | undefined;
  openedByDefault: boolean;
  /** Its core and custom fields' keys, in order ("uploaded" is the article folder's files) */
  fields: string[];
}

/**
 * The editor's own groups, in order, with their core settings. "slug" and "uploaded" (the files in the article's
 * folder) aren't settings, but have their place too. Custom fields without a group go in "custom".
 */
export const BUILT_IN_GROUPS: readonly MetadataGroup[] = [
  {
    key: "info",
    title: "Info",
    openedByDefault: true,
    fields: ["type", "status", "slug", "date", "author"],
  },
  {
    key: "categorise",
    title: "Categorise",
    openedByDefault: false,
    fields: ["tags"],
  },
  {
    key: "customise",
    title: "Customise",
    openedByDefault: true,
    fields: ["excerpt", "template"],
  },
  {
    key: "files",
    title: "Files",
    openedByDefault: true,
    fields: ["thumbnail", "attachments", "uploaded"],
  },
  { key: "custom", title: "Custom", openedByDefault: false, fields: [] },
];

/** The settings a custom group can have */
const GROUP_KEYS = ["title", "description", "after", "openedByDefault"];

/** Group keys: a letter, then letters, digits, "_" or "-" */
const KEY = /^[A-Za-z][\w-]*$/;

/** Check a value is a map (not a list), throwing an Error naming it if not */
const asMap = (value: unknown, what: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${what} must be a map of settings`);
  return value as Record<string, unknown>;
};

/** Read an optional text setting, throwing an Error naming it if it isn't text */
const optionalText = (value: unknown, what: string): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${what} must be non-empty text`);
  return value.trim();
};

/**
 * Read the config file's `metadataGroups` setting: groups of settings for the editor, by key. Throws an Error if a key
 * is a built-in group's or isn't usable, or a group's settings aren't valid.
 *
 * @example
 * parseMetadataGroups({ seo: { title: "SEO", after: "info", openedByDefault: true } });
 */
export const parseMetadataGroups = (
  value: unknown,
): Record<string, MetadataGroupConfig> => {
  if (value === undefined || value === null) return {};
  const groups = asMap(value, '"metadataGroups"');
  return Object.fromEntries(
    Object.entries(groups).map(([key, settings]) => {
      const what = `"metadataGroups.${key}"`;
      if (BUILT_IN_GROUPS.some((group) => group.key === key))
        throw new Error(`${what} can't be used: "${key}" is a built-in group`);
      if (!KEY.test(key))
        throw new Error(
          `${what} must start with a letter and have only letters, digits, "_" and "-"`,
        );
      const fields = asMap(settings, what);
      const unknown = Object.keys(fields).filter(
        (name) => !GROUP_KEYS.includes(name),
      );
      if (unknown.length)
        throw new Error(
          `${what} has unknown settings: ${unknown.map((name) => `"${name}"`).join(", ")}`,
        );
      const opened = fields.openedByDefault ?? false;
      if (typeof opened !== "boolean")
        throw new Error(`${what}.openedByDefault must be true or false`);
      return [
        key,
        {
          title:
            optionalText(fields.title, `${what}.title`) ??
            fail(`${what}.title is required`),
          description: optionalText(fields.description, `${what}.description`),
          after: optionalText(fields.after, `${what}.after`),
          openedByDefault: opened,
        },
      ];
    }),
  );
};

/** Throw an Error with a message */
const fail = (message: string): never => {
  throw new Error(message);
};

/** Where a custom field goes: its group's key, and the field it follows, if any */
interface FieldPlace {
  key: string;
  after?: string | undefined;
}

/**
 * Where a custom field's `$edahaField.group` puts it: a group key, or `{ key, after }`. Fields without one go in
 * "custom". Throws an Error naming the field if it isn't valid.
 */
const fieldPlace = (name: string, group: unknown): FieldPlace => {
  const what = `"metadata.${name}.$edahaField.group"`;
  if (group === undefined || group === null) return { key: "custom" };
  if (typeof group === "string") return { key: group };
  const place = asMap(group, what);
  return {
    key:
      optionalText(place.key, `${what}.key`) ?? fail(`${what}.key is required`),
    after: optionalText(place.after, `${what}.after`),
  };
};

/**
 * Put items in order: those without `after` in the order given, then each after the one it names. Throws an Error
 * (from `missing`) for an item whose `after` names nothing in the list.
 */
const placeAfter = (
  start: string[],
  items: { name: string; after?: string | undefined }[],
  missing: (name: string, after: string) => string,
): string[] => {
  const order = [...start, ...items.filter((i) => !i.after).map((i) => i.name)];
  let waiting = items.filter((i) => i.after);
  // Each pass places the items whose `after` is already placed, until none are left or none can be
  while (waiting.length) {
    const ready = waiting.filter((i) => order.includes(i.after as string));
    if (!ready.length) {
      const [first] = waiting as [(typeof waiting)[number]];
      throw new Error(missing(first.name, first.after as string));
    }
    for (const { name, after } of ready)
      order.splice(order.indexOf(after as string) + 1, 0, name);
    waiting = waiting.filter((i) => !ready.includes(i));
  }
  return order;
};

/**
 * The editor's groups of settings in order, each with its fields in order: the built-in groups (and the custom groups,
 * placed after the group they name or at the end), with every custom field in its group (after the field it names, or
 * at the group's end). Throws an Error if a field's group doesn't exist, or a field or group names one to follow that
 * isn't there.
 *
 * @example
 * metadataLayout({ hero: { $edahaField: { group: { key: "files", after: "thumbnail" }, file: true } } }, {});
 * // [..., { key: "files", fields: ["thumbnail", "hero", "attachments", "uploaded"], ... }, ...]
 */
export const metadataLayout = (
  definitions: MetadataDefinitions,
  groups: Record<string, MetadataGroupConfig>,
): MetadataGroup[] => {
  const all: MetadataGroup[] = [
    ...BUILT_IN_GROUPS.map((group) => ({
      ...group,
      fields: [...group.fields],
    })),
    ...Object.entries(groups).map(([key, group]) => ({
      key,
      title: group.title,
      description: group.description,
      openedByDefault: group.openedByDefault,
      fields: [],
    })),
  ];
  const byKey = new Map(all.map((group) => [group.key, group]));

  // Each group's custom fields, in the config file's order
  const placed = new Map<string, { name: string; after?: string }[]>();
  for (const [name, schema] of Object.entries(definitions)) {
    const place = fieldPlace(name, schema.$edahaField?.group);
    if (!byKey.has(place.key))
      throw new Error(
        `"metadata.${name}" is in group "${place.key}", which isn't a built-in group or in "metadataGroups"`,
      );
    placed.set(place.key, [
      ...(placed.get(place.key) ?? []),
      { name, after: place.after },
    ]);
  }
  for (const group of all)
    group.fields = placeAfter(
      group.fields,
      placed.get(group.key) ?? [],
      (name, after) =>
        `"metadata.${name}" comes after "${after}", which isn't in group "${group.key}"`,
    );

  const order = placeAfter(
    BUILT_IN_GROUPS.map((group) => group.key),
    Object.entries(groups).map(([key, group]) => ({
      name: key,
      after: group.after,
    })),
    (name, after) =>
      `"metadataGroups.${name}" comes after "${after}", which isn't a group`,
  );
  return order.map((key) => byKey.get(key) as MetadataGroup);
};
