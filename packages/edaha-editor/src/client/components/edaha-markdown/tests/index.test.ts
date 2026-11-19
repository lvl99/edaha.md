// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "..";
import type { EdahaMarkdown } from "..";
import type { EmbedValue } from "../../../embeds";
import {
  button,
  chooseFile,
  find,
  input,
  mount,
  settle,
} from "../../../../shared/tests/helpers";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

/** A Markdown editor with text, a selection, and answers for its URL prompts */
const setup = async (
  value = "Hello world",
  [start, end] = [6, 11],
  answers: (string | null)[] = [],
) => {
  const element = await mount<EdahaMarkdown>("edaha-markdown", {
    value,
    textareaId: "field-body",
  });
  element.prompt = vi.fn(() => (answers.length ? answers.shift()! : null));
  textarea(element).setSelectionRange(start, end);
  return element;
};

/** The editor's text box */
const textarea = (element: EdahaMarkdown) =>
  find<HTMLTextAreaElement>(element, "textarea");

/** Click a toolbar button and wait for the editor to render */
const press = async (element: EdahaMarkdown, label: string) => {
  button(element, label).click();
  await element.updateComplete;
};

describe("edaha-markdown", () => {
  it("should show the text in a labelled text box and fire markdown-change when it is typed", async () => {
    const element = await setup();
    const onChange = vi.fn();
    element.addEventListener("markdown-change", onChange);
    expect(textarea(element).id).toBe("field-body");
    expect(textarea(element).value).toBe("Hello world");
    input(textarea(element), "Hello there");
    expect(element.value).toBe("Hello there");
    expect(onChange).toHaveBeenCalledOnce();
    // The same text again isn't a change
    input(textarea(element), "Hello there");
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("should have the rich text editor's buttons, with icons, named for screen readers and tooltips", async () => {
    const element = await setup();
    const buttons = [
      ...element.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'),
    ];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual([
      "Bold",
      "Italic",
      "Small",
      "Big",
      "Link",
      "Heading",
      "Subheading",
      "Bullet list",
      "Numbered list",
      "Quote",
      "Code",
      "Details",
      "Image URL",
      "Table",
      "Add row",
      "Add column",
      "Remove row",
      "Remove column",
      "Remove table",
      "Embed",
      "Raw",
      "Read more",
      "Choose file",
    ]);
    for (const b of buttons) {
      expect(b.title).toBe(b.textContent?.trim());
      expect(b.querySelector(".icon svg")).not.toBeNull();
    }
  });

  it("should format the selection from the toolbar, selecting the result", async () => {
    const cases: [string, string][] = [
      ["Bold", "Hello **world**"],
      ["Italic", "Hello _world_"],
      ["Small", "Hello <small>world</small>"],
      ["Big", "Hello <big>world</big>"],
      ["Heading", "## Hello world"],
      ["Subheading", "### Hello world"],
      ["Bullet list", "- Hello world"],
      ["Numbered list", "1. Hello world"],
      ["Quote", "> Hello world"],
      ["Code", "```\nHello world\n```"],
      [
        "Details",
        "<details>\n<summary>Summary</summary>\n\nHello world\n\n</details>",
      ],
      ["Raw", "<!-- raw -->\nHello world\n<!-- /raw -->"],
      ["Read more", "Hello \n\n<!-- readmore -->"],
    ];
    for (const [label, expected] of cases) {
      const element = await setup();
      const onChange = vi.fn();
      element.addEventListener("markdown-change", onChange);
      await press(element, label);
      expect(element.value, label).toBe(expected);
      expect(textarea(element).value).toBe(expected);
      expect(onChange).toHaveBeenCalledOnce();
      element.remove();
    }
    const element = await setup();
    await press(element, "Bold");
    const { selectionStart, selectionEnd } = textarea(element);
    expect(element.value.slice(selectionStart, selectionEnd)).toBe("world");
    // Again unwraps it
    await press(element, "Bold");
    expect(element.value).toBe("Hello world");
  });

  it("should add, change and remove links and images by URL", async () => {
    const element = await setup(
      "Hello world",
      [6, 11],
      ["https://example.com", null, ""],
    );
    await press(element, "Link");
    expect(element.value).toBe("Hello [world](https://example.com)");
    textarea(element).setSelectionRange(6, element.value.length);
    // Cancelling changes nothing
    await press(element, "Link");
    expect(element.prompt).toHaveBeenLastCalledWith(
      "Link URL (empty to remove)",
      "https://example.com",
    );
    expect(element.value).toBe("Hello [world](https://example.com)");
    await press(element, "Link");
    expect(element.value).toBe("Hello world");

    const image = await setup("Hi ", [3, 3], [" cat.png ", ""]);
    await press(image, "Image URL");
    expect(image.value).toBe("Hi ![](cat.png)");
    await press(image, "Image URL");
    expect(image.value).toBe("Hi ![](cat.png)");
  });

  it("should add and change embed blocks with the embed dialog, once the site's embeds are known", async () => {
    const element = await setup("Intro", [5, 5]);
    expect(button(element, "Embed").disabled).toBe(true);
    const answers: (EmbedValue | undefined)[] = [
      { key: "youtube", content: "https://youtu.be/abc" },
      undefined,
      { key: "mermaidjs", content: "graph TD;\n  A-->B;" },
    ];
    element.embedTools = {
      embeds: [],
      edit: vi.fn(async () => answers.shift()),
      loadFrame: vi.fn(),
    };
    await element.updateComplete;
    await press(element, "Embed");
    await settle(element);
    expect(element.embedTools.edit).toHaveBeenLastCalledWith(undefined);
    const code =
      "<!-- embed:youtube -->https://youtu.be/abc<!-- /embed:youtube -->";
    expect(element.value).toBe(`Intro\n\n${code}`);
    // The selected block is changed; cancelling changes nothing
    textarea(element).setSelectionRange(7, element.value.length);
    await press(element, "Embed");
    await settle(element);
    expect(element.embedTools.edit).toHaveBeenLastCalledWith({
      key: "youtube",
      content: "https://youtu.be/abc",
    });
    expect(element.value).toBe(`Intro\n\n${code}`);
    textarea(element).setSelectionRange(7, element.value.length);
    await press(element, "Embed");
    await settle(element);
    expect(element.value).toBe(
      "Intro\n\n<!-- embed:mermaidjs -->\ngraph TD;\n  A-->B;\n<!-- /embed:mermaidjs -->",
    );
  });

  it("should insert tables and edit them only while the cursor is in one", async () => {
    const element = await setup("", [0, 0]);
    const tableButtons = [
      "Add row",
      "Add column",
      "Remove row",
      "Remove column",
      "Remove table",
    ];
    for (const label of tableButtons)
      expect(button(element, label).disabled).toBe(true);
    await press(element, "Table");
    expect(element.value).toBe(
      "| Header | Header | Header |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |",
    );
    for (const label of tableButtons)
      expect(button(element, label).disabled).toBe(false);
    await press(element, "Add column");
    expect(element.value.split("\n")[0]).toBe(
      "| Header |  | Header | Header |",
    );
    await press(element, "Remove column");
    await press(element, "Add row");
    expect(element.value.split("\n")).toHaveLength(5);
    await press(element, "Remove row");
    expect(element.value.split("\n")).toHaveLength(4);
    await press(element, "Remove table");
    expect(element.value).toBe("");
    expect(button(element, "Remove table").disabled).toBe(true);
  });

  it("should refresh the buttons when the cursor moves", async () => {
    const element = await setup("Intro\n\n| A |\n| --- |", [0, 0]);
    expect(button(element, "Add row").disabled).toBe(true);
    for (const type of ["keyup", "click", "select"]) {
      textarea(element).setSelectionRange(9, 9);
      textarea(element).dispatchEvent(new Event(type));
      await element.updateComplete;
      expect(button(element, "Add row").disabled, type).toBe(false);
      textarea(element).setSelectionRange(0, 0);
      textarea(element).dispatchEvent(new Event(type));
      await element.updateComplete;
    }
  });

  it("should type edits in where the browser supports it, so they can be undone", async () => {
    const element = await setup();
    const execCommand = vi.fn((command: string, _ui: boolean, text: string) => {
      const box = textarea(element);
      box.setRangeText(
        command === "insertText" ? text : "",
        box.selectionStart,
        box.selectionEnd,
      );
      return true;
    });
    Object.defineProperty(document, "execCommand", {
      value: execCommand,
      configurable: true,
    });
    try {
      await press(element, "Bold");
      expect(execCommand).toHaveBeenCalledWith(
        "insertText",
        false,
        "**world**",
      );
      expect(element.value).toBe("Hello **world**");
      element.apply({ value: "Hello ", start: 6, end: 6 });
      expect(execCommand).toHaveBeenLastCalledWith("delete", false, "");
      expect(element.value).toBe("Hello ");
    } finally {
      delete (document as { execCommand?: unknown }).execCommand;
    }
  });

  it("should change nothing for edits that change nothing, or before it renders", async () => {
    const element = await setup("Hello", [0, 0], [""]);
    const onChange = vi.fn();
    element.addEventListener("markdown-change", onChange);
    await press(element, "Link");
    element.apply({ value: "Hello", start: 1, end: 1 });
    expect(onChange).not.toHaveBeenCalled();
    expect(textarea(element).selectionStart).toBe(1);

    const unrendered = document.createElement(
      "edaha-markdown",
    ) as EdahaMarkdown;
    unrendered.apply({ value: "x", start: 0, end: 0 });
    expect(unrendered.value).toBe("");
  });

  it("should upload a chosen image and insert it at the cursor", async () => {
    const element = await setup("Hi ", [3, 3]);
    const chooser = () =>
      find<HTMLInputElement>(element, '.toolbar-upload input[type="file"]');
    expect(chooser().disabled).toBe(true);
    expect(find(element, ".toolbar-upload").hasAttribute("data-disabled")).toBe(
      true,
    );
    element.uploadImage = vi
      .fn()
      .mockResolvedValueOnce("cat.png")
      .mockRejectedValueOnce(new Error("Upload failed"));
    await element.updateComplete;
    expect(chooser().disabled).toBe(false);
    chooseFile(chooser(), new File(["x"], "Cat.png"));
    await settle(element);
    expect(element.value).toBe("Hi ![](cat.png)");
    chooseFile(chooser(), new File(["x"], "bad.png"));
    await settle(element);
    expect(element.value).toBe("Hi ![](cat.png)");
    chooseFile(chooser());
    expect(element.uploadImage).toHaveBeenCalledTimes(2);
  });

  it("should insert a chosen existing file where the cursor was, once a chooser is given", async () => {
    const element = await setup("Hi ", [3, 3]);
    expect(button(element, "Choose file").disabled).toBe(true);
    element.chooseFile = vi
      .fn()
      .mockResolvedValueOnce({ url: "cat.png", name: "cat.png", kind: "image" })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        url: "/page/about/guide.pdf",
        name: "guide.pdf",
        kind: "document",
      });
    await element.updateComplete;
    await press(element, "Choose file");
    await settle(element);
    expect(element.value).toBe("Hi ![](cat.png)");
    expect(element.chooseFile).toHaveBeenCalledWith();
    // Nothing chosen
    await press(element, "Choose file");
    await settle(element);
    expect(element.value).toBe("Hi ![](cat.png)");
    textarea(element).setSelectionRange(0, 2);
    await press(element, "Choose file");
    await settle(element);
    expect(element.value).toBe("[Hi](/page/about/guide.pdf) ![](cat.png)");
  });

  it("should ask with the browser's prompt by default", async () => {
    const element = await mount<EdahaMarkdown>("edaha-markdown");
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("x");
    expect(element.prompt("URL?", "a")).toBe("x");
    expect(prompt).toHaveBeenCalledWith("URL?", "a");
  });
});
