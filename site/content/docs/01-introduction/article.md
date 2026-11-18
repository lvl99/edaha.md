<!--yaml
status: published
date: 2026-11-15T20:36:00.000+02:00
-->

# Introduction

**edaha.md** is a static site generator written in TypeScript. It converts Markdown files into HTML pages and RSS feeds. <!-- readmore -->

You control the templates, so the pages can look however you like.

It was designed to be simple and easy to use, and to give you a quick way to put existing Markdown content on a website.

It was also designed to be fast and secure. There is no backend to expose: generate the files, upload them to your hosting provider, and that is that.

## How it works

You write each article as a Markdown file, in a folder named after its slug, inside a folder named after its article type:

```
<project>/
  edahaconfig.yml       # Configures your site
  articles/             # Your site's content
    news/               # An article type
      my-article/       # An article: the folder name is its slug, used in its URL
        article.md      # The article's settings and text
        photo.jpg       # The article's images and attachments
  templates/            # Optional; your own templates, over the default theme's
  static/               # Optional; your own stylesheets, fonts and other files, over the default theme's
  build/                # Where the generated website is written
```

Running `edaha build` turns this into a website:

- a page for each article, e.g. `/news/my-article/`;
- a paginated list of each type's articles, e.g. `/news/`;
- lists of articles by tag and by author, e.g. `/news/tags/updates/`;
- an RSS feed for each list.

You can choose what is generated for each article type, so the same tool builds a blog, documentation or the plain pages of a website.

## What's included

- **Markdown articles** with a HTML comment metadata header: date, author, tags, thumbnail, attachments and more. See [Articles](/docs/04-articles/).
- **Article types** with their own URL paths, labels and generated pages. See [Configuration](/docs/03-configuration/).
- **Lists and RSS feeds** by type, tag and author. See [Lists](/docs/06-lists/).
- **Nunjucks templates**: a neutral, accessible default theme that you can override one file at a time. See [Templating](/docs/05-templating/).
- **Embeds** for YouTube and Bandcamp, and your own. See [Embeds](/docs/07-embeds/).
- **A WYSIWYG editor** that runs on your computer, for people who would rather not edit Markdown files. See [WYSIWYG editor](/docs/09-wysiwyg-editor/).

Ready to try it? Head to the [Quick start](/docs/02-quick-start/).
