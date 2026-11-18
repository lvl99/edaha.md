<!--yaml
status: published
date: 2026-11-15T20:36:00.000+02:00
-->

# WYSIWYG editor

edaha.md comes with an editor that lets you write and manage your website's articles in your browser, without editing Markdown files. What you see as you write is what your visitors will see. <!-- readmore -->

## Opening the editor

Someone who manages the project starts the editor on your computer (see [Starting the editor](#starting-the-editor)). Then open <http://127.0.0.1:5180> in your browser.

The editor only works on your own computer: nobody else can see it or use it.

The editor fills the window in three columns, each scrolling on its own: the list of articles, the article's title and body, and its buttons and settings.

On a phone or a narrow window, the list of articles opens from the menu button at the top, and **Save**, **Reset…** and **Delete…** sit in a bar at the bottom of the screen. Its **︽** button opens the article's settings over the whole screen; **︾** or Escape closes them.

## Finding articles

The list of articles shows every article, including drafts, grouped by type with the newest first. Each shows its title, then its type and slug, status and date. Use **Type** to show one type only, and pick an article to open it.

## Writing an article

1. Choose **New article**, or open an existing one.
2. Give it a **Title**.
3. Write in the **Body**. The toolbar's buttons format your text. Each shows an icon; point at it to see its name:
   - **Bold**, **Italic**, **Small** and **Big** text;
   - **Link**, **Heading** and **Subheading**;
   - **Bullet list**, **Numbered list**, **Quote** and **Code**;
   - **Details**: a block readers can open and close;
   - **Image URL**, **Upload image** and **Table**, with **Add row**, **Add column**, **Remove row**, **Remove column** and **Remove table** while you are in a table;
   - **Embed**: a YouTube video, Bandcamp player or other [embed](/docs/07-embeds/), from its address;
   - **Raw**: text shown exactly as you type it, without any formatting, e.g. to show Markdown or HTML as text. Press Enter for a new line, and Cmd+Enter (Ctrl+Enter on Windows and Linux) to leave it;
   - **Read more**: where the article's summary in lists ends.
4. Choose **Save**.

**Upload image** saves the image into the article's folder, so it needs the article to be saved first.

## Settings

The **Configuration** section holds the article's settings:

| Setting              | What it does                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| **Type**             | The kind of article, e.g. News or Page.                                                          |
| **Template**         | How the article is laid out, if your website has more than one layout for it.                    |
| **Status**           | **Published** (listed), **Unlisted** (its own page only) or **Draft** (not on the website).      |
| **Slug**             | The last part of the article's address. Left empty, it is made from the title.                   |
| **Publication date** | The article's date.                                                                              |
| **Excerpt**          | A summary for lists. Left empty, the text before **Read more** (or the article's start) is used. |
| **Thumbnail**        | An image shown in lists.                                                                         |

The form also has the **Author** (name, email address and homepage), **Tags**, and **Attachments**: files to download, uploaded with **Upload file** or linked by address. Uploads need the article to be saved first.

Changing an article's type or slug moves it, with all its files.

## Checking your work

Three tabs above the body change what you see. Move between them with the arrow keys, and press Enter or Space to show one.

- **WYSIWYG**: the rich text editor.
- **Markdown**: the body as Markdown, if you'd like to edit it directly. Its toolbar has the same buttons, which write Markdown for you, or HTML where Markdown has nothing for it (small and big text, and details blocks). Cmd+Z (Ctrl+Z on Windows and Linux) undoes them like typing.
- **Preview**: the article as your website will show it, with its layout and styles. Drafts are shown as if published. **Width** shows it at full width, or at 900px or 320px wide (like a tablet or a phone), centred.

## Saving, resetting and deleting

- **Save** writes your changes. Saving also tidies the file's Markdown.
- **Reset…** goes back to how the article was last saved.
- **Delete…** deletes the article and all its files, after asking you.

If you open another article or start a new one with changes that aren't saved, the editor asks whether to save them first. Your browser also warns you before you close the page with unsaved changes.

## For developers

### Starting the editor

```sh
npx edaha editor
```

It finds the site's [config file](/docs/03-configuration/#where-it-is-found) like `edaha build` does, and takes the same `--config` and `--dir` options, plus `--port` (default `5180`). It only listens on `127.0.0.1`, as it reads and writes the site's files: **never deploy it**. Its API only accepts changes from the editor page itself.

The editor reads and writes the same `article.md` files you would edit by hand. A saved article keeps its header format (`yaml`, `yml` or `json`); new articles get `yaml`. Settings edaha.md doesn't know are left out when saving. Changes to the config file and templates show without restarting it.

Preview pages are sent with a Content Security Policy that forbids scripts, requests and forms, so nothing in an article can use the editor's API. Frames are only allowed from the origins that embeds list in `frameSources`.

### Extending the editor with custom embeds

Embeds you add to a JavaScript config file's `embeds` setting work in the editor too: the **Embed** button previews them, and the preview pages render them as the website will.

```js
// edaha.config.mjs
export default {
  name: "My Site",
  description: "News and notes.",
  embeds: [
    {
      name: "Vimeo",
      // Let the preview pages show its iframes
      frameSources: ["https://player.vimeo.com"],
      match: (url) => url.hostname === "vimeo.com",
      render: async (url) =>
        `<iframe src="https://player.vimeo.com/video${url.pathname}" title="Vimeo video"></iframe>`,
    },
  ],
};
```

The editor reads the config file again for each preview, so you can change an embed and see the result without restarting it. See [Embeds](/docs/07-embeds/) for how to write one.

### Starting it from code

```ts
import { startEditor } from "@lvl99dotcom/edaha.md";

const editor = await startEditor({
  siteDir: "my-site",
  port: 5180,
  // Embeds tried after the config file's (default: the built-in ones)
  embedRenderers: [],
});
console.log(`Open ${editor.url}`);
```
