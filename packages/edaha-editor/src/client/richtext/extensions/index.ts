import {
  Extension,
  Mark,
  Node,
  type NodeViewRendererProps,
} from "@tiptap/core";
import type { Node as ProseMirrorNode, NodeType } from "@tiptap/pm/model";
import {
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet, type NodeView } from "@tiptap/pm/view";
import { headingIds } from "@lvl99dotcom/edaha.md/generator/slug";
import { embedOptionsOf, embedText } from "@lvl99dotcom/edaha.md/embeds/blocks";
import {
  embedName,
  previewAddress,
  type EmbedTools,
  type EmbedValue,
} from "../../embeds/index.ts";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    readmore: {
      /** Insert the readmore break at the cursor, removing any other one (an article has at most one) */
      setReadmore: () => ReturnType;
    };
    embed: {
      /** Insert an embed block, or change the selected embed block's kind and content */
      setEmbed: (value: EmbedValue) => ReturnType;
      /** Insert an embed block, after the selected block if one is selected (rather than in its place) */
      insertEmbed: (value: EmbedValue) => ReturnType;
    };
    raw: {
      /** Turn the current block into a raw block, or a raw block back into a paragraph */
      toggleRaw: () => ReturnType;
    };
  }
}

/** A button in a block's header */
interface BlockButton {
  text: string;
  /** Called with the block's position and element */
  onClick: (pos: number, dom: HTMLElement) => void;
}

/** Event fired (bubbling) by an embed block's "Edit" button, after selecting the block */
export const EMBED_EDIT_EVENT = "embed-edit";

/** Event that makes an embed block show itself again, e.g. once the embed tools are known (fired at `.embed-block`) */
export const EMBED_REFRESH_EVENT = "embed-refresh";

/**
 * Create the editor's view of a block: a labelled box with a "Remove" button, that can also be clicked to select it
 * (then deleted with Backspace or Delete, or changed from the toolbar). The saved HTML still comes from the node's
 * renderHTML. Returns the view and its parts, so blocks can add their own content.
 *
 * @param buttons - extra buttons shown before "Remove"
 */
export const blockView = (
  className: string,
  label: string,
  { editor, getPos }: Pick<NodeViewRendererProps, "editor" | "getPos">,
  buttons: BlockButton[] = [],
) => {
  const dom = document.createElement("div");
  dom.className = className;
  dom.contentEditable = "false";
  const header = document.createElement("div");
  header.className = "block-header";
  const title = document.createElement("span");
  title.textContent = label;
  header.append(title);
  dom.append(header);

  const remove: BlockButton = {
    text: "Remove",
    onClick: (pos) => {
      const node = editor.state.doc.nodeAt(pos) as ProseMirrorNode;
      editor
        .chain()
        .focus()
        .deleteRange({ from: pos, to: pos + node.nodeSize })
        .run();
    },
  };
  for (const { text, onClick } of [...buttons, remove]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", () => {
      // The block may have been removed meanwhile
      const pos = getPos();
      if (typeof pos === "number") onClick(pos, dom);
    });
    header.append(button);
  }

  const view: NodeView = {
    dom,
    // Clicks on the block's buttons are handled by the buttons, not the editor
    stopEvent: (event) =>
      (event.target as HTMLElement).closest("button") !== null,
    // Previews and labels change inside the block without changing the document
    ignoreMutation: () => true,
  };
  return { view, dom, title };
};

/**
 * The `<!-- readmore -->` break, saved as `<hr class="readmore">` and shown in the editor as a "Read more" box with a
 * "Remove" button.
 */
