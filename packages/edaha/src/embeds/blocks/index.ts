// Reading and writing embed blocks in article markdown. Has no Node.js imports, so the editor's page can use it too.
import { parse, stringify } from "yaml";

/**
 * Embed blocks in article markdown: `<!-- embed:<key> -->content<!-- /embed:<key> -->`, where the closing tag may leave
 * out the key. Group 1 is the key (undefined for an old `<!-- embed -->` block without one), group 2 the content.
 */
export const EMBED_BLOCK =
  /<!--\s*embed(?::([a-z0-9]+(?:-[a-z0-9]+)*))?\s*-->([\s\S]*?)<!--\s*\/embed(?::\1)?\s*-->/g;

/**
 * An embed block's content without the blank lines around it, so blocks can be written on their own lines. Spaces at
 * the start of its first line are kept (e.g. indented code).
 *
 * @example
 * embedContent("\n  graph TD;\n  A-->B;\n"); // "  graph TD;\n  A-->B;"
 */
export const embedContent = (content: string): string =>
  content.replace(/^(?:[ \t]*\r?\n)+/, "").trimEnd();

/** An embed's options, by name, as set in the embed dialog */
export type EmbedOptionValues = Record<string, unknown>;

/**
 * The options at the start of an embed block: `<!--yaml ... -->` (or `<!--yml`, or `<!--json` for JSON), like an
 * article's config header.
 */
const EMBED_OPTIONS = /^\s*<!--(yaml|yml|json)[ \t]*\r?\n([\s\S]*?)-->/;

/** An embed block's options and content */
export interface EmbedBlockParts {
  /** What is between its tags after its options, without blank lines around it (see embedContent) */
  content: string;
  /** Its options (empty when it has none, or they can't be read) */
  options: EmbedOptionValues;
  /** Why its options can't be read, if they can't */
  optionsError?: string | undefined;
}

/**
 * Split an embed block's text (between its tags) into its options and content.
 *
 * @example
 * splitEmbed("\n<!--yaml\nlayout: large\n-->\nhttps://a.bandcamp.com/album/b\n");
 * // { content: "https://a.bandcamp.com/album/b", options: { layout: "large" } }
 */
export const splitEmbed = (text: string): EmbedBlockParts => {
  const match = EMBED_OPTIONS.exec(text);
  if (!match) return { content: embedContent(text), options: {} };
  const content = embedContent(text.slice(match[0].length));
  let options: unknown;
  try {
    const source = match[2] as string;
    options =
      match[1] === "json"
        ? source.trim()
          ? (JSON.parse(source) as unknown)
          : null
        : (parse(source) as unknown);
  } catch (error) {
    return {
      content,
      options: {},
      optionsError: `The options can't be read: ${(error as Error).message}`,
    };
  }
  if (options === null || options === undefined)
    return { content, options: {} };
  return typeof options === "object" && !Array.isArray(options)
    ? { content, options: options as EmbedOptionValues }
    : {
        content,
        options: {},
        optionsError: "The options must be a map of names to values",
      };
};

/**
 * Write an embed block: on one line for single-line content (e.g. a URL) without options, otherwise with its tags on
 * their own lines, and its options (if any) in YAML before the content.
 *
 * @example
 * embedBlock("youtube", "https://youtu.be/aju_UB5VIf8"); // "<!-- embed:youtube -->https://youtu.be/aju_UB5VIf8<!-- /embed:youtube -->"
 * embedBlock("mermaidjs", "graph TD;\n  A-->B;"); // "<!-- embed:mermaidjs -->\ngraph TD;\n  A-->B;\n<!-- /embed:mermaidjs -->"
 * embedBlock("bandcamp", "https://a.bandcamp.com/album/b", { layout: "large" });
 * // "<!-- embed:bandcamp -->\n<!--yaml\nlayout: large\n-->\nhttps://a.bandcamp.com/album/b\n<!-- /embed:bandcamp -->"
 */
export const embedBlock = (
  key: string,
  content: string,
  options: EmbedOptionValues = {},
): string => {
  const text = embedText(content, options);
  return text.includes("\n")
    ? `<!-- embed:${key} -->\n${text}\n<!-- /embed:${key} -->`
    : `<!-- embed:${key} -->${text}<!-- /embed:${key} -->`;
};

/**
 * What goes between an embed block's tags: its options (if any) in YAML, then its content.
 *
 * @example
 * embedText("https://youtu.be/x"); // "https://youtu.be/x"
 * embedText("https://a.bandcamp.com/album/b", { layout: "large" }); // "<!--yaml\nlayout: large\n-->\nhttps://a.bandcamp.com/album/b"
 */
export const embedText = (
  content: string,
  options: EmbedOptionValues = {},
): string =>
  Object.keys(options).length
    ? `<!--yaml\n${stringify(options)}-->\n${content}`
    : content;
