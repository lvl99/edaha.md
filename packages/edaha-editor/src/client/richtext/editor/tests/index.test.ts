// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import type { EmbedFrame } from "../../../../server/types";
import type { EmbedTools, EmbedValue } from "../../../embeds";
import {
  editorHtmlToMarkdown,
  markdownToEditorHtml,
} from "../../../../server/convert";
import { createRichtextEditor } from "..";
import { EMBED_EDIT_EVENT, Embed, blockView } from "../../extensions";

let editor: Editor | undefined;

/** A YouTube embed block's editor HTML */
const EMBED =
  '<div class="embed" data-embed="youtube" data-content="https://youtu.be/x"></div>';

/** A rich text editor with the given content */
const create = (content: string, onUpdate = vi.fn(), tools?: EmbedTools) => {
  const element = document.createElement("div");
  document.body.append(element);
  editor = createRichtextEditor(
    element,
    content,
    onUpdate,
    tools && (() => tools),
  );
  return { editor, onUpdate, element };
};

/** An embed block's editor HTML */
const embedHtml = (content = "https://youtu.be/x", key = "youtube") =>
  `<div class="embed" data-embed="${key}" data-content="${content}"></div>`;

/** Embed tools with a YouTube embed and the given frame loader */
const embedTools = (
  loadFrame: (value: EmbedValue) => Promise<EmbedFrame>,
): EmbedTools => ({
  embeds: [
    { key: "youtube", name: "YouTube video", icon: '<svg id="yt"></svg>' },
  ],
  edit: vi.fn(),
  loadFrame,
});

