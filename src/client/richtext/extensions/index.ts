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
import { headingIds } from "../../../generator/slug/index.ts";
import type { EmbedPreview } from "../../../server/types/index.ts";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    readmore: {
      /** Insert the readmore break at the cursor, removing any other one (an article has at most one) */
      setReadmore: () => ReturnType;
    };
    embed: {
      /** Insert an embed block for a URL, or change the selected embed block's URL */
      setEmbed: (url: string) => ReturnType;
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

/** The label of an embed block in the editor */
const embedLabel = (url: string) => `Embed: ${url}`;

/** Options of the embed block */
export interface EmbedOptions {
  /** Renders a URL as the website would, for a preview inside the block (no preview without it) */
  loadPreview: ((url: string) => Promise<EmbedPreview>) | undefined;
}

/**
 * An embed block (`<!-- embed -->URL<!-- /embed -->`), saved as `<div class="embed">URL</div>` and shown in the
 * editor as an "Embed: URL" box with a preview and "Edit" and "Remove" buttons. "Edit" selects the block and fires
 * EMBED_EDIT_EVENT, so the toolbar can ask for the new URL.
 */
export const Embed = Node.create<EmbedOptions>({
  name: "embed",
  group: "block",
  atom: true,
  addOptions: () => ({ loadPreview: undefined }),
  addAttributes: () => ({ url: { default: "" } }),
  parseHTML: () => [
    {
      tag: "div.embed",
      // An element always has text content (possibly empty)
      getAttrs: (element) => ({ url: String(element.textContent).trim() }),
    },
  ],
  renderHTML: ({ node }) => [
    "div",
    { class: "embed" },
    node.attrs.url as string,
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
      const preview = document.createElement("div");
      preview.className = "embed-preview";
      block.dom.append(preview);

      let url = "";
      /** Show a URL's label and load its preview */
      const show = async (next: string) => {
        if (next === url) return;
        url = next;
        block.title.textContent = embedLabel(url);
        const loadPreview = this.options.loadPreview;
        if (!loadPreview) return;
        preview.textContent = "Loading preview…";
        try {
          const result = await loadPreview(url);
          // Ignore a preview for a URL that has since changed
          if (url !== next) return;
          preview.innerHTML = result.html;
          // Lazy frames never start loading inside the editable area
          for (const frame of preview.querySelectorAll("iframe"))
            frame.removeAttribute("loading");
          for (const warning of result.warnings) {
            const message = document.createElement("p");
            message.className = "embed-warning";
            message.textContent = warning;
            preview.prepend(message);
          }
        } catch (error) {
          if (url === next)
            preview.textContent = `No preview: ${(error as Error).message}`;
        }
      };
      void show(props.node.attrs.url as string);

      return {
        ...block.view,
        // Show a changed URL without re-creating the view
        update: (updated) => {
          if (updated.type !== this.type) return false;
          void show(updated.attrs.url as string);
          return true;
        },
      };
    };
  },
  addCommands() {
    return {
      setEmbed:
        (url: string) =>
        ({ commands, editor }) =>
          editor.isActive(this.name)
            ? commands.updateAttributes(this.name, { url })
            : commands.insertContent({ type: this.name, attrs: { url } }),
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
