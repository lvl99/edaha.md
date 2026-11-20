// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "..";
import type { EdahaRichtext } from "..";
import type { EmbedTools, EmbedValue } from "../../../embeds";
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

/** A YouTube embed block's editor HTML */
const EMBED =
  '<div class="embed" data-embed="youtube" data-content="https://youtu.be/x"></div>';

/** Embed tools whose dialog gives the given answers in turn */
const embedTools = (answers: (EmbedValue | undefined)[]): EmbedTools => ({
  embeds: [
    { key: "youtube", name: "YouTube video", icon: '<svg id="yt"></svg>' },
    { key: "mermaidjs", name: "MermaidJS diagram" },
  ],
  edit: vi.fn(async () => answers.shift()),
  loadFrame: vi.fn(async () => ({
    url: "/embed-frame/x/",
    errors: [],
    warnings: [],
  })),
});

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

  it("should insert images by URL", async () => {
    const element = await setup("<p>Hi</p>", [
      null,
      " https://example.com/a.png ",
    ]);
    button(element, "Image URL").click();
    button(element, "Image URL").click();
    expect(element.value).toContain('<img src="https://example.com/a.png">');
    expect(element.value.match(/<img/g)).toHaveLength(1);
  });

  it("should have a button for each of the site's embeds, once they are known, that adds one from the embed dialog", async () => {
    const element = await setup("<p>Hi</p>");
    expect(element.querySelector(".toolbar-embed")).toBeNull();
    const tools = embedTools([
      undefined,
      { key: "youtube", content: "https://youtu.be/x", options: {} },
    ]);
    element.embedTools = tools;
    await element.updateComplete;
    const youtube = button(element, "YouTube video");
    expect(youtube.title).toBe("YouTube video");
    expect(youtube.dataset.embed).toBe("youtube");
    expect(youtube.querySelector(".embed-icon svg")!.id).toBe("yt");
    // A kind without an icon gets the general one
    expect(
      button(element, "MermaidJS diagram").querySelector(".icon svg"),
    ).not.toBeNull();
    // Cancelled
    youtube.click();
    await settle(element);
    expect(tools.edit).toHaveBeenLastCalledWith(
      { key: "youtube", content: "", options: {} },
      true,
    );
    expect(element.value).not.toContain("embed");
    button(element, "YouTube video").click();
    await settle(element);
    expect(element.value).toContain(EMBED);
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

  it("should change a selected embed with its kind's button, and add another kind after it", async () => {
    const element = await setup(`<p>One</p>${EMBED}`);
    element.embedTools = embedTools([
      { key: "youtube", content: "https://youtu.be/y", options: {} },
      { key: "mermaidjs", content: "graph TD;", options: {} },
    ]);
    await element.updateComplete;
    element.editor!.commands.setNodeSelection(5);
    await element.updateComplete;
    expect(button(element, "YouTube video").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(
      button(element, "MermaidJS diagram").getAttribute("aria-pressed"),
    ).toBe("false");
    button(element, "YouTube video").click();
    await settle(element);
    expect(element.embedTools!.edit).toHaveBeenCalledWith(
      { key: "youtube", content: "https://youtu.be/x", options: {} },
      false,
    );
    const changed =
      '<div class="embed" data-embed="youtube" data-content="https://youtu.be/y"></div>';
    expect(element.value).toContain(changed);
    // The YouTube block is still selected: a diagram goes after it, keeping it
    element.editor!.commands.setNodeSelection(5);
    button(element, "MermaidJS diagram").click();
    await settle(element);
    expect(element.embedTools!.edit).toHaveBeenLastCalledWith(
      { key: "mermaidjs", content: "", options: {} },
      true,
    );
    expect(element.value).toContain(
      `${changed}<div class="embed" data-embed="mermaidjs" data-content="graph TD;"></div>`,
    );
  });

  it("should open the embed dialog when an embed's Edit button is pressed", async () => {
    const element = await setup(`<p>One</p>${EMBED}`);
    element.embedTools = embedTools([
      { key: "youtube", content: "https://youtu.be/y", options: {} },
    ]);
    await settle(element);
    const edit = [...element.querySelectorAll(".embed-block button")].find(
      (b) => b.textContent === "Edit",
    ) as HTMLButtonElement;
    edit.click();
    await settle(element);
    expect(element.embedTools!.edit).toHaveBeenCalledWith(
      { key: "youtube", content: "https://youtu.be/x", options: {} },
      false,
    );
    expect(element.value).toContain('data-content="https://youtu.be/y"');
  });

  it("should show embed blocks by their kind once the embed tools are set", async () => {
    const element = await setup(EMBED);
    await settle(element);
    expect(find(element, ".embed-content").textContent).toBe(
      "https://youtu.be/x",
    );
    element.embedTools = embedTools([]);
    await settle(element);
    expect(element.embedTools.loadFrame).toHaveBeenCalledWith({
      key: "youtube",
      content: "https://youtu.be/x",
      options: {},
    });
    expect(find(element, ".block-header span:not(.icon)").textContent).toBe(
      "YouTube video",
    );
    expect(find(element, "iframe").getAttribute("src")).toBe(
      "/embed-frame/x/?theme=light",
    );
    // Unchanged content isn't replaced
    expect(element.value).toBe(EMBED);
  });

  it("should do nothing for embeds without the embed tools, or once the editor is gone", async () => {
    const element = await setup();
    find(element, ".richtext-content").dispatchEvent(new Event("embed-edit"));
    expect(element.value).toBe("<p>Hello world</p>");
    const content = find(element, ".richtext-content");
    element.embedTools = embedTools([]);
    element.remove();
    content.dispatchEvent(new Event("embed-edit"));
    expect(element.embedTools.edit).not.toHaveBeenCalled();
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

  it("should insert chosen existing files once a chooser is given: images as images, others as links", async () => {
    const element = await setup("<p>Hello world</p>");
    expect(button(element, "Choose file").disabled).toBe(true);
    element.chooseFile = vi
      .fn()
      .mockResolvedValueOnce({
        url: "/files/article/a/pic.png",
        name: "pic.png",
        kind: "image",
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        url: "/page/about/guide.pdf",
        name: "guide.pdf",
        kind: "document",
      })
      .mockResolvedValueOnce({
        url: "notes.txt",
        name: "notes.txt",
        kind: "document",
      });
    await element.updateComplete;
    expect(button(element, "Choose file").disabled).toBe(false);
    element.editor!.commands.setTextSelection(6);
    button(element, "Choose file").click();
    await settle(element);
    expect(element.value).toContain(
      '<img src="/files/article/a/pic.png" alt="">',
    );
    // Nothing chosen
    button(element, "Choose file").click();
    await settle(element);
    expect(element.value.match(/<img/g)).toHaveLength(1);
    // Without a selection, a link named after the file
    element.editor!.commands.setTextSelection(1);
    button(element, "Choose file").click();
    await settle(element);
    expect(element.value).toContain('href="/page/about/guide.pdf"');
    expect(element.value).toContain(">guide.pdf</a>");
    // With one, the selection is linked
    element.editor!.commands.setTextSelection({ from: 1, to: 6 });
    element.editor!.commands.unsetLink();
    selectAll(element);
    button(element, "Choose file").click();
    await settle(element);
    expect(element.value).toContain('href="notes.txt"');
    expect(element.value).not.toContain(">notes.txt<");
    expect(element.chooseFile).toHaveBeenCalledTimes(4);
    // Without an editor, nothing is inserted
    element.editor!.destroy();
    element.editor = undefined;
    element.insertFile({ url: "x.png", name: "x.png", kind: "image" });
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