export const Readmore = Node.create({
  name: "readmore",
  group: "block",
  atom: true,
  // Parsed before the plain horizontal rule
  priority: 1000,
  parseHTML: () => [{ tag: "hr.readmore" }],
  renderHTML: () => ["hr", { class: "readmore", title: "Read more" }],
  addNodeView: () => (props) =>
    blockView("readmore-block", "Read more", props).view,
  addCommands() {
    return {
      setReadmore:
        () =>
        ({ chain, state }) => {
          // Existing breaks, removed from the end so earlier positions stay valid
          const existing: number[] = [];
          state.doc.descendants((node, pos) => {
            if (node.type.name === this.name) existing.push(pos);
          });
          return chain()
            .command(({ tr }) => {
              for (const pos of existing.reverse()) tr.delete(pos, pos + 1);
              return true;
            })
            .insertContent({ type: this.name })
            .command(({ tr }) => {
              // Put the cursor at the start of the paragraph after the break (adding one if the next block isn't
              // text), so typing continues after it rather than replacing it
              let after = 0;
              tr.doc.descendants((node, pos) => {
                if (node.type.name === this.name) after = pos + 1;
              });
              if (!tr.doc.nodeAt(after)?.isTextblock)
                tr.insert(
                  after,
                  (state.schema.nodes.paragraph as NodeType).create(),
                );
              tr.setSelection(TextSelection.create(tr.doc, after + 1));
              return true;
            })
            .run();
        },
    };
  },
});

/**
 * A raw block (`<!-- raw -->...<!-- /raw -->` on its own lines): plain text that the website shows exactly as it is
 * written, with no Markdown, embeds or shortcodes. Saved as `<pre class="raw">`, and edited like a code block (Enter
 * adds a line break, Mod-Enter leaves it).
 */
export const Raw = Node.create({
  name: "raw",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  // Parsed before code blocks, which are also `<pre>`
  priority: 1000,
  parseHTML: () => [{ tag: "pre.raw", preserveWhitespace: "full" }],
  renderHTML: () => ["pre", { class: "raw" }, 0],
  addCommands() {
    return {
      toggleRaw:
        () =>
        ({ commands }) =>
          commands.toggleNode(this.name, "paragraph"),
    };
  },
});

/**
 * Raw text within a line (`text <!-- raw -->...<!-- /raw --> text`), shown exactly as it is written. Saved as
 * `<span class="raw">`; it can't have other formatting.
 */
export const RawInline = Mark.create({
  name: "rawInline",
  code: true,
  excludes: "_",
  parseHTML: () => [{ tag: "span.raw" }],
  renderHTML: () => ["span", { class: "raw" }, 0],
});

/**
 * Smaller text, saved as `<small>`.
 */
export const Small = Mark.create({
  name: "small",
  parseHTML: () => [{ tag: "small" }],
  renderHTML: () => ["small", 0],
});

/**
 * Bigger text, saved as `<big>` (which browsers still show bigger, although HTML no longer recommends it).
 */
export const Big = Mark.create({
  name: "big",
  parseHTML: () => [{ tag: "big" }],
  renderHTML: () => ["big", 0],
});

/** The frames of embed blocks, by their window, for sizing them to their content */
const embedFrames = new Map<MessageEventSource, HTMLIFrameElement>();

// Embed frames send their height (see the editor API's embed frame page); each frame is sized to fit, up to a limit
addEventListener("message", (event: MessageEvent) => {
  const frame = event.source && embedFrames.get(event.source);
  const height = (event.data as { edahaEmbedHeight?: unknown } | null)
    ?.edahaEmbedHeight;
  if (frame && typeof height === "number")
    frame.style.height = `${Math.min(Math.max(height, 40), 2000)}px`;
});

/** Stop sizing the embed frames inside an element (e.g. before they are removed) */
const forgetFrames = (element: Element): void => {
  for (const [source, frame] of embedFrames)
    if (element.contains(frame)) embedFrames.delete(source);
};

/** The editor's theme, for embed frames: its chosen one, or else the visitor's setting */
const editorTheme = (): "light" | "dark" =>
  document.documentElement.dataset.theme === "dark" ||
  (document.documentElement.dataset.theme !== "light" &&
    globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches)
    ? "dark"
    : "light";

