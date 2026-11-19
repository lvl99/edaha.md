// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import type { EmbedPreview } from "../../../../server/types";
import {
  editorHtmlToMarkdown,
  markdownToEditorHtml,
} from "../../../../server/convert";
import { createRichtextEditor } from "..";
import { EMBED_EDIT_EVENT, blockView } from "../../extensions";

let editor: Editor | undefined;

/** A rich text editor with the given content */
const create = (
  content: string,
  onUpdate = vi.fn(),
  loadEmbedPreview?: (url: string) => Promise<EmbedPreview>,
) => {
  const element = document.createElement("div");
  document.body.append(element);
  editor = createRichtextEditor(element, content, onUpdate, loadEmbedPreview);
  return { editor, onUpdate, element };
};

/** Wait for pending promises */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A block's label */
const label = (block: Element | null) =>
  block?.querySelector(".block-header span")?.textContent;

/** A block's header button by its text */
const blockButton = (block: Element | null, text: string) =>
  [...(block?.querySelectorAll("button") ?? [])].find(
    (b) => b.textContent === text,
  ) as HTMLButtonElement;

afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

describe("createRichtextEditor", () => {
  it("should keep readmore breaks, embeds, images and links", () => {
    const html =
      '<p>Intro <a href="https://example.com">link</a></p><hr class="readmore"><div class="embed">https://youtu.be/x</div><p><img src="/files/a.png" alt="A"></p><hr>';
    const { editor } = create(html);
    const result = editor.getHTML();
    expect(result).toContain('<hr class="readmore" title="Read more">');
    expect(result).toContain('<div class="embed">https://youtu.be/x</div>');
    expect(result).toContain('<img src="/files/a.png" alt="A">');
    expect(result).toContain('href="https://example.com"');
    expect(result).toMatch(/<hr>$/);
  });

  it("should keep raw blocks and raw text as they are, without other formatting", () => {
    const html =
      '<p>A <span class="raw">*a*\u00a0\u00a0b</span> c</p><pre class="raw">x\n\n  &lt;!-- readmore --&gt;</pre><pre><code>code</code></pre>';
    const { editor } = create(html);
    const result = editor.getHTML();
    expect(result).toContain('<span class="raw">*a*&nbsp;&nbsp;b</span>');
    expect(result).toContain(
      '<pre class="raw">x\n\n  &lt;!-- readmore --&gt;</pre>',
    );
    expect(result).toContain("<pre><code>code</code></pre>");
    // Raw text can't have other formatting
    editor.commands.selectAll();
    editor.commands.toggleBold();
    expect(editor.getHTML()).not.toMatch(/<strong>[^<]*\*a\*/);
  });

  it("should turn a paragraph into a raw block and back", () => {
    const { editor } = create("<p>Text</p>");
    editor.commands.toggleRaw();
    // With a paragraph after it, to carry on writing
    expect(editor.getHTML()).toBe('<pre class="raw">Text</pre><p></p>');
    editor.commands.setTextSelection(1);
    editor.commands.toggleRaw();
    expect(editor.getHTML()).toBe("<p>Text</p><p></p>");
  });

  it("should allow only one readmore break, at the cursor", () => {
    const { editor, onUpdate } = create(
      '<p>One</p><hr class="readmore"><p>Two</p><hr class="readmore"><p>Three</p>',
    );
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.setReadmore();
    const result = editor.getHTML();
    expect(result.match(/class="readmore"/g)).toHaveLength(1);
    expect(result.indexOf("Three")).toBeLessThan(result.indexOf("readmore"));
    expect(onUpdate).toHaveBeenCalledWith(result);
  });

  it("should put the cursor after the break so typing doesn't replace it", () => {
    // At the end of the document, a paragraph is added after the break
    const end = create("<p>One</p>").editor;
    end.commands.setTextSelection(4);
    end.commands.setReadmore();
    end.commands.insertContent("Two");
    expect(end.getHTML()).toBe(
      '<p>One</p><hr class="readmore" title="Read more"><p>Two</p>',
    );
    end.destroy();

    // Before another paragraph, the cursor moves into it
    const middle = create("<p>One</p><p>Two</p>").editor;
    middle.commands.setTextSelection(4);
    middle.commands.setReadmore();
    middle.commands.insertContent("Next ");
    expect(middle.getHTML()).toBe(
      '<p>One</p><hr class="readmore" title="Read more"><p>Next Two</p>',
    );
    middle.destroy();

    // Before another block, a paragraph is added after the break
    const embed = create(
      '<p>One</p><div class="embed">https://youtu.be/x</div>',
    ).editor;
    embed.commands.setTextSelection(4);
    embed.commands.setReadmore();
    embed.commands.insertContent("Two");
    expect(embed.getHTML()).toBe(
      '<p>One</p><hr class="readmore" title="Read more"><p>Two</p><div class="embed">https://youtu.be/x</div><p></p>',
    );
    // (Tiptap keeps an empty paragraph at the end of the document)
  });

  it("should check whether a readmore break can be inserted without inserting it", () => {
    const { editor } = create("<p>One</p>");
    expect(editor.can().setReadmore()).toBe(true);
    expect(editor.getHTML()).not.toContain("readmore");
  });

  it("should show the blocks as labelled, selectable boxes", () => {
    const { editor } = create(
      '<hr class="readmore"><div class="embed">https://youtu.be/x</div>',
    );
    const readmore = editor.view.dom.querySelector(
      ".readmore-block",
    ) as HTMLElement;
    const embed = editor.view.dom.querySelector(".embed-block") as HTMLElement;
    expect(label(readmore)).toBe("Read more");
    expect(readmore.contentEditable).toBe("false");
    expect(
      [...readmore.querySelectorAll("button")].map((b) => b.textContent),
    ).toEqual(["Remove"]);
    expect(label(embed)).toBe("Embed: https://youtu.be/x");
    expect(
      [...embed.querySelectorAll("button")].map((b) => b.textContent),
    ).toEqual(["Edit", "Remove"]);
    // Without a preview loader, there is no preview
    expect(embed.querySelector(".embed-preview")!.textContent).toBe("");
    editor.commands.setNodeSelection(1);
    expect(editor.isActive("embed")).toBe(true);
  });

  it("should remove blocks with their Remove buttons", () => {
    const { editor } = create(
      '<p>One</p><hr class="readmore"><div class="embed">https://youtu.be/x</div><p>Two</p>',
    );
    blockButton(
      editor.view.dom.querySelector(".embed-block"),
      "Remove",
    ).click();
    expect(editor.getHTML()).toBe(
      '<p>One</p><hr class="readmore" title="Read more"><p>Two</p>',
    );
    blockButton(
      editor.view.dom.querySelector(".readmore-block"),
      "Remove",
    ).click();
    expect(editor.getHTML()).toBe("<p>One</p><p>Two</p>");
  });

  it("should select an embed and fire an edit event from its Edit button", () => {
    const { editor, element } = create(
      '<p>One</p><div class="embed">https://youtu.be/x</div>',
    );
    const onEdit = vi.fn();
    element.addEventListener(EMBED_EDIT_EVENT, onEdit);
    blockButton(editor.view.dom.querySelector(".embed-block"), "Edit").click();
    expect(onEdit).toHaveBeenCalledOnce();
    expect(editor.isActive("embed")).toBe(true);
  });

  it("should let the block's buttons handle their own events and ignore changes inside blocks", () => {
    const { editor } = create('<hr class="readmore">');
    const view = blockView("readmore-block", "Read more", {
      editor,
      getPos: () => 0,
    }).view;
    const button = view.dom.querySelector("button") as HTMLButtonElement;
    expect(view.stopEvent!({ target: button } as unknown as Event)).toBe(true);
    expect(view.stopEvent!({ target: view.dom } as unknown as Event)).toBe(
      false,
    );
    expect(view.ignoreMutation!({} as never)).toBe(true);
  });

  it("should do nothing when a removed block's button is clicked", () => {
    const { editor } = create('<hr class="readmore"><p>One</p>');
    const { view } = blockView("readmore-block", "Read more", {
      editor,
      getPos: () => undefined,
    });
    (view.dom.querySelector("button") as HTMLButtonElement).click();
    expect(editor.getHTML()).toContain("readmore");
  });

  it("should preview embeds, with any warnings", async () => {
    const loadPreview = vi.fn(async (url: string) => ({
      html: `<iframe src="${url}" loading="lazy"></iframe>`,
      warnings: url.includes("bad") ? ["First", "Second"] : [],
    }));
    const { editor } = create(
      '<div class="embed">https://youtu.be/x</div><div class="embed">https://bad.example</div>',
      vi.fn(),
      loadPreview,
    );
    const [good, bad] = editor.view.dom.querySelectorAll(".embed-preview");
    expect(good!.textContent).toBe("Loading preview…");
    await flush();
    // Lazy loading is turned off, as it never starts inside the editor
    expect(good!.innerHTML).toBe('<iframe src="https://youtu.be/x"></iframe>');
    expect(
      [...bad!.querySelectorAll(".embed-warning")].map((p) => p.textContent),
    ).toEqual(["Second", "First"]);
  });

  it("should show why a preview failed", async () => {
    const { editor } = create(
      '<div class="embed">https://youtu.be/x</div>',
      vi.fn(),
      () => Promise.reject(new Error("offline")),
    );
    await flush();
    expect(editor.view.dom.querySelector(".embed-preview")!.textContent).toBe(
      "No preview: offline",
    );
  });

  it("should change the selected embed's URL in place and preview the new URL only", async () => {
    const answers: Record<string, (preview: EmbedPreview) => void> = {};
    const reject: Record<string, (error: Error) => void> = {};
    const loadPreview = vi.fn(
      (url: string) =>
        new Promise<EmbedPreview>((resolve, fail) => {
          answers[url] = resolve;
          reject[url] = fail;
        }),
    );
    const { editor } = create(
      '<div class="embed">https://youtu.be/x</div>',
      vi.fn(),
      loadPreview,
    );
    const view = editor.view.dom.querySelector(".embed-block");
    editor.commands.setNodeSelection(0);
    editor.commands.setEmbed("https://youtu.be/y");
    expect(editor.getHTML()).toBe(
      '<div class="embed">https://youtu.be/y</div><p></p>',
    );
    // The same box shows the new URL
    expect(editor.view.dom.querySelector(".embed-block")).toBe(view);
    expect(label(view)).toBe("Embed: https://youtu.be/y");
    // The same URL again doesn't reload the preview
    editor.commands.setEmbed("https://youtu.be/y");
    expect(loadPreview).toHaveBeenCalledTimes(2);

    // Previews for the old URL are ignored, even if they arrive last
    answers["https://youtu.be/y"]!({ html: "<p>new</p>", warnings: [] });
    await flush();
    answers["https://youtu.be/x"]!({ html: "<p>old</p>", warnings: [] });
    await flush();
    expect(view!.querySelector(".embed-preview")!.innerHTML).toBe("<p>new</p>");

    // ...and so are failures for an old URL
    editor.commands.setEmbed("https://youtu.be/z");
    reject["https://youtu.be/y"]?.(new Error("late"));
    await flush();
    expect(view!.querySelector(".embed-preview")!.textContent).toBe(
      "Loading preview…",
    );
  });

  it("should ignore a failed preview for a URL that has since changed", async () => {
    let fail: (error: Error) => void = () => undefined;
    const loadPreview = vi
      .fn()
      .mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)))
      .mockImplementation(() => new Promise(() => undefined));
    const { editor } = create(
      '<div class="embed">https://youtu.be/x</div>',
      vi.fn(),
      loadPreview,
    );
    editor.commands.setNodeSelection(0);
    editor.commands.setEmbed("https://youtu.be/y");
    fail(new Error("late"));
    await flush();
    expect(editor.view.dom.querySelector(".embed-preview")!.textContent).toBe(
      "Loading preview…",
    );
  });

  it("should not reuse an embed's box for another kind of block", () => {
    const { editor } = create('<div class="embed">https://youtu.be/x</div>');
    const createView = editor.extensionManager.nodeViews.embed!;
    const embed = editor.state.doc.firstChild!;
    const view = createView(embed, editor.view, () => 0, [], {} as never);
    const update = (node: typeof embed) => view.update!(node, [], {} as never);
    expect(update(editor.schema.nodes.paragraph!.create())).toBe(false);
    expect(update(embed)).toBe(true);
  });

  it("should keep tables, which convert back to Markdown tables", () => {
    const markdown =
      "| Data | Kept for |\n| --- | --- |\n| A cookie (`__session`) | 30 days |";
    const { editor } = create(
      markdownToEditorHtml(markdown, "/files/page/privacy/"),
    );
    expect(editor.view.dom.querySelectorAll("th")).toHaveLength(2);
    expect(editorHtmlToMarkdown(editor.getHTML(), "/files/page/privacy/")).toBe(
      markdown,
    );
  });

  it("should show each heading's ID after it, without saving it", () => {
    const { editor, element } = create(
      "<h2>This?! Is an, example...</h2><p>Text</p><h3>Notes</h3><h3>Notes</h3><h2>!!!</h2>",
    );
    const labels = () =>
      [...element.querySelectorAll(".heading-id")].map((label) => [
        label.parentElement?.tagName,
        label.textContent,
      ]);
    expect(labels()).toEqual([
      ["H2", "#this-is-an-example"],
      ["H3", "#notes"],
      ["H3", "#notes-2"],
    ]);
    expect(editor.getHTML()).not.toContain("heading-id");
    expect(editor.getHTML()).not.toContain(" id=");
    editor.commands.setTextSelection(5);
    editor.commands.insertContent("X");
    expect(labels()[0]).toEqual(["H2", "#thisx-is-an-example"]);
  });

  it("should select a whole details block when its box is clicked, and cut, copy and paste it", () => {
    const { editor, element } = create(
      "<p>Before</p><details><summary>More</summary><p>Hidden</p></details><p>After</p>",
    );
    const { view } = editor;
    /** Run the editor's click handling as if a node's element was clicked */
    const clickOn = (pos: number, direct: boolean) => {
      const nodePos = view.state.doc.resolve(pos).before();
      const node = view.state.doc.nodeAt(nodePos)!;
      return view.someProp("handleClickOn", (handle) =>
        handle(view, pos, node, nodePos, new MouseEvent("click"), direct),
      );
    };
    const detailsPos = 8;
    expect(view.state.doc.nodeAt(detailsPos)?.type.name).toBe("details");
    // Clicking inside the summary or a paragraph is left to the editor
    expect(clickOn(detailsPos + 3, false)).toBeFalsy();
    expect(clickOn(2, true)).toBeFalsy();
    // Clicking the details box selects it
    expect(clickOn(detailsPos + 1, true)).toBe(true);
    const selection = view.state.selection;
    expect(selection).toBeInstanceOf(NodeSelection);
    expect((selection as NodeSelection).node.type.name).toBe("details");
    expect(
      element
        .querySelector(".ProseMirror-selectednode")
        ?.getAttribute("data-type"),
    ).toBe("details");

    // Copy, then paste it after the last paragraph
    const copied = view.serializeForClipboard(selection.content()).dom
      .innerHTML;
    expect(copied).toContain("<summary>More</summary>");
    // Cut: the block is removed
    editor.commands.deleteSelection();
    expect(editor.getHTML()).toBe("<p>Before</p><p>After</p>");
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    // jsdom has no ClipboardEvent, which the editor's paste handling creates
    vi.stubGlobal(
      "ClipboardEvent",
      class extends Event {
        clipboardData = null;
      },
    );
    view.pasteHTML(copied);
    vi.unstubAllGlobals();
    // The pasted block keeps its summary and content (the editor adds a paragraph after it to type in)
    expect(editor.getHTML()).toMatch(
      /^<p>Before<\/p><p>After<\/p><details><summary>More<\/summary><div data-type="detailsContent"><p>Hidden<\/p><\/div><\/details>/,
    );
  });

  it("should insert embeds by URL", () => {
    const { editor } = create("<p>One</p>");
    editor.commands.setEmbed("https://youtu.be/aju_UB5VIf8");
    expect(editor.getHTML()).toContain(
      '<div class="embed">https://youtu.be/aju_UB5VIf8</div>',
    );
  });
});
