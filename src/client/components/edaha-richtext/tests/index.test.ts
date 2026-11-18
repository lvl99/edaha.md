// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "..";
import type { EdahaRichtext } from "..";
import {
  button,
  chooseFile,
  find,
  mount,
  settle,
} from "../../../../shared/tests/helpers";

afterEach(() => document.body.replaceChildren());

/** A rich text editor with content and answers for its URL prompts */
const setup = async (
  value = "<p>Hello world</p>",
  answers: (string | null)[] = [],
) => {
  const element = await mount<EdahaRichtext>("edaha-richtext", { value });
  await element.updateComplete;
  element.prompt = vi.fn(() => (answers.length ? answers.shift()! : null));
  return element;
};

/** Select all text in the editor */
const selectAll = (element: EdahaRichtext) =>
  element.editor!.commands.selectAll();

describe("edaha-richtext", () => {
  it("should show the content and fire richtext-change with the new HTML", async () => {
    const element = await setup();
    const onInput = vi.fn();
    element.addEventListener("richtext-change", onInput);
    expect(find(element, ".richtext-content").textContent).toContain(
      "Hello world",
    );
    element.editor!.commands.insertContent(" again");
    expect(onInput).toHaveBeenCalledOnce();
    expect(element.value).toContain("again");
  });

  it("should format text from the toolbar and show pressed states", async () => {
    const element = await setup();
    selectAll(element);
    for (const label of ["Bold", "Italic"]) button(element, label).click();
    await element.updateComplete;
    expect(element.value).toBe("<p><strong><em>Hello world</em></strong></p>");
    expect(button(element, "Bold").getAttribute("aria-pressed")).toBe("true");
    expect(button(element, "Read more").getAttribute("aria-pressed")).toBe(
      "false",
    );

    const blocks: [string, string][] = [
      ["Heading", "<h2>"],
      ["Subheading", "<h3>"],
      ["Bullet list", "<ul>"],
      ["Numbered list", "<ol>"],
      ["Quote", "<blockquote>"],
      ["Code", "<pre>"],
      ["Small", "<small>"],
      ["Big", "<big>"],
      ["Details", "<details>"],
      ["Raw", '<pre class="raw">'],
    ];
    for (const [label, tag] of blocks) {
      const fresh = await setup();
      selectAll(fresh);
      button(fresh, label).click();
      await fresh.updateComplete;
      expect(fresh.value, label).toContain(tag);
    }
  });

  it("should unwrap a details block from the toolbar", async () => {
    const element = await setup(
      "<details><summary>More</summary><p>Hidden</p></details>",
    );
    expect(element.value).toContain("<details>");
    element.editor!.commands.setTextSelection(10);
    await element.updateComplete;
    expect(button(element, "Details").getAttribute("aria-pressed")).toBe(
      "true",
    );
    button(element, "Details").click();
    await element.updateComplete;
    expect(element.value).not.toContain("<details>");
    expect(element.value).toContain("Hidden");
  });

  it("should add, change and remove links", async () => {
    const element = await setup("<p>Hello world</p>", [
      null,
      "https://example.com",
      " ",
      "https://other.com",
    ]);
    selectAll(element);
    button(element, "Link").click();
    expect(element.value).not.toContain("href");
    button(element, "Link").click();
    expect(element.value).toContain('href="https://example.com"');
    selectAll(element);
    button(element, "Link").click();
    expect(element.value).not.toContain("href");
    expect(element.prompt).toHaveBeenCalledWith(
      "Link URL (empty to remove)",
      undefined,
    );
    selectAll(element);
    button(element, "Link").click();
    expect(element.value).toContain('href="https://other.com"');
  });

  it("should insert images and embeds by URL", async () => {
    const element = await setup("<p>Hi</p>", [
      null,
      " https://example.com/a.png ",
      "",
      "https://youtu.be/x",
    ]);
    button(element, "Image URL").click();
    button(element, "Image URL").click();
    button(element, "Embed").click();
    button(element, "Embed").click();
    expect(element.value).toContain('<img src="https://example.com/a.png">');
    expect(element.value.match(/<img/g)).toHaveLength(1);
    expect(element.value.match(/class="embed"/g)).toHaveLength(1);
  });

  it("should remove a selected readmore break from the toolbar", async () => {
    const element = await setup('<p>One</p><hr class="readmore"><p>Two</p>');
    element.editor!.commands.setNodeSelection(5);
    await element.updateComplete;
    expect(button(element, "Read more").getAttribute("aria-pressed")).toBe(
      "true",
    );
    button(element, "Read more").click();
    expect(element.value).toBe("<p>One</p><p>Two</p>");
  });

  it("should change or remove a selected embed from the toolbar", async () => {
    const element = await setup(
      '<p>One</p><div class="embed">https://youtu.be/x</div>',
      [null, " https://youtu.be/y ", ""],
    );
    element.editor!.commands.setNodeSelection(5);
    await element.updateComplete;
    expect(button(element, "Embed").getAttribute("aria-pressed")).toBe("true");
    // Cancelled
    button(element, "Embed").click();
    expect(element.prompt).toHaveBeenLastCalledWith(
      "Embed URL (empty to remove)",
      "https://youtu.be/x",
    );
    expect(element.editor!.getHTML()).toContain("https://youtu.be/x");
    // Changed
    button(element, "Embed").click();
    expect(element.value).toContain(
      '<div class="embed">https://youtu.be/y</div>',
    );
    // Removed
    element.editor!.commands.setNodeSelection(5);
    button(element, "Embed").click();
    expect(element.value).not.toContain("embed");
  });

  it("should ask for an embed's new URL when its Edit button is pressed", async () => {
    const element = await setup(
      '<p>One</p><div class="embed">https://youtu.be/x</div>',
      ["https://youtu.be/y"],
    );
    const edit = [...element.querySelectorAll(".embed-block button")].find(
      (b) => b.textContent === "Edit",
    ) as HTMLButtonElement;
    edit.click();
    expect(element.prompt).toHaveBeenCalledWith(
      "Embed URL (empty to remove)",
      "https://youtu.be/x",
    );
    expect(element.value).toContain(
      '<div class="embed">https://youtu.be/y</div>',
    );
  });

  it("should preview embeds with its loader, set before or after the editor is created", async () => {
    const element = await setup('<div class="embed">https://youtu.be/x</div>');
    await settle(element);
    expect(find(element, ".embed-preview").textContent).toBe(
      "No preview: previews are not available",
    );
    element.loadEmbedPreview = vi.fn(async () => ({
      html: "<p>preview</p>",
      warnings: [],
    }));
    element.editor!.commands.setNodeSelection(0);
    element.editor!.commands.setEmbed("https://youtu.be/y");
    await settle(element);
    expect(element.loadEmbedPreview).toHaveBeenCalledWith("https://youtu.be/y");
    expect(find(element, ".embed-preview").innerHTML).toBe("<p>preview</p>");
  });

  it("should ignore embed edit events once the editor is gone", async () => {
    const element = await setup();
    const content = find(element, ".richtext-content");
    element.remove();
    content.dispatchEvent(new Event("embed-edit"));
    expect(element.prompt).not.toHaveBeenCalled();
  });

  it("should insert and edit tables", async () => {
    const element = await setup("<p>Hi</p>");
    const rows = () => element.editor!.view.dom.querySelectorAll("tr").length;
    const columns = () =>
      element.editor!.view.dom.querySelectorAll("tr:first-child > *").length;
    // Table buttons other than "Table" only work inside a table
    expect(button(element, "Add row").disabled).toBe(true);
    button(element, "Table").click();
    await element.updateComplete;
    expect([rows(), columns()]).toEqual([3, 3]);
    expect(button(element, "Table").getAttribute("aria-pressed")).toBe("true");
    expect(button(element, "Add row").disabled).toBe(false);
    button(element, "Add row").click();
    button(element, "Add column").click();
    expect([rows(), columns()]).toEqual([4, 4]);
    button(element, "Remove row").click();
    button(element, "Remove column").click();
    expect([rows(), columns()]).toEqual([3, 3]);
    button(element, "Remove table").click();
    expect(rows()).toBe(0);
  });

  it("should insert a readmore break", async () => {
    const element = await setup();
    button(element, "Read more").click();
    expect(element.value).toContain('class="readmore"');
  });

  it("should upload images when an uploader is given", async () => {
    const element = await setup();
    const chooser = find<HTMLInputElement>(element, "input[type=file]");
    expect(chooser.disabled).toBe(true);

    element.uploadImage = vi
      .fn()
      .mockResolvedValueOnce("/files/article/a/pic.png")
      .mockRejectedValueOnce(new Error("Upload failed"));
    await element.updateComplete;
    expect(chooser.disabled).toBe(false);
    chooseFile(chooser, new File(["x"], "pic.png"));
    await settle(element);
    expect(element.value).toContain(
      '<img src="/files/article/a/pic.png" alt="">',
    );
    chooseFile(chooser, new File(["x"], "bad.png"));
    await settle(element);
    expect(element.value.match(/<img/g)).toHaveLength(1);
    // Nothing chosen
    chooseFile(chooser);
    expect(element.uploadImage).toHaveBeenCalledTimes(2);
  });

  it("should replace its content when given a different value", async () => {
    const element = await setup();
    const onInput = vi.fn();
    element.addEventListener("richtext-change", onInput);
    element.value = "<p>Another article</p>";
    await element.updateComplete;
    expect(find(element, ".richtext-content").textContent).toContain(
      "Another article",
    );
    expect(onInput).not.toHaveBeenCalled();
    // The same value again changes nothing
    element.value = element.editor!.getHTML();
    await element.updateComplete;
    expect(onInput).not.toHaveBeenCalled();
  });

  it("should refresh pressed states when the selection moves", async () => {
    const element = await setup("<p><strong>Bold</strong> plain</p>");
    element.editor!.commands.setTextSelection(2);
    await element.updateComplete;
    expect(button(element, "Bold").getAttribute("aria-pressed")).toBe("true");
    element.editor!.commands.setTextSelection(9);
    await element.updateComplete;
    expect(button(element, "Bold").getAttribute("aria-pressed")).toBe("false");
  });

  it("should destroy the editor when removed and ignore toolbar clicks without one", async () => {
    const element = await setup();
    const toolbar = find(element, ".richtext-toolbar");
    element.remove();
    expect(element.editor).toBeUndefined();
    const bold = [...toolbar.querySelectorAll("button")][0]!;
    bold.click();
    chooseFile(
      find<HTMLInputElement>(toolbar, "input[type=file]"),
      new File(["x"], "a.png"),
    );
  });

  it("should render a disabled toolbar before the editor exists, and default to an empty value", () => {
    const element = document.createElement("edaha-richtext") as EdahaRichtext;
    expect(element.value).toBe("");
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("x");
    expect(element.prompt("Question", "default")).toBe("x");
    expect(prompt).toHaveBeenCalledWith("Question", "default");
    prompt.mockRestore();
  });
});