/** Options of the embed block */
export interface EmbedOptions {
  /** The embed tools (read when a block is shown, so they can be set after the editor is created) */
  tools: () => EmbedTools | undefined;
}

/**
 * An embed block (`<!-- embed:<key> -->content<!-- /embed:<key> -->`), saved as
 * `<div class="embed" data-embed="key" data-content="...">` and shown in the editor as a box with its kind, the embed
 * in a sandboxed frame (as the editor shows it, see the embed plugins' `editor` renderers), and "Edit" and "Remove"
 * buttons. "Edit" selects the block and fires EMBED_EDIT_EVENT, so the toolbar can ask for its new kind and content.
 */
export const Embed = Node.create<EmbedOptions>({
  name: "embed",
  group: "block",
  atom: true,
  addOptions: () => ({ tools: () => undefined }),
  addAttributes: () => ({
    key: { default: "" },
    content: { default: "" },
    options: { default: {} },
  }),
  parseHTML: () => [
    {
      tag: "div.embed",
      getAttrs: (element) => ({
        key: element.getAttribute("data-embed") ?? "",
        content: element.getAttribute("data-content") ?? "",
        options: embedOptionsOf(element.getAttribute("data-options")),
      }),
    },
  ],
  renderHTML: ({ node }) => [
    "div",
    {
      class: "embed",
      "data-embed": node.attrs.key as string,
      "data-content": node.attrs.content as string,
      // Left out without options
      "data-options": Object.keys(node.attrs.options as object).length
        ? JSON.stringify(node.attrs.options)
        : null,
    },
  ],
  addNodeView() {
    return (props) => {
      const { editor } = props;
      const block = blockView("embed-block", "", props, [
        {
          text: "Edit",
          onClick: (pos, dom) => {
            editor.commands.setNodeSelection(pos);
            dom.dispatchEvent(new Event(EMBED_EDIT_EVENT, { bubbles: true }));
          },
        },
      ]);
      const edit = block.dom.querySelector("button") as HTMLButtonElement;
      const icon = document.createElement("span");
      icon.className = "icon embed-icon";
      icon.setAttribute("aria-hidden", "true");
      block.title.before(icon);
      const preview = document.createElement("div");
      preview.className = "embed-preview";
      block.dom.append(preview);

      let shown = "";
      let current = props.node.attrs as EmbedValue;
      /** Show an embed's kind and load its frame */
      const show = async (value: EmbedValue) => {
        const id = `${value.key}\0${JSON.stringify(value.options)}\0${value.content}`;
        if (id === shown) return;
        shown = id;
        const tools = this.options.tools();
        const info = tools?.embeds.find((embed) => embed.key === value.key);
        block.title.textContent = embedName(tools?.embeds ?? [], value.key);
        icon.innerHTML = info?.icon ?? "";
        // Only embeds the site has a plugin for can be changed here (others can be removed, or changed as Markdown)
        edit.hidden = !info;
        forgetFrames(preview);
        preview.replaceChildren();
        const text = document.createElement("pre");
        text.className = "embed-content";
        text.textContent = embedText(value.content, value.options);
        if (!tools) {
          preview.append(text);
          return;
        }
        preview.textContent = "Loading…";
        try {
          const result = await tools.loadFrame(value);
          // Ignore a frame for an embed that has since changed
          if (shown !== id) return;
          preview.replaceChildren();
          for (const warning of result.warnings) {
            const message = document.createElement("p");
            message.className = "embed-warning";
            message.textContent = warning;
            preview.append(message);
          }
          // Content that isn't valid is left out of the website: say why, under its content
          if (result.errors.length) {
            const errors = document.createElement("div");
            errors.className = "embed-errors";
            const intro = document.createElement("p");
            intro.textContent =
              "This embed isn't valid, so the website leaves it out:";
            const list = document.createElement("ul");
            for (const error of result.errors) {
              const item = document.createElement("li");
              item.textContent = error;
              list.append(item);
            }
            errors.append(intro, list);
            preview.append(errors);
          }
          // An embed that can't be shown is shown as it is written
          if (result.errors.length || result.warnings.length) {
            preview.append(text);
            return;
          }
          const frame = document.createElement("iframe");
          frame.className = "embed-frame";
          frame.title = `${block.title.textContent}: preview`;
          // From the previews' own origin, it can run the embed's scripts (and its players theirs) but can't reach the
          // editor; the sandbox keeps it from sending forms or navigating the editor page
          frame.setAttribute(
            "sandbox",
            "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox",
          );
          frame.src = previewAddress(`${result.url}?theme=${editorTheme()}`);
          preview.append(frame);
          if (frame.contentWindow) embedFrames.set(frame.contentWindow, frame);
        } catch (error) {
          if (shown === id)
            preview.textContent = `No preview: ${(error as Error).message}`;
        }
      };
      void show(current);
      block.dom.addEventListener(EMBED_REFRESH_EVENT, () => {
        shown = "";
        void show(current);
      });

      return {
        ...block.view,
        // Show a changed embed without re-creating the view
        update: (updated) => {
          if (updated.type !== this.type) return false;
          current = updated.attrs as EmbedValue;
          void show(current);
          return true;
        },
        destroy: () => forgetFrames(preview),
      };
    };
  },
  addCommands() {
    return {
      setEmbed:
        (value: EmbedValue) =>
        ({ commands, editor }) =>
          editor.isActive(this.name)
            ? commands.updateAttributes(this.name, value)
            : commands.insertContent({ type: this.name, attrs: value }),
      insertEmbed:
        (value: EmbedValue) =>
        ({ commands, state }) =>
          state.selection instanceof NodeSelection
            ? commands.insertContentAt(state.selection.to, {
                type: this.name,
                attrs: value,
              })
            : commands.insertContent({ type: this.name, attrs: value }),
    };
  },
});

