<!--yaml
status: published
date: 2026-11-15T20:36:00.000+02:00
-->

# Articles

An article is a Markdown file with a short header of settings, in its own folder with its images and attachments. <!-- readmore -->

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

### The header

The header is an HTML comment at the very top of the file. Its first word says what format the settings are written in:

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

| Setting       | Description                                                                                                               | Default                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `date`        | **Required.** The publication date, as an ISO 8601 timestamp, e.g. `2026-11-16T09:00:00Z` or `2026-11-16T10:00:00+01:00`. |                             |
| `status`      | `published` (in lists and feeds), `unlisted` (its own page only) or `draft` (not built).                                  | `published`                 |
| `title`       | The title, if the article doesn't start with a `# Title` heading.                                                         | The first `# Title` heading |
| `author`      | The author's name, or `{ name, email, url }`.                                                                             | The website's name          |
| `tags`        | A list of tag names, e.g. `[News, Release notes]`.                                                                        | None                        |
| `excerpt`     | The excerpt shown in lists and feeds, in Markdown.                                                                        | See [Excerpts](#excerpts)   |
| `thumbnail`   | An image for lists: a file in the article's folder, or an absolute URL.                                                   | None                        |
| `attachments` | A list of files to download: `{ url, name, thumbnail, mimeType }`, where only `url` is required.                          | None                        |
| `template`    | The template to render the article with, e.g. `home`. See [Templating](/docs/05-templating/).                             | `single`                    |
| `type`        | The article's type. It must match its type folder.                                                                        | The type folder             |

Settings that edaha.md doesn't know are ignored: they aren't passed to templates yet, and the editor leaves them out when it saves an article.

An author with more details:

```yaml
author:
  name: Jo Bloggs
  email: jo@example.com # shown in RSS feeds
  url: https://jo.example.com # linked from the article page
```

Attachments get their file size and type when they are files in the article's folder:

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
- **Images and links** to files in the article's folder are written relative to it, e.g. `![A photo](photo.jpg)`.
- **Headings** get IDs from their text, so they can be linked to: `## Getting started` can be linked as `#getting-started`.
- **Embeds** turn a URL into a video or player. See [Embeds](/docs/07-embeds/).
- **Raw content** is shown exactly as it is written. See [Raw content](#raw-content).
- **Extra HTML:** `<small>`, `<big>` and `<details><summary>…</summary>…</details>` can be used. Leave a blank line after `</summary>` and before `</details>`, so the content between them is read as Markdown.

## Raw content

Put content between `<!-- raw -->` and `<!-- /raw -->` to show it exactly as it is written. Nothing inside is read as Markdown, embeds, read more breaks or HTML, and quotes and dashes aren't made typographic:

<!-- prettier-ignore -->
```md
<!-- raw -->
*Not italic*, # not a heading, <b>not bold</b>
<!-- readmore --> isn't a read more break here
<!-- /raw -->
```

Shows on the page as:

<!-- prettier-ignore-start -->
<!-- raw -->
*Not italic*, # not a heading, <b>not bold</b>
<!-- readmore --> isn't a read more break here
<!-- /raw -->
<!-- prettier-ignore-end -->

- **On its own lines**, raw content is a block, `<pre class="raw">`, keeping its spaces and line breaks.
- **Within a line**, e.g. `Type <!-- raw -->*<!-- /raw --> for a star`, it is inline, `<span class="raw">`.
- The default theme shows raw content in the page's own font. Style `.raw` in your site's `static/site.css` to change it.
- Raw markers inside code blocks and inline code are left alone, as on this page.

In the [WYSIWYG editor](/docs/09-wysiwyg-editor/), the **Raw** button turns a block into raw content.

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
