// Reading and writing embed blocks in article markdown. Has no Node.js imports, so the editor's page can use it too.

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

/**
 * Write an embed block: on one line for single-line content (e.g. a URL), otherwise with its tags on their own lines.
 *
 * @example
 * embedBlock("youtube", "https://youtu.be/aju_UB5VIf8"); // "<!-- embed:youtube -->https://youtu.be/aju_UB5VIf8<!-- /embed:youtube -->"
 * embedBlock("mermaidjs", "graph TD;\n  A-->B;"); // "<!-- embed:mermaidjs -->\ngraph TD;\n  A-->B;\n<!-- /embed:mermaidjs -->"
 */
export const embedBlock = (key: string, content: string): string =>
  content.includes("\n")
    ? `<!-- embed:${key} -->\n${content}\n<!-- /embed:${key} -->`
    : `<!-- embed:${key} -->${content}<!-- /embed:${key} -->`;