/**
 * Show each heading's ID after it (e.g. `#this-is-an-example`), as the website gives it from the heading's text, so it
 * can be copied for links. The IDs aren't saved: they come from the text whenever the article is built.
 */
export const HeadingIds = Extension.create({
  name: "headingIds",
  addProseMirrorPlugins: () => [
    new Plugin({
      key: new PluginKey("headingIds"),
      props: {
        decorations: (state) => {
          const headings: { pos: number; node: ProseMirrorNode }[] = [];
          state.doc.descendants((node, pos) => {
            if (node.type.name === "heading") headings.push({ pos, node });
          });
          const ids = headingIds(headings.map(({ node }) => node.textContent));
          return DecorationSet.create(
            state.doc,
            headings.flatMap(({ pos, node }, i) => {
              const id = ids[i] as string;
              if (!id) return [];
              const label = document.createElement("span");
              label.className = "heading-id";
              label.contentEditable = "false";
              label.textContent = `#${id}`;
              return [
                Decoration.widget(pos + node.nodeSize - 1, label, {
                  side: 1,
                  key: id,
                  ignoreSelection: true,
                }),
              ];
            }),
          );
        },
      },
    }),
  ],
});

/**
 * Select a whole details block when its box is clicked (its border, padding or "Details" label, rather than its
 * summary or content), so it can be cut, copied, pasted, deleted or moved like the other blocks.
 */
export const SelectDetails = Extension.create({
  name: "selectDetails",
  addProseMirrorPlugins: () => [
    new Plugin({
      key: new PluginKey("selectDetails"),
      props: {
        handleClickOn: (view, _pos, node, nodePos, _event, direct) => {
          if (!direct || node.type.name !== "details") return false;
          view.dispatch(
            view.state.tr.setSelection(
              NodeSelection.create(view.state.doc, nodePos),
            ),
          );
          return true;
        },
      },
    }),
  ],
});
