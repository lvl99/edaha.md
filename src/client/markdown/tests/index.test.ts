import { describe, expect, it } from "vitest";
import {
  addTableColumn,
  addTableRow,
  insertBlock,
  insertTable,
  insertText,
  READMORE,
  removeTable,
  removeTableColumn,
  removeTableRow,
  selectedEmbedUrl,
  selectedLinkUrl,
  setEmbed,
  setLink,
  tableAt,
  textChange,
  toggleBulletList,
  toggleHeading,
  toggleNumberedList,
  toggleQuote,
  toggleReadmore,
  wrapInline,
  wrapLines,
  type TextEdit,
} from "..";

/**
 * Text with its selection marked by "«" and "»", or a cursor marked by "‸", e.g. "Hi «there»" or "Hi ‸there".
 */
const marked = (text: string): TextEdit => {
  const cursor = text.indexOf("‸");
  if (cursor !== -1)
    return { value: text.replace("‸", ""), start: cursor, end: cursor };
  const start = text.indexOf("«");
  const end = text.indexOf("»") - 1;
  return { value: text.replace("«", "").replace("»", ""), start, end };
};

/** Mark an edit's selection like `marked` does */
const mark = (edit: TextEdit | undefined) => {
  if (!edit) return edit;
  const { value, start, end } = edit;
  return start === end
    ? `${value.slice(0, start)}‸${value.slice(start)}`
    : `${value.slice(0, start)}«${value.slice(start, end)}»${value.slice(end)}`;
};

/** The table used by the table tests, with the cursor in the cell "b" */
const TABLE = "Intro\n\n| A | B |\n| --- | --- |\n| a | b‸ |\n\nEnd";

describe("textChange", () => {
  it("should find the changed part between two texts", () => {
    expect(textChange("Hello world", "Hello **world**")).toEqual({
      start: 6,
      end: 11,
      text: "**world**",
    });
    expect(textChange("aaa", "aa")).toEqual({ start: 2, end: 3, text: "" });
    expect(textChange("same", "same")).toEqual({ start: 4, end: 4, text: "" });
    expect(textChange("", "new")).toEqual({ start: 0, end: 0, text: "new" });
  });
});

describe("wrapInline", () => {
  it("should wrap the selection, or a placeholder when nothing is selected", () => {
    expect(mark(wrapInline(marked("Hi «there»"), "**", "**"))).toBe(
      "Hi **«there»**",
    );
    expect(mark(wrapInline(marked("Hi ‸"), "_", "_"))).toBe("Hi _«text»_");
    expect(
      mark(wrapInline(marked("«Hi»"), "<small>", "</small>", "small")),
    ).toBe("<small>«Hi»</small>");
  });

  it("should unwrap a selection that is wrapped inside or around", () => {
    expect(mark(wrapInline(marked("Hi «**there**»"), "**", "**"))).toBe(
      "Hi «there»",
    );
    expect(mark(wrapInline(marked("Hi **«there»**"), "**", "**"))).toBe(
      "Hi «there»",
    );
  });
});

describe("toggleLines", () => {
  it("should add and remove headings, replacing other levels", () => {
    expect(mark(toggleHeading(marked("Ti‸tle"), 2))).toBe("## Title‸");
    expect(mark(toggleHeading(marked("## Ti‸tle"), 2))).toBe("Title‸");
    expect(mark(toggleHeading(marked("## Ti‸tle"), 3))).toBe("### Title‸");
    expect(mark(toggleHeading(marked("‸"), 2))).toBe("## ‸");
  });

  it("should add and remove list markers and quotes on each selected line, leaving blank lines", () => {
    expect(mark(toggleBulletList(marked("Before\n«one\n\ntwo»\nAfter")))).toBe(
      "Before\n«- one\n\n- two»\nAfter",
    );
    expect(mark(toggleBulletList(marked("«- one\n- two»")))).toBe("«one\ntwo»");
    expect(mark(toggleNumberedList(marked("«- one\n- two»")))).toBe(
      "«1. one\n2. two»",
    );
    expect(mark(toggleNumberedList(marked("«1. one\n2. two»")))).toBe(
      "«one\ntwo»",
    );
    expect(mark(toggleQuote(marked("«one\n»two")))).toBe("«> one»\ntwo");
    expect(mark(toggleQuote(marked("«> one\n>two»")))).toBe("«one\ntwo»");
  });
});

describe("wrapLines", () => {
  it("should wrap the selected lines in an opening and closing line, or unwrap them", () => {
    expect(mark(wrapLines(marked("a\nb‸c\nd"), "```", "```"))).toBe(
      "a\n```\n«bc»\n```\nd",
    );
    expect(mark(wrapLines(marked("‸"), "```", "```"))).toBe("```\n‸\n```");
    expect(mark(wrapLines(marked("«```\nbc\n```»"), "```", "```"))).toBe(
      "«bc»",
    );
    expect(
      mark(
        wrapLines(
          marked("«Hidden»"),
          "<details>\n<summary>Summary</summary>\n",
          "\n</details>",
        ),
      ),
    ).toBe("<details>\n<summary>Summary</summary>\n\n«Hidden»\n\n</details>");
  });
});

