import TurndownService from "turndown";
import { EMBED_BLOCK } from "../../embeds/index.ts";
import { READMORE } from "../../generator/article/index.ts";
import {
  escapeHtml,
  replaceOutsideCode,
} from "../../generator/format/index.ts";
import {
  createMarkdown,
  renderMarkdown,
} from "../../generator/markdown/index.ts";

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
 * Convert article markdown to HTML for the editor: `<!-- readmore -->` becomes `<hr class="readmore">`,
 * embed blocks become `<div class="embed">URL</div>` (except in code), and relative URLs point at the editor's file URL.
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
        source,
        READMORE,
        () => '\n\n<hr class="readmore">\n\n',
      ),
      EMBED_BLOCK,
      ([, url]) =>
        `\n\n<div class="embed">${escapeHtml((url as string).trim())}</div>\n\n`,
    ),
    baseUrl,
  );

/** HTML to markdown converter with rules for the readmore and embed blocks */
const createTurndown = () => {
  const turndown = new TurndownService({
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
  turndown.addRule("embed", {
    filter: (node) =>
      node.nodeName === "DIV" &&
      (node as HTMLElement).classList.contains("embed"),
    replacement: (_, node) =>
      `\n\n<!-- embed -->${String(node.textContent).trim()}<!-- /embed -->\n\n`,
  });
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
