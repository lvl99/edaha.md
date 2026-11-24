<!--yaml
status: published
date: 2026-11-15T18:36:00.000Z
author: false
-->

# WYSIWYG editor

edaha.md comes with an editor that lets you write and manage your website's articles in your browser, without editing Markdown files. What you see as you write is what your visitors will see.

<!-- readmore -->

## Opening the editor

Someone who manages the project starts the editor on your computer (see [Starting the editor](#starting-the-editor)). Then open [http://127.0.0.1:5180](http://127.0.0.1:5180) in your browser.

The editor only works on your own computer: nobody else can see it or use it.

The editor fills the window in three columns, each scrolling on its own: the list of articles, the article's title and body, and its buttons and settings.

On a phone or a narrow window, the list of articles opens from the menu button at the top, and **Save**, **Reset…** and **Delete…** sit in a bar at the bottom of the screen. Its **︽** button opens the article's settings over the whole screen; **︾** or Escape closes them.

On a wider window, **Focus mode** (the button at the top right of the title) hides the list of articles and the settings in the same way, keeping the title and body in the middle of the window, at most 900px wide. Choose it again to show them beside the article. Focus mode is off each time you open the editor.

## Finding articles

When the editor opens (or you choose **Home** or **edaha.md** at the top of the list), the welcome prompt in the middle offers to **Write a new article** or **edit an existing one** (which opens the article browser), and shows the 6 most recently changed articles; pick one to open it. When there are more, **Open article browser** opens the article browser.

The list of articles shows the 5 most recently changed articles of each type, including drafts. Pick an article to open it. When a type has more, **Show all** opens them all in the article browser.

To find any other article:

- Type in **Search titles** to see up to 10 articles whose titles contain your text. **See all results** shows every match in the article browser. Press Escape to clear the search.
- Choose **All articles** (the button beside the search) to open the article browser. Search titles and filter by **Type**, **Author**, **Tag** and **Status**. The articles are listed in a table with their title, type, status, publication date and when they last changed, newest published first. Choose a column's heading to sort by it: once for ascending, again for descending, and a third time to go back to newest published first. It shows 50 articles at a time; **Previous** and **Next** move between pages.

Searches and the article browser include changes made outside the editor straight away, e.g. articles added by someone else or edited in a text editor. The list of recent articles shows them after you save or delete an article, or reload the page.

## Writing an article

1. Choose **New article**, or open an existing one.
2. Give it a **Title**.
3. Write in the **Body**. The toolbar's buttons format your text. Each shows an icon; point at it to see its name:
   - **Bold**, **Italic**, **Underline**, **Strikethrough**, **Small** and **Big** text;
   - **Link**, **Heading** and **Subheading**;
   - **Bullet list**, **Numbered list**, **Quote** and **Code**;
   - **Details**: a block readers can open and close;
   - **Image URL**, **Upload image**, **Choose file** and **Table**, with **Add row**, **Add column**, **Remove row**, **Remove column** and **Remove table** while you are in a table;
   - a button for each of the site's [embeds](/docs/07-embeds/), e.g. **YouTube video** or **MermaidJS diagram**: paste or write its content (e.g. a video's address; some embeds, e.g. a table of contents, can be added without any), and set its options, if it has any (e.g. the Bandcamp player's layout), below the content. Options show their defaults, and options that don't apply to the others' values are hidden. If the content or options aren't right for that kind of embed, the dialog says why before adding it. The body shows the embed as the website will; its **Edit** button (or its kind's toolbar button, while it is selected) changes it. An embed that isn't valid lists why in the body, and the website leaves it out. An embed's kind can't be changed: remove it and add another. One whose kind the site has no plugin for can only be removed, or changed in the **Markdown** tab;
   - **Raw**: text shown exactly as you type it, without any formatting, e.g. to show Markdown or HTML as text. Press Enter for a new line, and Cmd+Enter (Ctrl+Enter on Windows and Linux) to leave it;
   - **Read more**: where the article's summary in lists ends.
4. Choose **Save**.

Selecting text also shows a small toolbar just above it, with **Bold**, **Italic**, **Underline**, **Strikethrough**, **Link**, **Heading 1**, **Heading 2** and **Heading 3**. It doesn't show for code or raw text, which can't be formatted. From the keyboard, press Tab to move from the selected text into it, and Escape to go back to the text. Underlined text is saved as HTML (`<u>`), as Markdown has none, and struck-through text as `~~text~~`. The article's title is its page's main heading, so use **Heading 1** in the body sparingly.

**Upload image** saves the image into the article's folder, so it needs the article to be saved first.

**Choose file** opens the file browser (see [Managing files](#managing-files)) to choose a file you have already uploaded, in any article. An image is shown in the body; any other file is linked, from the text you selected or named after the file.

## Settings

The settings are in groups you can open and close: **Info** (type, status, slug, date and author), **Categorise** (tags), **Customise** (excerpt and template), **Files** (thumbnail, attachments and the article's files) and **Custom** (custom settings). Your website may add groups of its own. A group's heading is marked `*` when a setting in it has changed, and ⚠️ when one isn't valid; a group with an invalid setting opens.

What the settings do:

| Setting              | What it does                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| **Type**             | The kind of article, e.g. News or Page.                                                          |
| **Template**         | How the article is laid out, if your website has more than one layout for it.                    |
| **Status**           | **Published** (listed), **Unlisted** (its own page only) or **Draft** (not on the website).      |
| **Slug**             | The last part of the article's address. Left empty, it is made from the title.                   |
| **Publication date** | The article's date.                                                                              |
| **Excerpt**          | A summary for lists. Left empty, the text before **Read more** (or the article's start) is used. |
| **Thumbnail**        | An image shown in lists.                                                                         |

The form also has the **Author** (name, email address and homepage), **Tags**, and **Attachments**: files to download, uploaded with **Upload file**, chosen with **Choose existing file…**, or linked by address. Uploads need the article to be saved first. The thumbnail can also be chosen with **Choose existing file…**.

Changing an article's type or slug moves it, with all its files.

## Custom settings

If your website defines [custom settings](/docs/03-configuration/#metadata), such as a featured image or a rating, the ones the article's type uses are in the groups your website puts them in, or in **Custom**. Lists have **Add** and **Delete** buttons, and file fields upload into the article's folder (once it's saved), or choose an existing file with **Choose existing file…**.

When you leave a field, the editor checks its value. A problem shows above the field, and a message says some values aren't valid. The article can't be saved until they are fixed. Settings the article's type doesn't use, or that nobody defined (e.g. after a custom setting was removed from the config file), are listed in **Custom**, marked ⚠️. They are kept in the article unless you choose **Remove** beside one and save.

When the editor opens, **Needs attention** on the welcome prompt lists articles with problems in their settings. In the article browser, **Problems** shows only articles with errors, warnings or either.

## Checking your work

Three tabs above the body change what you see. Move between them with the arrow keys, and press Enter or Space to show one.

- **WYSIWYG**: the rich text editor.
- **Markdown**: the body as Markdown, if you'd like to edit it directly. Its toolbar has the same buttons, which write Markdown for you, or HTML where Markdown has nothing for it (underlined, small and big text, and details blocks). Cmd+Z (Ctrl+Z on Windows and Linux) undoes them like typing.
- **Preview**: the article as your website will show it, with its own template (see **Template** in its settings), layout and styles. Drafts are shown as if published. **Width** shows it at full width, or at 900px, 600px or 320px wide (like a tablet, a small tablet or a phone), centred.

## Managing files

Choose **Files** (beside **All articles**) to see every file in your articles' folders. Search their names, filter by **Type** (image, document, archive, video, audio or other) and **Article type**, and choose a column's heading to sort by it, as in the article browser. **Name** opens the file in a new tab, and **Location** opens its article in the editor (or in a new tab, if you hold cmd or ctrl as you choose it).

Each file has three buttons:

- **Copy URL** copies the file's address on your website, e.g. `/news/welcome/photo.jpg`, to paste into an article.
- **Replace…** swaps the file for another you choose. If the new file has another name, every article that shows or links to the old file is changed to use the new one.
- **Delete…** deletes the file after asking you. Articles that show it no longer do, links to it keep their text, and it is removed from thumbnails and attachments.

When you choose an existing file for an article, the file browser opens as **Choose a file**, with a **Choose** button beside each file; fields that only take images show images first. A file in the article's own folder is referred to by its name, and a file from another article by its address on your website.

The editor finds a file's uses in article bodies, thumbnails and attachments: by its name in its own article, and by its address in any article.

## Saving, resetting and deleting

- **Save** writes your changes. Saving also tidies the file's Markdown.
- **Reset…** goes back to how the article was last saved.
- **Delete…** deletes the article and all its files, after asking you.

If you open another article or start a new one with changes that aren't saved, the editor asks whether to save them first. Your browser also warns you before you close the page with unsaved changes.

## For developers

### Starting the editor

The editor is in its own package, `@lvl99dotcom/edaha-editor`. Install it next to `@lvl99dotcom/edaha.md` (see [Quick start](/docs/02-quick-start/)), then:

<!-- embed:codehighlight -->

```sh
npx edaha editor
```

<!-- /embed:codehighlight -->

Without the editor package, `edaha editor` stops and says how to install it.

It finds the site's [config file](/docs/03-configuration/#where-it-is-found) like `edaha build` does, and takes the same `--config` and `--dir` options, plus `--port` (default `5180`). It only listens on `127.0.0.1`, as it reads and writes the site's files: **never deploy it**. Its API only accepts changes from the editor page itself.

The editor reads and writes the same `article.md` files you would edit by hand. A saved article keeps its header format (`yaml`, `yml` or `json`); new articles get `yaml`. Settings edaha.md doesn't know are kept as they are when saving, with a warning. Changes to the config file and templates show without restarting it.

To list and search articles quickly, the editor keeps an index of every article's settings in memory: it reads them all when it starts, updates an article's entry when it saves, moves or deletes it, and watches the articles folder for changes made outside it. The article files stay the only source of truth: no database or index file is written. Recently changed means when an article's `article.md` file last changed.

Preview pages, the frames that show embeds in the body, and the files they load are shown from another address of the editor, `http://localhost:5180` (with the editor's port): a site of their own, where the editor's API answers nothing and refuses changes, so nothing in an article, and no embed's script, can use it. Their Content Security Policy also sandboxes them, so they can't send forms or move the editor page elsewhere, while embedded players (such as Bandcamp's) keep working. They can run their own scripts and styles, and load from their own address and the web addresses the site's embeds list in `sources`.

### Embeds in the editor

The site's [embed plugins](/docs/07-embeds/) (its config file's `plugins`) work in the editor too: each has a toolbar button with its icon, its dialog shows its description, options and `info`, the body shows each embed block in a frame, and the preview pages render them as the website will. An embed's `editor` settings can give it an icon and a different look in the body.

The editor reads the config file again each time, so you can add or change an embed and see the result without restarting it.

### Starting it from code

<!-- embed:codehighlight -->

```ts
import { startEditor } from "@lvl99dotcom/edaha-editor";

const editor = await startEditor({
  siteDir: "my-site",
  port: 5180,
  // Embed plugins added after the config file's (default: none)
  plugins: [],
});
console.log(`Open ${editor.url}`);
```

<!-- /embed:codehighlight -->

To show the editor in your own app's page instead, as the `<edaha-editor>` web component, see [Showing the editor in your own app](/docs/10-api/#showing-the-editor-in-your-own-app).

An app that shows the editor in its own window can hide the "edaha.md" title (**Home** still goes back to the welcome prompt) and the light/dark theme switcher (the device's light or dark setting is used instead):

<!-- embed:codehighlight -->

```ts
const editor = await startEditor({
  siteDir: "my-site",
  hideTitle: true,
  hideThemeSwitcher: true,
});
```

<!-- /embed:codehighlight -->