describe("insertBlock and insertText", () => {
  it("should insert a block with blank lines around it", () => {
    expect(mark(insertBlock(marked("Intro‸"), "Block"))).toBe(
      "Intro\n\n«Block»",
    );
    expect(mark(insertBlock(marked("Intro\n‸\nEnd"), "Block"))).toBe(
      "Intro\n\n«Block»\n\nEnd",
    );
    expect(mark(insertBlock(marked("Intro\n\n‸\n\nEnd"), "Block"))).toBe(
      "Intro\n\n«Block»\n\nEnd",
    );
    expect(mark(insertBlock(marked("‸End"), "Block"))).toBe("«Block»\n\nEnd");
  });

  it("should replace the selection with text, putting the cursor after it", () => {
    expect(mark(insertText(marked("a «b» c"), "![](cat.png)"))).toBe(
      "a ![](cat.png)‸ c",
    );
  });
});

describe("links", () => {
  it("should link the selection, or the URL itself", () => {
    expect(mark(setLink(marked("Read «this»"), "https://x.com"))).toBe(
      "Read [«this»](https://x.com)",
    );
    expect(mark(setLink(marked("Go ‸"), "https://x.com"))).toBe(
      "Go [«https://x.com»](https://x.com)",
    );
  });

  it("should change or remove a selected link", () => {
    const link = marked("Read «[this](https://x.com)»");
    expect(selectedLinkUrl(link)).toBe("https://x.com");
    expect(mark(setLink(link, "https://y.com"))).toBe(
      "Read [«this»](https://y.com)",
    );
    expect(mark(setLink(link, ""))).toBe("Read «this»");
    expect(setLink(marked("Read «this»"), "")).toBeUndefined();
    expect(selectedLinkUrl(marked("Read «this»"))).toBeUndefined();
  });
});

describe("embeds and read more", () => {
  const embed = "<!-- embed -->https://youtu.be/abc<!-- /embed -->";

  it("should insert, change and remove embeds", () => {
    expect(setEmbed(marked("Intro‸"), "https://youtu.be/abc")?.value).toBe(
      `Intro\n\n${embed}`,
    );
    const selected = marked(`«${embed}»`);
    expect(selectedEmbedUrl(selected)).toBe("https://youtu.be/abc");
    expect(setEmbed(selected, "https://youtu.be/def")?.value).toBe(
      "<!-- embed -->https://youtu.be/def<!-- /embed -->",
    );
    expect(setEmbed(selected, "")?.value).toBe("");
    expect(setEmbed(marked("‸"), "")).toBeUndefined();
  });

  it("should insert a read more break, or remove a selected one", () => {
    expect(mark(toggleReadmore(marked("Intro‸")))).toBe(
      `Intro\n\n${READMORE}‸`,
    );
    expect(mark(toggleReadmore(marked(`a\n\n«${READMORE}»\n\nb`)))).toBe(
      "a\n\n‸\n\nb",
    );
  });
});

describe("tables", () => {
  it("should insert a 3 by 3 table with a header row", () => {
    expect(mark(insertTable(marked("‸")))).toBe(
      [
        "| «Header» | Header | Header |",
        "| --- | --- | --- |",
        "|  |  |  |",
        "|  |  |  |",
      ].join("\n"),
    );
  });

  it("should find the table and cell the cursor is in", () => {
    const table = tableAt(marked(TABLE));
    expect(table).toMatchObject({
      rows: [
        ["A", "B"],
        ["---", "---"],
        ["a", "b"],
      ],
      row: 2,
      column: 1,
    });
    expect(TABLE.replace("‸", "").slice(table!.from, table!.to)).toBe(
      "| A | B |\n| --- | --- |\n| a | b |",
    );
    expect(tableAt(marked("‸Intro\n\n| A | B |"))).toBeUndefined();
    // A table needs its delimiter row
    expect(tableAt(marked("| A | B |\n| a | b‸ |"))).toBeUndefined();
    expect(tableAt(marked("‸| A |\n| --- |"))).toMatchObject({
      row: 0,
      column: 0,
    });
  });

  it("should add rows after the cursor's row, or after the delimiter row in the header", () => {
    expect(mark(addTableRow(marked(TABLE)))).toBe(
      "Intro\n\n| A | B |\n| --- | --- |\n| a | b |\n| ‸ |  |\n\nEnd",
    );
    expect(addTableRow(marked("| A‸ |\n| --- |\n| a |"))?.value).toBe(
      "| A |\n| --- |\n|  |\n| a |",
    );
  });

  it("should add columns after the cursor's column", () => {
    expect(mark(addTableColumn(marked(TABLE)))).toBe(
      "Intro\n\n| A | B |  |\n| --- | --- | --- |\n| a | b | ‸ |\n\nEnd",
    );
  });

  it("should remove the cursor's row, but not the header or delimiter rows", () => {
    expect(mark(removeTableRow(marked(TABLE)))).toBe(
      "Intro\n\n| A | B |\n| --- | ---‸ |\n\nEnd",
    );
    expect(removeTableRow(marked("| A‸ |\n| --- |"))).toBeUndefined();
  });

  it("should remove the cursor's column, or the table with its last column", () => {
    expect(mark(removeTableColumn(marked(TABLE)))).toBe(
      "Intro\n\n| A |\n| --- |\n| a‸ |\n\nEnd",
    );
    expect(mark(removeTableColumn(marked("x\n| A‸ |\n| --- |")))).toBe("x\n‸");
  });

  it("should remove the table", () => {
    expect(mark(removeTable(marked(TABLE)))).toBe("Intro\n\n‸\n\nEnd");
  });

  it("should do nothing outside a table", () => {
    for (const edit of [
      addTableRow,
      addTableColumn,
      removeTableRow,
      removeTableColumn,
      removeTable,
    ])
      expect(edit(marked("‸Intro"))).toBeUndefined();
  });
});
