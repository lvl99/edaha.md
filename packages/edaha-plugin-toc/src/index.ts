import type {
  EmbedHeading,
  EmbedOptionSchemas,
  EmbedPlugin,
} from "@lvl99dotcom/edaha.md/embeds";
import { escapeHtml } from "@lvl99dotcom/edaha.md/generator/format";
import {
  createMarkdown,
  renderMarkdown,
} from "@lvl99dotcom/edaha.md/generator/markdown";

/** How a level of the table of contents is marked, with the option's title in the embed dialog */
export const LIST_STYLES = {
  number: "Number (1.)",
  "number-depth": "Number with its parents' (1.1.)",
  alpha: "Letter (a.)",
  "number-roman": "Roman numeral (i.)",
  circle: "Circle (∙)",
  disc: "Disc (◦)",
  square: "Square (▪)",
  diamond: "Diamond (⬩)",
} as const;

/** A list style (see LIST_STYLES) */
export type ListStyle = keyof typeof LIST_STYLES;

/** The marks of the list styles that aren't counted */
const BULLETS: Partial<Record<ListStyle, string>> = {
  circle: "∙",
  disc: "◦",
  square: "▪",
  diamond: "⬩",
};

/** The list style of each heading level by default, from `<h1>` to `<h6>` */
export const DEFAULT_LIST_STYLES: readonly ListStyle[] = [
  "number",
  "number-depth",
  "number-depth",
  "alpha",
  "number-roman",
  "circle",
];

/** Roman numerals' values, largest first */
const ROMAN_NUMERALS: readonly [number, string][] = [
  [1000, "m"],
  [900, "cm"],
  [500, "d"],
  [400, "cd"],
  [100, "c"],
  [90, "xc"],
  [50, "l"],
  [40, "xl"],
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
];

/**
 * A positive number in lowercase letters, going on to two letters after z.
 *
 * @example
 * alphaNumber(2); // "b"
 * alphaNumber(28); // "ab"
 */
export const alphaNumber = (position: number): string => {
  let letters = "";
  for (let rest = position; rest > 0; rest = Math.floor((rest - 1) / 26))
    letters = String.fromCharCode(97 + ((rest - 1) % 26)) + letters;
  return letters;
};

/**
 * A positive number in lowercase roman numerals.
 *
 * @example
 * romanNumber(4); // "iv"
 * romanNumber(1994); // "mcmxciv"
 */
export const romanNumber = (position: number): string => {
  let numerals = "";
  let rest = position;
  for (const [value, numeral] of ROMAN_NUMERALS)
    for (; rest >= value; rest -= value) numerals += numeral;
  return numerals;
};

/** A heading in the table of contents, with its marker and the headings under it */
export interface TocItem {
  heading: EmbedHeading;
  /** What it is marked with, e.g. "b.1." or "∙" */
  marker: string;
  /** Whether the marker is only decoration (a bullet), so screen readers skip it */
  bullet: boolean;
  /** What `number-depth` markers under it start with, e.g. "b.1" (a bullet passes on its parent's) */
  prefix: string;
  children: TocItem[];
}

/**
 * A heading's marker in its list style, from its position among the headings beside it and its parent's prefix (see
 * TocItem).
 *
 * @example
 * tocMarker("number-depth", 2, "b"); // { marker: "b.2.", bullet: false, prefix: "b.2" }
 * tocMarker("circle", 2, "b"); // { marker: "∙", bullet: true, prefix: "b" }
 */
export const tocMarker = (
  style: ListStyle,
  position: number,
  parentPrefix: string,
): Pick<TocItem, "marker" | "bullet" | "prefix"> => {
  const bullet = BULLETS[style];
  if (bullet) return { marker: bullet, bullet: true, prefix: parentPrefix };
  const own =
    style === "alpha"
      ? alphaNumber(position)
      : style === "number-roman"
        ? romanNumber(position)
        : style === "number-depth" && parentPrefix
          ? `${parentPrefix}.${position}`
          : String(position);
  return { marker: `${own}.`, bullet: false, prefix: own };
};

/**
 * Nest headings by their level, each under the nearest heading before it with a lower level (so a skipped level adds
 * no empty item), marked in their level's list style.
 *
 * @param styles - the list style of each level, from `<h1>` to `<h6>`
 * @example
 * tocTree([{ level: 2, text: "A", id: "a" }, { level: 4, text: "B", id: "b" }], DEFAULT_LIST_STYLES);
 * // [{ heading: A, marker: "1.", ..., children: [{ heading: B, marker: "a.", ... }] }]
 */
export const tocTree = (
  headings: readonly EmbedHeading[],
  styles: readonly ListStyle[],
): TocItem[] => {
  const root: TocItem[] = [];
  const parents: TocItem[] = [];
  for (const heading of headings) {
    while ((parents.at(-1)?.heading.level ?? 0) >= heading.level) parents.pop();
    const parent = parents.at(-1);
    const siblings = parent?.children ?? root;
    const item: TocItem = {
      heading,
      ...tocMarker(
        styles[heading.level - 1] ?? "number",
        siblings.length + 1,
        parent?.prefix ?? "",
      ),
      children: [],
    };
    siblings.push(item);
    parents.push(item);
  }
  return root;
};

