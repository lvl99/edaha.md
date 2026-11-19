/** Units for human-readable file sizes */
const SIZE_UNITS = ["bytes", "KB", "MB", "GB"];

/**
 * Format a number of bytes as a human-readable size (1 KB = 1024 bytes).
 *
 * @example
 * formatBytes(204800); // "200 KB"
 * formatBytes(2621440); // "2.5 MB"
 */
export const formatBytes = (bytes: number): string => {
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < SIZE_UNITS.length - 1) {
    size /= 1024;
    unit++;
  }
  const rounded = unit === 0 ? size : Math.round(size * 10) / 10;
  return `${rounded} ${SIZE_UNITS[unit]}`;
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Format an ISO 8601 date as a human-readable date (UTC).
 *
 * @example
 * formatDate("2026-10-19T09:54:00.000Z"); // "19 October 2026"
 */
export const formatDate = (iso: string): string =>
  DATE_FORMAT.format(new Date(iso));

/**
 * Format an ISO 8601 date for RSS feeds (RFC 822).
 *
 * @example
 * formatRfc822("2026-10-19T09:54:00.000Z"); // "Mon, 19 Oct 2026 09:54:00 GMT"
 */
export const formatRfc822 = (iso: string): string =>
  new Date(iso).toUTCString();

/**
 * Escape text for use in HTML content or attribute values.
 *
 * @example
 * escapeHtml('<a href="x">'); // "&lt;a href=&quot;x&quot;&gt;"
 */
export const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Named HTML entities decoded by `stripHtml` */
const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Convert HTML to plain text: remove tags, decode common entities and collapse whitespace.
 *
 * @example
 * stripHtml("<p>Fish &amp; <em>chips</em></p>"); // "Fish & chips"
 */
export const stripHtml = (html: string): string =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (code[0] === "#") {
        const point =
          code[1] === "x" || code[1] === "X"
            ? parseInt(code.slice(2), 16)
            : parseInt(code.slice(1), 10);
        return String.fromCodePoint(point);
      }
      return ENTITIES[code.toLowerCase()] ?? entity;
    })
    .replace(/\s+/g, " ")
    .trim();

/**
 * Crop text to a maximum length, ending at a word boundary where possible, and add an ellipsis if it was cropped.
 *
 * @example
 * cropText("Hello wonderful world", 15); // "Hello wonderful…"
 */
export const cropText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  // Include the next character, so a word ending exactly at the limit is kept whole
  const lastSpace = text.slice(0, maxLength + 1).lastIndexOf(" ");
  const cropped =
    lastSpace > 0 ? text.slice(0, lastSpace) : text.slice(0, maxLength);
  return `${cropped.trimEnd()}…`;
};

/**
 * Whether a URL is relative to the current folder (not absolute, root-relative or a fragment).
 *
 * @example
 * isRelativeUrl("thumb.jpg"); // true
 * isRelativeUrl("https://example.com/a.jpg"); // false
 * isRelativeUrl("/news/"); // false
 */
export const isRelativeUrl = (url: string): boolean =>
  url !== "" && !/^([a-z][a-z0-9+.-]*:|\/|#|\?)/i.test(url);

/**
 * Fenced code blocks (``` or ~~~, to their closing fence or the end of the text) and inline code spans in Markdown
 */
const MARKDOWN_CODE =
  /^ {0,3}(?<fence>`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\k<fence>[`~]*[ \t]*$|(?![\s\S]))|(?<ticks>`+)(?:(?!\k<ticks>)[\s\S])+?\k<ticks>(?!`)/gm;

/**
 * Blank out Markdown's code blocks and inline code with spaces, keeping every other character where it was, so
 * markers like `<!-- readmore -->` can be found outside code only.
 *
 * @example
 * maskCode("Intro `<!-- readmore -->` rest"); // "Intro                      rest"
 */
export const maskCode = (markdown: string): string =>
  markdown.replace(MARKDOWN_CODE, (code) => " ".repeat(code.length));

/**
 * Replace a pattern's matches in Markdown, except in code blocks and inline code. The replacer gets each match as
 * `exec` gives it (from the original text, groups included).
 *
 * @example
 * replaceOutsideCode("a <!-- x --> `<!-- x -->`", /<!-- x -->/g, () => "X"); // "a X `<!-- x -->`"
 */
export const replaceOutsideCode = (
  markdown: string,
  pattern: RegExp,
  replacer: (match: RegExpExecArray) => string,
): string => {
  const single = new RegExp(pattern.source, pattern.flags.replace("g", ""));
  let result = "";
  let last = 0;
  for (const { index, 0: text } of maskCode(markdown).matchAll(
    new RegExp(single.source, `${single.flags}g`),
  )) {
    const match = single.exec(markdown.slice(index, index + text.length));
    result += markdown.slice(last, index) + replacer(match as RegExpExecArray);
    last = index + text.length;
  }
  return result + markdown.slice(last);
};

/** A `<!-- raw -->...<!-- /raw -->` block, whose content is shown exactly as it is written */
export const RAW_BLOCK =
  /<!--\s*raw\s*-->(?<rawContent>[\s\S]*?)<!--\s*\/raw\s*-->/;

/**
 * Raw blocks and code, whichever starts first: code can show raw markers as they are, and raw blocks can hold code
 */
const RAW_OR_CODE = new RegExp(
  `(?<raw>${RAW_BLOCK.source})|${MARKDOWN_CODE.source}`,
  "gm",
);

/** A raw block's content, and whether it is a block (on its own lines) or inline (within a line) */
export interface RawContent {
  content: string;
  block: boolean;
}

/**
 * Replace every raw block outside code in Markdown. A raw block on its own lines is a block, without the line breaks
 * after its opening and before its closing marker; one within a line is inline.
 *
 * @example
 * replaceRawBlocks("<!-- raw -->\n*a*\n<!-- /raw -->", ({ content }) => content); // "*a*"
 */
export const replaceRawBlocks = (
  markdown: string,
  replacer: (raw: RawContent) => string,
): string =>
  markdown.replace(RAW_OR_CODE, (...args: unknown[]) => {
    const match = args[0] as string;
    const groups = args.at(-1) as Record<string, string | undefined>;
    if (groups.raw === undefined) return match;
    const offset = args.at(-3) as number;
    const block =
      /(?:^|\n)[ \t]*$/.test(markdown.slice(0, offset)) &&
      /^[ \t]*(?:\r?\n|$)/.test(markdown.slice(offset + match.length));
    const content = groups.rawContent as string;
    return replacer({
      block,
      content: block
        ? content.replace(/^[ \t]*\r?\n/, "").replace(/\r?\n[ \t]*$/, "")
        : content,
    });
  });

/**
 * The HTML that shows a raw block's content exactly as it is written: in `<pre class="raw">` for a block (which keeps
 * its spaces and line breaks whatever the stylesheet), or `<span class="raw">` inline, on one line. Line breaks and punctuation are written as character references, so
 * Markdown, shortcodes and typography never act on it.
 *
 * @example
 * rawHtml({ content: "*a*", block: false }); // '<span class="raw">&#42;a&#42;</span>'
 */
export const rawHtml = ({ content, block }: RawContent): string => {
  const tag = block ? "pre" : "span";
  const text = content
    .replace(/\r\n?/g, "\n")
    .replace(/[\n!-/:-@[-`{-~]/g, (char) => `&#${char.charCodeAt(0)};`);
  const html = `<${tag} class="raw">${text}</${tag}>`;
  return block ? `\n\n${html}\n\n` : html;
};
