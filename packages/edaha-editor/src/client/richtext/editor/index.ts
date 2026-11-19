import { Editor } from "@tiptap/core";
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

/**
 * Create a Tiptap editor for an article body, with images, links, tables, collapsible details blocks, small and big
 * text, heading IDs shown after headings, the readmore break and embed blocks.
 *
 * @param onUpdate - called with the new HTML whenever the content changes
 * @param embedTools - the embed tools, for embed blocks' names and frames (read when a block is shown)
 *
 * @example
 * const editor = createRichtextEditor(element, "<p>Hello</p>", (html) => console.log(html));
 */
export const createRichtextEditor = (
  element: HTMLElement,
  content: string,
  onUpdate: (html: string) => void,
  embedTools: () => EmbedTools | undefined = () => undefined,
): Editor =>
  new Editor({
    element,
    content,
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, autolink: true },
        heading: { levels: [2, 3, 4] },
      }),
      Image,
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
    ],
    onUpdate: ({ editor }) => onUpdate(editor.getHTML()),
  });
