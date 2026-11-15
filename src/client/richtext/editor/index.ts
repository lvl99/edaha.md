import { Editor } from "@tiptap/core";
import {
  Details,
  DetailsContent,
  DetailsSummary,
} from "@tiptap/extension-details";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import type { EmbedPreview } from "../../../server/types/index.ts";
import {
  Big,
  Embed,
  HeadingIds,
  Readmore,
  SelectDetails,
  Small,
} from "../extensions/index.ts";

/**
 * Create a Tiptap editor for an article body, with images, links, tables, collapsible details blocks, small and big
 * text, heading IDs shown after headings, the readmore break and embed blocks.
 *
 * @param onUpdate - called with the new HTML whenever the content changes
 * @param loadEmbedPreview - renders embed URLs for previews inside embed blocks
 *
 * @example
 * const editor = createRichtextEditor(element, "<p>Hello</p>", (html) => console.log(html));
 */
export const createRichtextEditor = (
  element: HTMLElement,
  content: string,
  onUpdate: (html: string) => void,
  loadEmbedPreview?: (url: string) => Promise<EmbedPreview>,
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
      Embed.configure({ loadPreview: loadEmbedPreview }),
    ],
    onUpdate: ({ editor }) => onUpdate(editor.getHTML()),
  });
