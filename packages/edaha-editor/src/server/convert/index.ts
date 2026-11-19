import TurndownService from "turndown";
import {
  EMBED_BLOCK,
  embedBlock,
  embedContent,
} from "@lvl99dotcom/edaha.md/embeds";
import { READMORE } from "@lvl99dotcom/edaha.md/generator/article";
import {
  escapeHtml,
  rawHtml,
  replaceOutsideCode,
  replaceRawBlocks,
} from "@lvl99dotcom/edaha.md/generator/format";
import {
  createMarkdown,
  renderMarkdown,
} from "@lvl99dotcom/edaha.md/generator/markdown";

// Without typographer, so text converts back to the same markdown
const markdown = createMarkdown({ typographer: false });

/**
 * The URL the editor loads an article's files from, e.g. "/files/article/hello/".
 *
 * @example
 * filesUrl("article", "hello"); // "/files/article/hello/"
 */
export const filesUrl = (type: string, slug: string): string =>
  `/files/${type}/${slug}/`;

/**
 * An embed block as editor HTML: an empty `<div class="embed">` with its key (empty for an old block without one) and
 * content in attributes. Line breaks in the content are written as `&#10;`, so the HTML is one line that Markdown
 * keeps whole.
 *
 * @example
 * embedHtml("mermaidjs", "graph TD;\n  A-->B;"); // '<div class="embed" data-embed="mermaidjs" data-content="graph TD;&#10;  A--&gt;B;"></div>'
 */
export const embedHtml = (key: string, content: string): string =>
  `<div class="embed" data-embed="${escapeHtml(key)}" data-content="${escapeHtml(content).replace(/\r?\n/g, "&#10;")}"></div>`;

/**
 * Convert article markdown to HTML for the editor: `<!-- readmore -->` becomes `<hr class="readmore">`,
 * embed blocks become `<div class="embed" data-embed="key" data-content="...">` (except in code; see embedHtml), raw
 * blocks become `<pre class="raw">` or
 * `<span class="raw">` holding their content as it is, and relative URLs point at the editor's file URL.
 *
 * @example
 * markdownToEditorHtml("Intro <!-- readmore -->Rest", "/files/article/hello/");
 * // '<p>Intro</p>\n<hr class="readmore">\n<p>Rest</p>\n'
 */
export const markdownToEditorHtml = (source: string, baseUrl: string): string =>
  renderMarkdown(
    markdown,
    replaceOutsideCode(
      replaceOutsideCode(
        // Spaces in raw text are non-breaking while it is edited, so the editor keeps repeated ones
        replaceRawBlocks(source, (raw) =>
          rawHtml(
            raw.block
              ? raw
              : { ...raw, content: raw.content.replace(/ /g, "\u00a0") },
          ),
        ),
        READMORE,
        () => '\n\n<hr class="readmore">\n\n',
      ),
      EMBED_BLOCK,
      ([, key, content]) =>
        `\n\n${embedHtml(key ?? "", embedContent(content as string))}\n\n`,
    ),
    baseUrl,
  );

/** Whether a node is an embed block (see embedHtml) */
const isEmbed = (node: Node): boolean =>
  node.nodeName === "DIV" && (node as HTMLElement).classList.contains("embed");

/** An embed block's Markdown, from its editor HTML (see embedHtml) */
const embedMarkdown = (_: string, node: Node): string => {
  const element = node as HTMLElement;
  const key = element.getAttribute("data-embed") ?? "";
  const content = embedContent(element.getAttribute("data-content") ?? "");
  // An old block without a key is kept as it was, until a kind of embed is chosen for it
  return `\n\n${key ? embedBlock(key, content) : `<!-- embed -->${content}<!-- /embed -->`}\n\n`;
};