/** Wait for pending promises */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A block's label */
const label = (block: Element | null) =>
  block?.querySelector(".block-header span:not(.icon)")?.textContent;

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
    const html = `<p>Intro <a href="https://example.com">link</a></p><hr class="readmore">${EMBED}<p><img src="/files/a.png" alt="A"></p><hr>`;
    const { editor } = create(html);
    const result = editor.getHTML();
    expect(result).toContain('<hr class="readmore" title="Read more">');
    expect(result).toContain(`${EMBED}`);
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
    const embed = create(`<p>One</p>${EMBED}`).editor;
    embed.commands.setTextSelection(4);
    embed.commands.setReadmore();
    embed.commands.insertContent("Two");
    expect(embed.getHTML()).toBe(
      `<p>One</p><hr class="readmore" title="Read more"><p>Two</p>${EMBED}<p></p>`,
    );
    // (Tiptap keeps an empty paragraph at the end of the document)
  });

  it("should check whether a readmore break can be inserted without inserting it", () => {
    const { editor } = create("<p>One</p>");
    expect(editor.can().setReadmore()).toBe(true);
    expect(editor.getHTML()).not.toContain("readmore");
  });

  it("should show the blocks as labelled, selectable boxes", () => {
    const { editor } = create(`<hr class="readmore">${EMBED}`);
    const readmore = editor.view.dom.querySelector(
      ".readmore-block",
    ) as HTMLElement;
    const embed = editor.view.dom.querySelector(".embed-block") as HTMLElement;
    expect(label(readmore)).toBe("Read more");
    expect(readmore.contentEditable).toBe("false");
    expect(
      [...readmore.querySelectorAll("button")].map((b) => b.textContent),
    ).toEqual(["Remove"]);
    // Without the embed tools, the embed's kind isn't known and its content is shown as it is
    expect(label(embed)).toBe('Unknown embed "youtube"');
    expect(
      [...embed.querySelectorAll("button")].map((b) => b.textContent),
    ).toEqual(["Edit", "Remove"]);
    expect(embed.querySelector(".embed-content")!.textContent).toBe(
      "https://youtu.be/x",
    );
    editor.commands.setNodeSelection(1);
    expect(editor.isActive("embed")).toBe(true);
  });

  it("should remove blocks with their Remove buttons", () => {
    const { editor } = create(
      `<p>One</p><hr class="readmore">${EMBED}<p>Two</p>`,
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
    const { editor, element } = create(`<p>One</p>${EMBED}`);
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

  it("should show embeds by their kind, in sandboxed frames sized to their content", async () => {
    const loadFrame = vi.fn(async ({ key, content }: EmbedValue) => ({
      url: `/embed-frame/${key}/`,
      warnings: content.includes("bad") ? ["First", "Second"] : [],
    }));
    const { editor } = create(
      `${EMBED}${embedHtml("https://bad.example")}${embedHtml("text", "")}`,
      vi.fn(),
      embedTools(loadFrame),
    );
    const [good, bad, old] = editor.view.dom.querySelectorAll(".embed-block");
    expect(label(good!)).toBe("YouTube video");
    expect(good!.querySelector(".embed-icon")!.innerHTML).toBe(
      '<svg id="yt"></svg>',
    );
    expect(label(old!)).toBe("Embed without a kind");
    expect(good!.querySelector(".embed-preview")!.textContent).toBe("Loading…");
    await flush();
    const frame = good!.querySelector("iframe") as HTMLIFrameElement;
    expect(frame.getAttribute("src")).toBe("/embed-frame/youtube/?theme=light");
    expect(frame.getAttribute("sandbox")).toBe(
      "allow-scripts allow-popups allow-popups-to-escape-sandbox",
    );
    expect(frame.title).toBe("YouTube video: preview");
    expect(loadFrame).toHaveBeenCalledWith({
      key: "youtube",
      content: "https://youtu.be/x",
    });
    // An embed with problems shows them, and its content as it is written
    expect(
      [...bad!.querySelectorAll(".embed-warning")].map((p) => p.textContent),
    ).toEqual(["First", "Second"]);
    expect(bad!.querySelector(".embed-content")!.textContent).toBe(
      "https://bad.example",
    );
    expect(bad!.querySelector("iframe")).toBeNull();

    // A frame's height message sizes it, within limits; other messages are ignored
    const send = (data: unknown, source = frame.contentWindow) =>
      window.dispatchEvent(new MessageEvent("message", { data, source }));
    send({ edahaEmbedHeight: 300 });
    expect(frame.style.height).toBe("300px");
    send({ edahaEmbedHeight: 99999 });
    expect(frame.style.height).toBe("2000px");
    send({ edahaEmbedHeight: 1 });
    expect(frame.style.height).toBe("40px");
    send({ edahaEmbedHeight: "500" });
    send(null);
    send({ edahaEmbedHeight: 500 }, window);
    expect(frame.style.height).toBe("40px");
    // Removed blocks' frames are no longer sized
    editor.commands.setContent("<p>Gone</p>");
    send({ edahaEmbedHeight: 300 });
    expect(frame.style.height).toBe("40px");
  });

  it("should show frames in the editor's theme", async () => {
    const tools = embedTools(async () => ({ url: "/f/", warnings: [] }));
    const frameSrc = async () => {
      const { editor } = create(EMBED, vi.fn(), tools);
      await flush();
      const src = editor.view.dom.querySelector("iframe")!.getAttribute("src");
      editor.destroy();
      return src;
    };
    document.documentElement.dataset.theme = "dark";
    expect(await frameSrc()).toBe("/f/?theme=dark");
    document.documentElement.dataset.theme = "light";
    expect(await frameSrc()).toBe("/f/?theme=light");
    delete document.documentElement.dataset.theme;
    // jsdom has no matchMedia: the visitor's setting is light without it
    expect(await frameSrc()).toBe("/f/?theme=light");
    window.matchMedia = () => ({ matches: true }) as MediaQueryList;
    expect(await frameSrc()).toBe("/f/?theme=dark");
    delete (window as Partial<Window>).matchMedia;
  });

  it("should show why a frame failed", async () => {
    const { editor } = create(
      EMBED,
      vi.fn(),
      embedTools(() => Promise.reject(new Error("offline"))),
    );
    await flush();
    expect(editor.view.dom.querySelector(".embed-preview")!.textContent).toBe(
      "No preview: offline",
    );
  });

  it("should change the selected embed in place and show the new one only", async () => {
    const answers: Record<string, (frame: EmbedFrame) => void> = {};
    const reject: Record<string, (error: Error) => void> = {};
    const loadFrame = vi.fn(
      ({ content }: EmbedValue) =>
        new Promise<EmbedFrame>((resolve, fail) => {
          answers[content] = resolve;
          reject[content] = fail;
        }),
    );
    const { editor } = create(EMBED, vi.fn(), embedTools(loadFrame));
    const view = editor.view.dom.querySelector(".embed-block");
    editor.commands.setNodeSelection(0);
    editor.commands.setEmbed({ key: "youtube", content: "https://youtu.be/y" });
    expect(editor.getHTML()).toBe(`${embedHtml("https://youtu.be/y")}<p></p>`);
    // The same box shows the new embed
    expect(editor.view.dom.querySelector(".embed-block")).toBe(view);
    // The same embed again doesn't reload its frame
    editor.commands.setEmbed({ key: "youtube", content: "https://youtu.be/y" });
    expect(loadFrame).toHaveBeenCalledTimes(2);

    // Frames for the old embed are ignored, even if they arrive last
    answers["https://youtu.be/y"]!({ url: "/new/", warnings: [] });
    await flush();
    answers["https://youtu.be/x"]!({ url: "/old/", warnings: [] });
    await flush();
    expect(view!.querySelector("iframe")!.getAttribute("src")).toBe(
      "/new/?theme=light",
    );

    // ...and so are failures for an old embed
    editor.commands.setEmbed({ key: "youtube", content: "https://youtu.be/z" });
    reject["https://youtu.be/y"]?.(new Error("late"));
    await flush();
    expect(view!.querySelector(".embed-preview")!.textContent).toBe("Loading…");
  });

  it("should not reuse an embed's box for another kind of block", () => {
    const { editor } = create(`${EMBED}`);
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

  it("should have no embed tools unless they are given", () => {
    expect(Embed.options.tools()).toBeUndefined();
  });

  it("should read embed blocks without a kind or content", () => {
    const { editor } = create('<div class="embed"></div>');
    expect(editor.getHTML()).toContain(
      '<div class="embed" data-embed="" data-content=""></div>',
    );
  });

  it("should ignore a failed frame for an embed that has since changed, and frames of removed blocks", async () => {
    let fail: (error: Error) => void = () => undefined;
    let answer: (frame: EmbedFrame) => void = () => undefined;
    const loadFrame = vi
      .fn()
      .mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)))
      .mockImplementationOnce(
        () => new Promise<EmbedFrame>((resolve) => (answer = resolve)),
      );
    const { editor } = create(EMBED, vi.fn(), embedTools(loadFrame));
    editor.commands.setNodeSelection(0);
    editor.commands.setEmbed({ key: "youtube", content: "https://youtu.be/y" });
    fail(new Error("late"));
    await flush();
    const preview = editor.view.dom.querySelector(".embed-preview")!;
    expect(preview.textContent).toBe("Loading…");
    // A frame that arrives after its block was removed isn't sized
    preview.closest(".embed-block")!.remove();
    answer({ url: "/f/", warnings: [] });
    await flush();
    expect(preview.querySelector("iframe")!.contentWindow).toBeNull();
  });

  it("should insert an embed when none is selected", () => {
    const { editor } = create("<p>One</p>");
    editor.commands.setEmbed({
      key: "mermaidjs",
      content: "graph TD;\nA-->B;",
    });
    expect(editor.getHTML()).toContain(
      '<div class="embed" data-embed="mermaidjs" data-content="graph TD;\nA--&gt;B;"></div>',
    );
  });
});
