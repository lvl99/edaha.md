<!--yaml
status: published
date: 2026-11-15T18:36:00.000Z
author: false
-->

# Articles

An article is a Markdown file with a short header of settings, in its own folder with its images and attachments.

<!-- readmore -->

Markdown is a simple text format: headings, lists, links and images are written with a few characters, so articles are easy to read and edit in any text editor. If you would rather not edit Markdown, the built-in [WYSIWYG editor](/docs/09-wysiwyg-editor/) gives you a rich text interface for the same files.

## Where articles go

Each article is a folder `<articlesDir>/<type>/<slug>/` with an `article.md` file:

```
articles/
  news/                 # The article type
    hello-world/        # The article's slug, used in its URL: /news/hello-world/
      article.md        # The article's settings and text
      photo.jpg         # Files the article uses
      guide.pdf
```

- **Folder names** are lowercase kebab-case, e.g. `hello-world`.
- **Slugs** can't be `tags`, `authors` or a number, as list pages use those URLs.
- **An article named `index`** is built at its type's own URL in place of its list, e.g. `page/index` becomes the website's home page when the `page` type's path is `""`. See [Lists](/docs/06-lists/).

## Structure of an article

An `article.md` has two parts: a header of settings, and the article's Markdown.

```md
<!--yaml
date: 2026-11-16T09:00:00Z
author: Jo Bloggs
tags: [News, Release notes]
thumbnail: photo.jpg
-->

# Hello world

The first paragraph. <!-- readmore -->

The rest of the article, with an image: ![A photo](photo.jpg)
```

### Article metadata

Article metadata is contained within an HTML comment at the very top of the file. Its first word says what format the settings are written in:

- `<!--yaml` or `<!--yml`: YAML (the default, used by the editor for new articles);
- `<!--json`: JSON.

```md
<!--json
{
  "date": "2026-11-16T09:00:00Z",
  "tags": ["News"]
}
-->
```

The header is never written into the built pages.

### Settings

