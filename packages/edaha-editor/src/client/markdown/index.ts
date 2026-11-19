/**
 * Edits to Markdown text for the Markdown editor's toolbar. Each edit takes the text and its selection and returns the
 * new text and selection, or undefined when there is nothing to change. Where Markdown has no syntax for something
 * (small and big text, details blocks), they write HTML; edaha.md's shortcodes are written as comments.
 */

/** Text and its selection (`start` to `end`; equal when nothing is selected) */
export interface TextEdit {
  value: string;
  start: number;
  end: number;
}

/** The part of a text that changed: replacing `start` to `end` of the old text with `text` gives the new text */
export interface TextChange {
  start: number;
  end: number;
  text: string;
}

/** The read more break */
export const READMORE = "<!-- readmore -->";

/** A selected link, e.g. "[edaha.md](https://example.com)" */
const LINK = /^\[([^\]]*)\]\(([^)\s]*)\)$/;

/** A selected embed, e.g. "<!-- embed -->https://youtu.be/abc<!-- /embed -->" */
const EMBED = /^<!-- embed -->([\s\S]*?)<!-- \/embed -->$/;

/** List markers, removed before another kind of list marker is added */
const LIST_MARKER = /^([-*+]|\d+[.)]) /;

/** Heading markers, removed before another heading level is added */
const HEADING_MARKER = /^#{1,6} /;

/** A table's delimiter row cell, e.g. "---" or ":--:" */
const DELIMITER = /^:?-+:?$/;

/**
 * The part of a text that changed between two versions, found by comparing their starts and ends. Used to replace only
 * that part, which keeps the browser's undo history.
 *
 * @example
 * textChange("Hello world", "Hello **world**"); // { start: 6, end: 11, text: "**world**" }
 */
export const textChange = (from: string, to: string): TextChange => {
  let start = 0;
  const shortest = Math.min(from.length, to.length);
  while (start < shortest && from[start] === to[start]) start++;
  let end = 0;
  while (
    end < shortest - start &&
    from[from.length - 1 - end] === to[to.length - 1 - end]
  )
    end++;
  return {
    start,
    end: from.length - end,
    text: to.slice(start, to.length - end),
  };
};

/** Replace `from` to `to` with `text`, selecting `selectFrom` to `selectTo` of the inserted text */
const replace = (
  value: string,
  from: number,
  to: number,
  text: string,
  selectFrom = 0,
  selectTo = text.length,
): TextEdit => ({
  value: value.slice(0, from) + text + value.slice(to),
  start: from + selectFrom,
  end: from + selectTo,
});

/**
 * The start and end of the whole lines the selection is on. A selection ending just after a line break doesn't include
 * the next line.
 */
const lineBounds = ({ value, start, end }: TextEdit): [number, number] => {
  const from = value.lastIndexOf("\n", start - 1) + 1;
  const endsWithBreak = end > start && value[end - 1] === "\n";
  const lineEnd = value.indexOf("\n", endsWithBreak ? end - 1 : end);
  return [from, lineEnd === -1 ? value.length : lineEnd];
};

/**
 * Wrap the selection in `before` and `after`, e.g. "**" for bold, or unwrap it if it is already wrapped (inside or
 * around the selection). With nothing selected, the placeholder is inserted and selected.
 *
 * @example
 * wrapInline({ value: "Hi there", start: 3, end: 8 }, "**", "**"); // { value: "Hi **there**", start: 5, end: 10 }
 */
export const wrapInline = (
  edit: TextEdit,
  before: string,
  after: string,
  placeholder = "text",
): TextEdit => {
  const { value, start, end } = edit;
  const selected = value.slice(start, end);
  if (
    selected.length >= before.length + after.length &&
    selected.startsWith(before) &&
    selected.endsWith(after)
  )
    return replace(
      value,
      start,
      end,
      selected.slice(before.length, selected.length - after.length),
    );
  if (
    value.slice(start - before.length, start) === before &&
    value.slice(end, end + after.length) === after
  )
    return replace(value, start - before.length, end + after.length, selected);
  const text = selected || placeholder;
  return replace(
    value,
    start,
    end,
    before + text + after,
    before.length,
    before.length + text.length,
  );
};

/**
 * Add a marker to the start of each line the selection is on (blank lines are left alone), or remove it if every line
 * already has it. `isOn` matches the marker; `strip` matches other markers replaced by it (e.g. other heading levels).
 * The marker can depend on the line's number, for numbered lists.
 *
 * @example
 * toggleLines({ value: "Title", start: 0, end: 0 }, /^## /, () => "## ", /^#{1,6} /); // { value: "## Title", ... }
 */
