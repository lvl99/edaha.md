import { html } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import addColumnRight from "@material-symbols/svg-400/outlined/add_column_right.svg?raw";
import addPhotoAlternate from "@material-symbols/svg-400/outlined/add_photo_alternate.svg?raw";
import addRowBelow from "@material-symbols/svg-400/outlined/add_row_below.svg?raw";
import close from "@material-symbols/svg-400/outlined/close.svg?raw";
import codeBlocks from "@material-symbols/svg-400/outlined/code_blocks.svg?raw";
import deleteSweep from "@material-symbols/svg-400/outlined/delete_sweep.svg?raw";
import expandCircleDown from "@material-symbols/svg-400/outlined/expand_circle_down.svg?raw";
import contentCopy from "@material-symbols/svg-400/outlined/content_copy.svg?raw";
import deleteIcon from "@material-symbols/svg-400/outlined/delete.svg?raw";
import findReplace from "@material-symbols/svg-400/outlined/find_replace.svg?raw";
import folderOpen from "@material-symbols/svg-400/outlined/folder_open.svg?raw";
import formatBold from "@material-symbols/svg-400/outlined/format_bold.svg?raw";
import formatH2 from "@material-symbols/svg-400/outlined/format_h2.svg?raw";
import formatH3 from "@material-symbols/svg-400/outlined/format_h3.svg?raw";
import formatItalic from "@material-symbols/svg-400/outlined/format_italic.svg?raw";
import formatListBulleted from "@material-symbols/svg-400/outlined/format_list_bulleted.svg?raw";
import formatListNumbered from "@material-symbols/svg-400/outlined/format_list_numbered.svg?raw";
import formatQuote from "@material-symbols/svg-400/outlined/format_quote.svg?raw";
import image from "@material-symbols/svg-400/outlined/image.svg?raw";
import link from "@material-symbols/svg-400/outlined/link.svg?raw";
import manageSearch from "@material-symbols/svg-400/outlined/manage_search.svg?raw";
import menu from "@material-symbols/svg-400/outlined/menu.svg?raw";
import playlistRemove from "@material-symbols/svg-400/outlined/playlist_remove.svg?raw";
import rawOn from "@material-symbols/svg-400/outlined/raw_on.svg?raw";
import readMore from "@material-symbols/svg-400/outlined/read_more.svg?raw";
import smartDisplay from "@material-symbols/svg-400/outlined/smart_display.svg?raw";
import table from "@material-symbols/svg-400/outlined/table.svg?raw";
import textDecrease from "@material-symbols/svg-400/outlined/text_decrease.svg?raw";
import textIncrease from "@material-symbols/svg-400/outlined/text_increase.svg?raw";

/**
 * The editor's icons: Material Symbols (outlined, weight 400), bundled as SVG so only these are included.
 */
export const ICONS = {
  add_column_right: addColumnRight,
  add_photo_alternate: addPhotoAlternate,
  add_row_below: addRowBelow,
  close,
  content_copy: contentCopy,
  delete: deleteIcon,
  find_replace: findReplace,
  folder_open: folderOpen,
  code_blocks: codeBlocks,
  delete_sweep: deleteSweep,
  expand_circle_down: expandCircleDown,
  format_bold: formatBold,
  format_h2: formatH2,
  format_h3: formatH3,
  format_italic: formatItalic,
  format_list_bulleted: formatListBulleted,
  format_list_numbered: formatListNumbered,
  format_quote: formatQuote,
  image,
  link,
  manage_search: manageSearch,
  menu,
  playlist_remove: playlistRemove,
  raw_on: rawOn,
  read_more: readMore,
  smart_display: smartDisplay,
  table,
  text_decrease: textDecrease,
  text_increase: textIncrease,
} as const;

/** The name of one of the editor's icons */
export type IconName = keyof typeof ICONS;

/**
 * The formatting toolbars' icons, by button label. Both the rich text and the Markdown toolbars use them, so the same
 * button looks the same in both.
 */
export const TOOLBAR_ICONS: Record<string, IconName> = {
  Bold: "format_bold",
  Italic: "format_italic",
  Small: "text_decrease",
  Big: "text_increase",
  Link: "link",
  Heading: "format_h2",
  Subheading: "format_h3",
  "Bullet list": "format_list_bulleted",
  "Numbered list": "format_list_numbered",
  Quote: "format_quote",
  Code: "code_blocks",
  Details: "expand_circle_down",
  "Image URL": "image",
  Table: "table",
  "Add row": "add_row_below",
  "Add column": "add_column_right",
  "Remove row": "playlist_remove",
  // Turned on its side by the stylesheet, as there is no icon for removing a column
  "Remove column": "playlist_remove",
  "Remove table": "delete_sweep",
  Embed: "smart_display",
  Raw: "raw_on",
  "Read more": "read_more",
  "Upload image": "add_photo_alternate",
};

/**
 * Render an icon, hidden from screen readers (its button or link names what it does).
 *
 * @example
 * html`<button type="button">${icon("menu")}<span class="visually-hidden">Articles</span></button>`
 */
export const icon = (name: IconName) =>
  html`<span class="icon icon-${name}" aria-hidden="true"
    >${unsafeHTML(ICONS[name])}</span
  >`;

/**
 * Render a toolbar button's content: its icon and its label, which is read by screen readers and shown as a tooltip.
 *
 * @example
 * html`<button type="button" title="Bold">${toolbarButtonContent("Bold")}</button>`
 */
export const toolbarButtonContent = (label: string) => {
  const name = TOOLBAR_ICONS[label];
  return name
    ? html`${icon(name)}<span class="visually-hidden">${label}</span>`
    : label;
};