| Setting       | Description                                                                                                               | Default                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `date`        | **Required.** The publication date, as an ISO 8601 timestamp, e.g. `2026-11-16T09:00:00Z` or `2026-11-16T10:00:00+01:00`. |                                                                                              |
| `status`      | `published` (in lists and feeds), `unlisted` (its own page only) or `draft` (not built).                                  | `published`                                                                                  |
| `title`       | The title, if the article doesn't start with a `# Title` heading.                                                         | The first `# Title` heading                                                                  |
| `author`      | The author's name, `{ name, email, url }`, or `false` for no author.                                                      | The type's or the config's [`author`](/docs/03-configuration/#author), or the website's name |
| `tags`        | A list of tag names, e.g. `[News, Release notes]`.                                                                        | None                                                                                         |
| `excerpt`     | The excerpt shown in lists and feeds, in Markdown.                                                                        | See [Excerpts](#excerpts)                                                                    |
| `thumbnail`   | An image for lists: a file in the article's folder, a [shared file](#shared-files) by its path, or an absolute URL.       | None                                                                                         |
| `attachments` | A list of files to download: `{ url, name, thumbnail, mimeType }`, where only `url` is required.                          | None                                                                                         |
| `template`    | The template to render the article with, e.g. `home`. See [Templating](/docs/05-templating/).                             | `single`                                                                                     |
| `type`        | The article's type. It must match its type folder.                                                                        | The type folder                                                                              |

Articles can also have the custom settings defined in the config file's [`metadata`](/docs/03-configuration/#metadata), for the types that use them. Their values are checked: an invalid value is a warning when building (and is left out of templates), and the editor won't save it. Settings nobody defined, and custom settings the article's type doesn't use, are kept as they are with a warning.

An author with more details:

```yaml
author:
  name: Jo Bloggs
  email: jo@example.com # shown in RSS feeds
  url: https://jo.example.com # linked from the article page
```

Attachments get their file size and type when they are files in the article's folder or [shared files](#shared-files):

```yaml
attachments:
  - url: guide.pdf
    name: Getting started guide
    thumbnail: guide-cover.png
  - url: https://example.com/files/data.zip
    mimeType: application/zip
```

### The content

After the header comes the article in Markdown:

- **The title** is the first `# Title` heading, unless the header sets `title`. It is taken out of the body, as templates show it on its own.
- **Images and links** to files in the article's folder are written relative to it, e.g. `![A photo](photo.jpg)`. Links to other pages of the website can start at its root, e.g. `[Configuration](/docs/03-configuration/)`; for a website in a sub-folder (see [`siteUrl`](/docs/03-configuration/#siteurl)), they are put under it when built. Links in raw HTML are left as they are.
- **Shared files** are written by their path, e.g. `![A photo](/files/2026/11/photo.jpg)`. See [Shared files](#shared-files).
- **Headings** get IDs from their text, so they can be linked to: `## Getting started` can be linked as `#getting-started`.
- **Embeds** turn a URL into a video or player. See [Embeds](/docs/07-embeds/).
- **Raw content** is shown exactly as it is written. See [Raw content](#raw-content).
- **Extra HTML:** `<small>`, `<big>`, `<u>` (underlined) and `<details><summary>…</summary>…</details>` can be used. Leave a blank line after `</summary>` and before `</details>`, so the content between them is read as Markdown.

## Shared files

Besides its own folder, an article can use files in the website's shared files folder (`files/` by default; see [`files`](/docs/03-configuration/#files)), which any article can use. They are referred to by their path on the website, which starts with the folder's path (`/files/` by default), in settings and in the body:

```md
<!--yaml
date: 2026-11-24T09:00:00Z
thumbnail: /files/2026/11/photo.jpg
-->

# Hello world

![A photo](/files/2026/11/photo.jpg) [Our logo](/files/logo.png)
```

A setting such as `thumbnail` that refers to a shared file that doesn't exist stops the build. If the shared files are hosted at another address (`files.url`), built pages refer to them there, e.g. `https://static.example.com/2026/11/photo.jpg`.

## Raw content

Put content between `<!-- raw -->` and `<!-- /raw -->` to show it exactly as it is written. Nothing inside is read as Markdown, embeds, read more breaks or HTML, and quotes and dashes aren't made typographic:

```md
<!-- raw -->

_Not italic_, # not a heading, <b>not bold</b>
<!-- readmore --> isn't a read more break here
<!-- /raw -->
```

Shows on the page as:

<!-- raw -->

_Not italic_, # not a heading, <b>not bold</b>
<!-- readmore --> isn't a read more break here
<!-- /raw -->

- **On its own lines**, raw content is a block, `<pre class="raw">`, keeping its spaces and line breaks.
- **Within a line**, e.g. `Type <!-- raw -->*<!-- /raw --> for a star`, it is inline, `<span class="raw">`.
- The default theme shows raw content in the page's own font. Style `.raw` in your site's `static/site.css` to change it.
- Raw markers inside code blocks and inline code are left alone, as on this page.

In the [WYSIWYG editor](/docs/09-wysiwyg-editor/), the **Raw** button turns a block into raw content.

### Raw content and code formatters

If your project formats Markdown with a tool like [Prettier](https://prettier.io/), it may change the content of raw blocks, e.g. turn `*text*` into `_text_` or add blank lines, which changes what the page shows. It also formats Markdown inside ` ```md ` code blocks.

Tell it to leave them alone. For Prettier, wrap raw blocks in `prettier-ignore-start` and `prettier-ignore-end` comments, or put `<!-- prettier-ignore -->` just before a code block:

```md
<!-- prettier-ignore-start -->

<pre class="raw">&#42;Shown with its stars&#42;</pre>

<!-- prettier-ignore-end -->
```

These comments are kept in the built page's HTML, where visitors don't see them. You can also leave your articles folder out of formatting altogether, e.g. by adding it to `.prettierignore`.

## Excerpts

Lists and RSS feeds show a short excerpt of each article. It is, in order of preference:

1. the `excerpt` setting;
2. everything before a `<!-- readmore -->` comment;
3. the first 200 characters of the article's text.

Put `<!-- readmore -->` where the excerpt should end:

```md
# Hello world

This paragraph is the excerpt shown in lists. <!-- readmore -->

This part is only shown on the article's own page.
```

The comment itself is removed from the page. A `<!-- readmore -->` inside a code block or inline code is left alone, so you can write about it, as on this page.

Templates can show the excerpt as HTML (`article.excerptHtml`) or plain text (`article.excerptText`). See [Templating](/docs/05-templating/).

## Statuses

| Status      | Its page | In lists and feeds |
| ----------- | -------- | ------------------ |
| `published` | Yes      | Yes                |
| `unlisted`  | Yes      | No                 |
| `draft`     | No       | No                 |

Drafts are still listed in the editor, so you can keep working on them.