export const toggleLines = (
  edit: TextEdit,
  isOn: RegExp,
  marker: (line: number) => string,
  strip?: RegExp,
): TextEdit => {
  const [from, to] = lineBounds(edit);
  const lines = edit.value.slice(from, to).split("\n");
  const filled = lines.filter((line) => line.trim());
  const on = filled.length > 0 && filled.every((line) => isOn.test(line));
  let count = 0;
  const text = lines
    .map((line) => {
      // A blank line is marked only when it is the only line, to start writing there
      if (!line.trim() && filled.length) return line;
      if (on) return line.replace(isOn, "");
      return marker(count++) + (strip ? line.replace(strip, "") : line);
    })
    .join("\n");
  // A cursor on one line goes to the end of it; a selection selects the changed lines
  return edit.start === edit.end && lines.length === 1
    ? replace(edit.value, from, to, text, text.length)
    : replace(edit.value, from, to, text);
};

/**
 * Wrap the lines the selection is on in an opening and closing line, e.g. a code fence, or unwrap them if they already
 * start and end with them.
 *
 * @example
 * wrapLines({ value: "code", start: 0, end: 0 }, "```", "```"); // { value: "```\ncode\n```", start: 4, end: 8 }
 */
export const wrapLines = (
  edit: TextEdit,
  open: string,
  close: string,
): TextEdit => {
  const [from, to] = lineBounds(edit);
  const block = edit.value.slice(from, to);
  if (
    block.length >= open.length + close.length + 2 &&
    block.startsWith(`${open}\n`) &&
    block.endsWith(`\n${close}`)
  )
    return replace(
      edit.value,
      from,
      to,
      block.slice(open.length + 1, block.length - close.length - 1),
    );
  return replace(
    edit.value,
    from,
    to,
    `${open}\n${block}\n${close}`,
    open.length + 1,
    open.length + 1 + block.length,
  );
};

/**
 * Replace the selection with a block (e.g. a table) on its own, with blank lines around it. The block is selected, or
 * the part of it from `selectFrom` to `selectTo`.
 *
 * @example
 * insertBlock({ value: "Intro", start: 5, end: 5 }, READMORE); // { value: "Intro\n\n<!-- readmore -->", ... }
 */
export const insertBlock = (
  { value, start, end }: TextEdit,
  block: string,
  selectFrom = 0,
  selectTo = block.length,
): TextEdit => {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lead =
    !before || before.endsWith("\n\n")
      ? ""
      : before.endsWith("\n")
        ? "\n"
        : "\n\n";
  const trail =
    !after || after.startsWith("\n\n")
      ? ""
      : after.startsWith("\n")
        ? "\n"
        : "\n\n";
  return replace(
    value,
    start,
    end,
    lead + block + trail,
    lead.length + selectFrom,
    lead.length + selectTo,
  );
};

/**
 * Replace the selection with text, then put the cursor after it.
 *
 * @example
 * insertText({ value: "a  b", start: 2, end: 2 }, "![](cat.png)"); // { value: "a ![](cat.png) b", start: 14, end: 14 }
 */
export const insertText = (
  { value, start, end }: TextEdit,
  text: string,
): TextEdit => replace(value, start, end, text, text.length);

/** The URL of the selected link, if a whole link is selected */
export const selectedLinkUrl = ({ value, start, end }: TextEdit) =>
  LINK.exec(value.slice(start, end))?.[2];

/**
 * Link the selection to a URL, change the selected link's URL, or remove the selected link (an empty URL). Without a
 * selection, the URL is also the link's text.
 *
 * @example
 * setLink({ value: "Read this", start: 5, end: 9 }, "https://example.com"); // "Read [this](https://example.com)"
 */
export const setLink = (edit: TextEdit, url: string): TextEdit | undefined => {
  const { value, start, end } = edit;
  const selected = value.slice(start, end);
  const link = LINK.exec(selected);
  // A link's text is always matched, if empty
  if (!url)
    return link ? replace(value, start, end, link[1] as string) : undefined;
  const text = link ? (link[1] as string) : selected || url;
  return replace(value, start, end, `[${text}](${url})`, 1, 1 + text.length);
};