/** HTML to markdown converter with rules for the readmore and embed blocks */
const createTurndown = () => {
  const turndown = new TurndownService({
    // Other empty blocks are left out, as Turndown does by default
    blankReplacement: (content, node) =>
      isEmbed(node)
        ? embedMarkdown(content, node)
        : (node as { isBlock?: boolean }).isBlock
          ? "\n\n"
          : "",
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    hr: "---",
  });
  turndown.addRule("readmore", {
    filter: (node) =>
      node.nodeName === "HR" &&
      (node as HTMLElement).classList.contains("readmore"),
    replacement: () => "\n\n<!-- readmore -->\n\n",
  });
  // Raw blocks are written back as they are, without escaping
  turndown.addRule("raw", {
    filter: (node) =>
      (node.nodeName === "PRE" || node.nodeName === "SPAN") &&
      (node as HTMLElement).classList.contains("raw"),
    replacement: (_, node) =>
      node.nodeName === "PRE"
        ? `\n\n<!-- raw -->\n${String(node.textContent)}\n<!-- /raw -->\n\n`
        : `<!-- raw -->${String(node.textContent).replace(/\u00a0/g, " ")}<!-- /raw -->`,
  });
  // Embed blocks are empty, which Turndown passes to `blankReplacement` rather than its rules
  turndown.addRule("embed", { filter: isEmbed, replacement: embedMarkdown });
  // Small and big text, and collapsible details blocks, stay HTML. A details block's summary stays HTML (Markdown
  // isn't read inside an HTML line) and its content becomes Markdown, between blank lines so it is read as Markdown.
  turndown.addRule("smallBig", {
    // `big` isn't in the DOM types' list of tag names, as HTML no longer recommends it
    filter: (node) => node.nodeName === "SMALL" || node.nodeName === "BIG",
    replacement: (content, node) => {
      const tag = node.nodeName.toLowerCase();
      return `<${tag}>${content}</${tag}>`;
    },
  });
  turndown.addRule("summary", { filter: "summary", replacement: () => "" });
  turndown.addRule("details", {
    filter: "details",
    replacement: (content, node) => {
      const summary = Array.from(node.childNodes).find(
        (child) => child.nodeName === "SUMMARY",
      ) as HTMLElement | undefined;
      return `\n\n<details>\n<summary>${summary?.innerHTML.trim() ?? ""}</summary>\n\n${content.trim()}\n\n</details>\n\n`;
    },
  });
  // List items with a single space after the marker ("- item", "1. item")
  turndown.addRule("listItem", {
    filter: "li",
    replacement: (content, node) => {
      const parent = node.parentNode as HTMLElement;
      const index = Array.prototype.indexOf.call(parent.children, node);
      const start = Number(parent.getAttribute("start") ?? 1);
      const prefix = parent.nodeName === "OL" ? `${start + index}. ` : "- ";
      const text = content
        .replace(/^\n+/, "")
        .replace(/\n+$/, "")
        // Indent continuation lines under the marker, leaving blank lines empty
        .replace(/\n(?!\n)/g, `\n${" ".repeat(prefix.length)}`);
      return `${prefix}${text}${node.nextSibling ? "\n" : ""}`;
    },
  });
  // Tables as GFM tables: the first row is the header row. Cells are kept to one line.
  turndown.addRule("tableCell", {
    filter: ["th", "td"],
    replacement: (content) =>
      `| ${content
        .trim()
        .replace(/\s*\n+\s*/g, " ")
        .replace(/\|/g, "\\|")} `,
  });
  turndown.addRule("tableRow", {
    filter: "tr",
    replacement: (content, node) => {
      const row = `${content}|\n`;
      const table = (node as HTMLElement).closest("table") as HTMLTableElement;
      if (table.rows[0] !== node) return row;
      const separator = Array.from(
        (node as HTMLTableRowElement).cells,
        () => "| --- ",
      ).join("");
      return `${row}${separator}|\n`;
    },
  });
  turndown.addRule("tableSection", {
    filter: ["thead", "tbody", "tfoot"],
    replacement: (content) => content,
  });
  turndown.addRule("table", {
    filter: "table",
    replacement: (content) => `\n\n${content.trim()}\n\n`,
  });
  // Column widths from the editor aren't kept
  turndown.remove("colgroup");
  return turndown;
};

const turndown = createTurndown();

/**
 * Convert editor HTML back to article markdown, turning the readmore and embed blocks back into their shortcodes and
 * the editor's file URLs back into relative URLs.
 *
 * @example
 * editorHtmlToMarkdown('<p>Hi</p><hr class="readmore"><p><img src="/files/article/a/b.png"></p>', "/files/article/a/");
 * // "Hi\n\n<!-- readmore -->\n\n![](b.png)"
 */
export const editorHtmlToMarkdown = (html: string, baseUrl: string): string =>
  turndown
    .turndown(html)
    .replaceAll(`](${baseUrl}`, "](")
    // Turndown escapes "1." at the start of a line, which is only needed outside headings
    .replace(/^(#+ \d+)\\\./gm, "$1.")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
