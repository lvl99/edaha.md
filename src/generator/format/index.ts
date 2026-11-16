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
  /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[`~]*[ \t]*$|(?![\s\S]))|(`+)(?:(?!\2)[\s\S])+?\2(?!`)/gm;

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