/**
 * Insert a file at the selection: an image as an image, anything else as a link (on the selected text, or named after
 * the file).
 *
 * @example
 * insertFile({ value: "", start: 0, end: 0 }, "cat.png", "cat.png", true); // "![](cat.png)"
 * insertFile({ value: "", start: 0, end: 0 }, "/news/a/notes.pdf", "notes.pdf", false); // "[notes.pdf](/news/a/notes.pdf)"
 * insertFile({ value: "Read", start: 0, end: 4 }, "notes.pdf", "notes.pdf", false); // "[Read](notes.pdf)"
 */
export const insertFile = (
  edit: TextEdit,
  url: string,
  name: string,
  image: boolean,
): TextEdit => {
  if (image) return insertText(edit, `![](${url})`);
  if (edit.start === edit.end) return insertText(edit, `[${name}](${url})`);
  return setLink(edit, url) as TextEdit;
};

/** The URL of the selected embed, if a whole embed is selected */
export const selectedEmbedUrl = ({ value, start, end }: TextEdit) =>
  EMBED.exec(value.slice(start, end))?.[1];

/**
 * Insert an embed (e.g. a YouTube video) by URL, change the selected embed's URL, or remove it (an empty URL).
 *
 * @example
 * setEmbed({ value: "", start: 0, end: 0 }, "https://youtu.be/abc"); // "<!-- embed -->https://youtu.be/abc<!-- /embed -->"
 */
export const setEmbed = (edit: TextEdit, url: string): TextEdit | undefined => {
  const selected = selectedEmbedUrl(edit) !== undefined;
  if (!url)
    return selected ? replace(edit.value, edit.start, edit.end, "") : undefined;
  const embed = `<!-- embed -->${url}<!-- /embed -->`;
  return selected
    ? replace(edit.value, edit.start, edit.end, embed)
    : insertBlock(edit, embed);
};

/**
 * Remove the selected read more break, or insert one on its own line.
 *
 * @example
 * toggleReadmore({ value: "Intro", start: 5, end: 5 }); // { value: "Intro\n\n<!-- readmore -->", ... }
 */
export const toggleReadmore = (edit: TextEdit): TextEdit =>
  edit.value.slice(edit.start, edit.end).trim() === READMORE
    ? replace(edit.value, edit.start, edit.end, "")
    : insertBlock(edit, READMORE, READMORE.length, READMORE.length);

/** A Markdown table around the cursor */
interface Table {
  /** Where its lines start and end in the text */
  from: number;
  to: number;
  /** Its rows' cells; row 1 is the delimiter row */
  rows: string[][];
  /** The row and column the cursor is in */
  row: number;
  column: number;
}

/** Split a table row into its cells, e.g. "| a | b |" into ["a", "b"] (escaped pipes stay in their cell) */
const tableCells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());

/** Write table rows as Markdown */
const formatTable = (rows: string[][]) =>
  rows.map((cells) => `| ${cells.join(" | ")} |`).join("\n");

/**
 * The Markdown table the cursor is in: lines starting with "|" around it, the second being the delimiter row.
 */
export const tableAt = ({ value, start }: TextEdit): Table | undefined => {
  const lines = value.split("\n");
  // The cursor's line, and where it starts
  const line = value.slice(0, start).split("\n").length - 1;
  const offset = value.lastIndexOf("\n", start - 1) + 1;
  const isRow = (index: number) => lines[index]?.trim().startsWith("|");
  if (!isRow(line)) return undefined;
  let first = line;
  while (first > 0 && isRow(first - 1)) first--;
  let last = line;
  while (isRow(last + 1)) last++;
  const rows = lines.slice(first, last + 1).map(tableCells);
  if (
    rows.length < 2 ||
    !(rows[1] as string[]).every((cell) => DELIMITER.test(cell))
  )
    return undefined;
  const from = lines.slice(0, first).join("\n").length + (first ? 1 : 0);
  const to = from + lines.slice(first, last + 1).join("\n").length;
  // Columns are counted by the pipes before the cursor on its line, after the first
  const beforeCursor = value.slice(offset, start);
  const pipes = beforeCursor.trim().split(/(?<!\\)\|/).length - 1;
  const columns = (rows[0] as string[]).length;
  return {
    from,
    to,
    rows,
    row: line - first,
    column: Math.min(Math.max(pipes - 1, 0), columns - 1),
  };
};

