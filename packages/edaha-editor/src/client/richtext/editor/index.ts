import { Editor, isTextSelection } from "@tiptap/core";
import BubbleMenu from "@tiptap/extension-bubble-menu";
import {
  Details,
  DetailsContent,
  DetailsSummary,
} from "@tiptap/extension-details";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import type { EmbedTools } from "../../embeds/index.ts";
import {
  Big,
  Embed,
  HeadingIds,
  Raw,
  RawInline,
  Readmore,
  SelectDetails,
  Small,
} from "../extensions/index.ts";

/** Gives the address an image is shown from, for its `src` in the body (e.g. on the editor's server) */
export type FileAddress = (src: string) => string;

/**
 * Images, shown from the address `address` gives for their `src`, which the body's HTML keeps as it is.
 *
 * @example
 * AddressedImage.configure({ address: (src) => `http://127.0.0.1:5193${src}` });
 */
export const AddressedImage = Image.extend<{ address: FileAddress }>({
  addOptions() {
    return { ...this.parent?.(), address: (src: string) => src } as never;
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("img");
      /** Show an image node's attributes */
      const show = ({ attrs }: typeof node) => {
        // Images always have a src: Tiptap only reads <img> elements with one
        dom.src = this.options.address(String(attrs.src));
        for (const name of ["alt", "title"] as const)
          if (attrs[name]) dom.setAttribute(name, String(attrs[name]));
          else dom.removeAttribute(name);
      };
      show(node);
      return {
        dom,
        update: (updated) => {
          if (updated.type !== node.type) return false;
          show(updated);
          return true;
        },
      };
    };
  },
});

/**
 * Whether the floating format toolbar shows: while text is selected in the editor (or focus is in the toolbar), and
 * not in code or raw text, which can't be formatted.
 *
 * @example
 * showFormatMenu(editor, menu); // true while "Hello" is selected in a paragraph
 */
export const showFormatMenu = (editor: Editor, menu: HTMLElement): boolean => {
  const { selection, doc } = editor.state;
  return (
    (editor.view.hasFocus() || menu.contains(document.activeElement)) &&
    editor.isEditable &&
    isTextSelection(selection) &&
    doc.textBetween(selection.from, selection.to).length > 0 &&
    !editor.isActive("codeBlock") &&
    !editor.isActive("raw") &&
    !editor.isActive("rawInline")
  );
};

/**
 * Create a Tiptap editor for an article body, with images, links, tables, collapsible details blocks, small and big
 * text, heading IDs shown after headings, the readmore break and embed blocks.
 *
 * @param onUpdate - called with the new HTML whenever the content changes
 * @param embedTools - the embed tools, for embed blocks' names and frames (read when a block is shown)
 * @param formatMenu - a toolbar to float above selected text (see showFormatMenu), if any
 * @param fileAddress - the address images are shown from, for their `src` (default: their `src`)
 *
 * @example
 * const editor = createRichtextEditor(element, "<p>Hello</p>", (html) => console.log(html));
 */
export const createRichtextEditor = (
  element: HTMLElement,
  content: string,
  onUpdate: (html: string) => void,
  embedTools: () => EmbedTools | undefined = () => undefined,
  formatMenu?: HTMLElement,
  fileAddress: FileAddress = (src) => src,
): Editor =>
  new Editor({
    element,
    content,
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, autolink: true },
        heading: { levels: [1, 2, 3, 4] },
      }),
      AddressedImage.configure({ address: fileAddress }),
      // Tables are saved as Markdown (GFM) tables
      TableKit.configure({ table: { resizable: false } }),
      Details,
      DetailsSummary,
      DetailsContent,
      SelectDetails,
      Small,
      Big,
      HeadingIds,
      Readmore,
      Raw,
      RawInline,
      Embed.configure({ tools: embedTools }),
      ...(formatMenu
        ? [
            BubbleMenu.configure({
              element: formatMenu,
              shouldShow: ({ editor }) => showFormatMenu(editor, formatMenu),
            }),
          ]
        : []),
    ],
    onUpdate: ({ editor }) => onUpdate(editor.getHTML()),
  });