/**
 * Nested ordered lists of links to headings. Markers are text, so they are the same in every browser; `role="list"`
 * keeps the list's meaning for screen readers that drop it from lists without CSS markers.
 *
 * @example
 * tocList(tocTree([{ level: 2, text: "A", id: "a" }], DEFAULT_LIST_STYLES));
 * // '<ol role="list"><li><span class="toc-marker">1.</span> <a href="#a">A</a></li></ol>'
 */
export const tocList = (items: readonly TocItem[]): string =>
  items.length
    ? `<ol role="list">${items
        .map(
          ({ heading, marker, bullet, children }) =>
            `<li><span class="toc-marker"${bullet ? ' aria-hidden="true"' : ""}>${marker}</span> <a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.text)}</a>${tocList(children)}</li>`,
        )
        .join("")}</ol>`
    : "";

/** The list style options, `level1` to `level6`, with their defaults */
const OPTIONS: EmbedOptionSchemas = Object.fromEntries(
  DEFAULT_LIST_STYLES.map((style, i) => [
    `level${i + 1}`,
    {
      title: `Level ${i + 1} list style`,
      description: `How headings of level ${i + 1} (<h${i + 1}>) are marked`,
      type: "string",
      enum: Object.keys(LIST_STYLES),
      $edahaField: {
        select: {
          options: Object.entries(LIST_STYLES).map(([value, title]) => ({
            value,
            title,
          })),
        },
        defaultValue: style,
      },
    },
  ]),
);

/** Renders the Markdown written in a block, above its list */
const markdown = createMarkdown();

/** The block's own Markdown, rendered (relative URLs are left as they are, as the article's URL isn't known) */
const introHtml = (content: string) =>
  content.trim() ? renderMarkdown(markdown, content, "") : "";

/** Lists indented by level, with their markers in front of the links */
const STYLE = `<style>
  .embed-toc ol { list-style: none; margin: 0; padding-left: 1.5em; }
  .embed-toc nav > ol { padding-left: 0; }
  .embed-toc li { margin: 0.25em 0; }
  .embed-toc .toc-marker { font-variant-numeric: tabular-nums; }
</style>`;

/** A table of contents, as the editor's icon */
const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" aria-hidden="true"><path d="M120-280v-80h560v80H120Zm0-160v-80h560v80H120Zm0-160v-80h560v80H120Zm680 320q-17 0-28.5-11.5T760-320q0-17 11.5-28.5T800-360q17 0 28.5 11.5T840-320q0 17-11.5 28.5T800-280Zm0-160q-17 0-28.5-11.5T760-480q0-17 11.5-28.5T800-520q17 0 28.5 11.5T840-480q0 17-11.5 28.5T800-440Zm0-160q-17 0-28.5-11.5T760-640q0-17 11.5-28.5T800-680q17 0 28.5 11.5T840-640q0 17-11.5 28.5T800-600Z"/></svg>';

/**
 * A table of contents of the article's headings (not its title, nor headings in embed blocks), as nested ordered
 * lists of links, under the block's own Markdown (if any):
 *
 * ```
 * <!-- embed:toc -->
 * <!--yaml
 * level2: number
 * -->
 * ## Contents
 * <!-- /embed:toc -->
 * ```
 *
 * Headings nest by level, and each level is marked in its own list style (options `level1` to `level6`; see
 * LIST_STYLES and DEFAULT_LIST_STYLES). The editor's embed frames don't show the article, so they show a note instead.
 *
 * @example
 * await toc.build.render("", { headings: [{ level: 2, text: "A", id: "a" }], options: { level2: "number" }, ... });
 * // '<nav aria-label="Table of contents"><ol role="list"><li><span class="toc-marker">1.</span> <a href="#a">A</a></li></ol></nav>'
 */
export const toc = {
  key: "toc",
  name: "Table of contents",
  description: "A table of contents of the article's headings.",
  info: "Optional; Markdown shown above the table of contents, e.g. a heading",
  contentOptional: true,
  options: OPTIONS,
  build: {
    render: async (content, { headings, options }) => {
      const styles = DEFAULT_LIST_STYLES.map(
        (style, i) => (options[`level${i + 1}`] as ListStyle) ?? style,
      );
      const list = tocList(tocTree(headings, styles));
      return (
        introHtml(content) +
        (list ? `<nav aria-label="Table of contents">${list}</nav>` : "")
      );
    },
    renderHead: async () => STYLE,
  },
  editor: {
    icon: ICON,
    render: async (content) =>
      `${introHtml(content)}<p><em>Table of contents: the article's headings are listed here on the website.</em></p>`,
  },
} satisfies EmbedPlugin;

export default toc;