/** Replace a table with new rows, putting the cursor at the end of a cell's text */
const replaceTable = (
  value: string,
  { from, to }: Table,
  rows: string[][],
  row: number,
  column: number,
): TextEdit => {
  const text = formatTable(rows);
  const lineStart = formatTable(rows.slice(0, row)).length + (row ? 1 : 0);
  const cells = rows[row] as string[];
  const cellEnd =
    2 +
    cells
      .slice(0, column)
      .reduce((length, cell) => length + cell.length + 3, 0) +
    (cells[column] as string).length;
  return replace(
    value,
    from,
    to,
    text,
    lineStart + cellEnd,
    lineStart + cellEnd,
  );
};

/** The number of columns new tables have, and their number of rows (including the header row) */
const NEW_TABLE_SIZE = 3;

/**
 * Insert a 3 by 3 table with a header row, putting the cursor in its first header cell.
 *
 * @example
 * insertTable({ value: "", start: 0, end: 0 }).value; // "| Header | Header | Header |\n| --- | --- | --- |\n..."
 */
export const insertTable = (edit: TextEdit): TextEdit => {
  const row = (cell: string) => Array<string>(NEW_TABLE_SIZE).fill(cell);
  const table = formatTable([
    row("Header"),
    row("---"),
    ...Array.from({ length: NEW_TABLE_SIZE - 1 }, () => row("")),
  ]);
  return insertBlock(edit, table, 2, 2 + "Header".length);
};

/**
 * Add an empty row after the cursor's row (after the delimiter row, when in the header).
 */
export const addTableRow = (edit: TextEdit): TextEdit | undefined => {
  const table = tableAt(edit);
  if (!table) return undefined;
  const at = Math.max(table.row + 1, 2);
  const rows = [...table.rows];
  rows.splice(at, 0, Array<string>((rows[0] as string[]).length).fill(""));
  return replaceTable(edit.value, table, rows, at, 0);
};

/**
 * Add an empty column after the cursor's column.
 */
export const addTableColumn = (edit: TextEdit): TextEdit | undefined => {
  const table = tableAt(edit);
  if (!table) return undefined;
  const at = table.column + 1;
  const rows = table.rows.map((cells, r) => {
    const next = [...cells];
    next.splice(at, 0, r === 1 ? "---" : "");
    return next;
  });
  return replaceTable(edit.value, table, rows, table.row, at);
};

/**
 * Remove the cursor's row. The header and delimiter rows can't be removed.
 */
export const removeTableRow = (edit: TextEdit): TextEdit | undefined => {
  const table = tableAt(edit);
  if (!table || table.row < 2) return undefined;
  const rows = table.rows.filter((_, r) => r !== table.row);
  return replaceTable(
    edit.value,
    table,
    rows,
    Math.min(table.row, rows.length - 1),
    table.column,
  );
};

/**
 * Remove the cursor's column, or the whole table if it is the last one.
 */
export const removeTableColumn = (edit: TextEdit): TextEdit | undefined => {
  const table = tableAt(edit);
  if (!table) return undefined;
  if ((table.rows[0] as string[]).length <= 1) return removeTable(edit);
  const rows = table.rows.map((cells) =>
    cells.filter((_, c) => c !== table.column),
  );
  return replaceTable(
    edit.value,
    table,
    rows,
    table.row,
    Math.min(table.column, (rows[0] as string[]).length - 1),
  );
};

/**
 * Remove the table the cursor is in.
 */
export const removeTable = (edit: TextEdit): TextEdit | undefined => {
  const table = tableAt(edit);
  return table ? replace(edit.value, table.from, table.to, "") : undefined;
};

/** Toggle a heading of the given level on the selected lines */
export const toggleHeading = (edit: TextEdit, level: number): TextEdit => {
  const marker = `${"#".repeat(level)} `;
  return toggleLines(
    edit,
    new RegExp(`^${marker}`),
    () => marker,
    HEADING_MARKER,
  );
};

/** Toggle a bullet list on the selected lines */
export const toggleBulletList = (edit: TextEdit): TextEdit =>
  toggleLines(edit, /^[-*+] /, () => "- ", LIST_MARKER);

/** Toggle a numbered list on the selected lines */
export const toggleNumberedList = (edit: TextEdit): TextEdit =>
  toggleLines(edit, /^\d+[.)] /, (line) => `${line + 1}. `, LIST_MARKER);

/** Toggle a quote on the selected lines */
export const toggleQuote = (edit: TextEdit): TextEdit =>
  toggleLines(edit, /^> ?/, () => "> ");
