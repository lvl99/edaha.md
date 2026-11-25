<!--yaml
status: published
date: 2026-11-15T18:36:00.000Z
author: false
-->

# Templating

edaha.md renders every page with [Nunjucks](https://mozilla.github.io/nunjucks/) templates. It comes with a neutral default theme, and you can replace any of its templates with your own, one file at a time.

<!-- readmore -->

## How it works

When you build, edaha.md loads each article, works out its lists, and renders:

- each article with its type's `single` template (or the one its `template` setting names);
- each page of each list with its type's `list` template;
- each RSS feed with `layouts/rssfeed.xml.njk`.

Templates are looked for in your site's templates folder first (`templates/`, or the [`templatesDir`](/docs/03-configuration/#templatesdir) setting), then in the default theme's. So to change one, copy it from the theme into your `templates/` folder at the same path and edit it. The theme is the `@lvl99dotcom/edaha-theme-default` package, installed with edaha.md; its files are in its `templates/` folder (e.g. `node_modules/@lvl99dotcom/edaha-theme-default/templates/`):

```
templates/
  layouts/
    html.njk          # The HTML page every other template extends
    rssfeed.xml.njk   # RSS feeds
  article/
    single.njk        # An article's page
    list.njk          # A list's pages
  page/
    single.njk        # Pages: a "last updated" date, without author or tags
    home.njk          # The home page
```

## Output file types

A template's file name can say what type of file it outputs, with an extension before `.njk`: `single.json.njk` outputs JSON, and `rssfeed.xml.njk` XML. Templates without one output HTML (`single.njk`), apart from the feed's (`rssfeed.njk` outputs XML). The extension can be any letters and numbers.

Every template of a name is rendered, each to its own file. So with `article/single.njk` and `article/single.json.njk`, each article gets its page and a JSON version:

| Template                   | Outputs                                                |
| -------------------------- | ------------------------------------------------------ |
| `article/single.njk`       | `news/hello/index.html` (the article's page)           |
| `article/single.json.njk`  | `news/hello/index.json`                                |
| `article/list.json.njk`    | `news/index.json`, `news/2.json`, … (each list page)   |
| `layouts/rssfeed.json.njk` | `news/feed.json` (each list's feed, beside `feed.xml`) |

An article's `template` setting names the template without extensions (e.g. `home` for `page/home.njk` and `page/home.json.njk`). A list's `feedUrl` links to its XML feed, or its only feed if it has no XML one; `list.feeds` lists them all. An article's other outputs are in `article.alternates`, and a list page's in `list.alternates` (see [Template data](#template-data)). The default theme links to them all from each page's `<head>` with `<link rel="alternate">`.

Your own template overrides the theme's that outputs the same type of file, whatever its name: a site's `layouts/rssfeed.njk` replaces the theme's `layouts/rssfeed.xml.njk`. Two templates in one folder can't output the same type of file (e.g. `single.njk` and `single.html.njk`): the build stops and names them.

Templates that output HTML, HTM, XHTML, XML, SVG, RSS or Atom escape values for HTML unless you mark them `safe`. Templates that output anything else, such as JSON or text, write values as they are, so `{{ article.title | json }}` writes a JSON string. A template that includes or imports another (e.g. a partial) decides for both. For example, `article/single.json.njk`:

<!-- embed:codehighlight -->

```njk
{
  "title": {{ article.title | json }},
  "url": {{ article.url | absoluteUrl(site.url) | json }},
  "date": {{ article.date | json }},
  "body": {{ article.bodyHtml | json }}
}
```

<!-- /embed:codehighlight -->

[Embeds](/docs/07-embeds/) in a JSON file's values are written as JSON text, so the JSON stays valid.

Your site's static files folder (`static/`, or [`staticDir`](/docs/03-configuration/#staticdir)) works the same way: its files are copied to the website's root over the theme's, so a `static/site.css` replaces the theme's stylesheet.

## Using another theme

The [`theme`](/docs/03-configuration/#theme) setting uses another theme instead of the default one: a folder, or an installed theme package. Your own templates and static files still override its files one by one, and `@theme/` (see below) loads its files.

```yaml
theme: ../themes/my-theme
```

A theme is a folder with:

- `templates/`: its templates. It needs `layouts/html.njk`, `layouts/rssfeed.njk`, `article/single.njk` and `article/list.njk` (the last three with any [output extension](#output-file-types), e.g. `layouts/rssfeed.xml.njk`), unless your site has them.
- `static/`: files copied to the website's root.
- `edahatheme.yml` (optional): its name, description, version and authors.

<!-- embed:codehighlight -->

```yaml
# edahatheme.yml
name: My theme
description: A theme for my blog
version: 1.0.0
authors:
  - Jane Doe
  - name: Sam Lee
    email: sam@example.com
    url: https://example.com
```

<!-- /embed:codehighlight -->

| Setting       | Required | Description                                                                                                                              |
| ------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | Yes      | The theme's name.                                                                                                                        |
| `description` | No       | What the theme is for.                                                                                                                   |
| `version`     | No       | Its version, e.g. `1.0.0`.                                                                                                               |
| `authors`     | No       | Its authors: names, or maps with a `name` and optionally an `email` and `url`, like a site's [`author`](/docs/03-configuration/#author). |

A theme that is a package (it has a `package.json`) can have an `edahatheme.yml` too, e.g. for a shorter name than its package's: the settings it leaves out come from its `package.json` (`name`, `description`, `version`, and `author` and `contributors`). Without one, they all come from its `package.json`. The default theme's `edahatheme.yml` names it "edaha.md". Installed packages shouldn't be edited: to change one, copy its folder and delete the copy's `package.json` (keeping or adding an `edahatheme.yml`).

The easiest way to start a theme is to copy the default theme's `templates/` and `static/` folders.

## Building on the theme's templates

A template can extend, include or import any other by its name, e.g. `{% extends "article/single.njk" %}`. Names are looked for in your templates folder first, then in the theme's, so this gets the theme's file as long as you haven't overridden it.

To build on the theme's version of a template you **have** overridden, start its name with `@theme/`. It always loads the theme's file. For example, a `templates/article/single.njk` that adds to the theme's sidebar instead of replacing the whole page:

<!-- embed:codehighlight -->

```njk
{% extends "@theme/article/single.njk" %}

{% block aside %}
<p>Thanks for reading!</p>
{{ super() }}
{% endblock %}
```

<!-- /embed:codehighlight -->

`{{ super() }}` outputs the theme's own content for that block. `@theme/` works the same in `include` and `import`.

A name can leave out the template's output extension: it loads the template that outputs the same type of file, HTML unless it is the feed's (`layouts/rssfeed.njk` outputs XML). So `{% extends "@theme/layouts/rssfeed.njk" %}` loads the theme's `layouts/rssfeed.xml.njk`, and `article/single.njk` loads your `article/single.html.njk` if you have one.

Names starting with `./` or `../` are relative to the template that names them, e.g. `{% include "./note.njk" %}` in `partials/aside.njk` loads `partials/note.njk`. They're then looked for like any other name: in your templates folder first, then the theme's. They can't reach outside the templates folders, so `../theme/article/single.njk` doesn't load the theme's file: use `@theme/` for that.

## Templates for article types

The templates in `templates/article/` are the defaults for every article type. A folder named after a type overrides them for that type:

```
templates/
  article/
    single.njk        # Used by every type...
    list.njk
  news/
    single.njk        # ...except news articles, which use this one
```

If a type has its own folder but not the template that is needed, the one in `templates/article/` is used, with a warning.

An article can pick another template with its `template` setting. The name is looked for in the type's folder, then in `templates/article/`:

```yaml
template: home # templates/page/home.njk for a page, else templates/article/home.njk
```

The editor lists the templates an article can use.

## Template data

Every template gets:

- `site.name` and `site.description`: the website's name and description.
- `site.author`: the author of articles that don't name one (`name`, `email` and `url`): the config file's `author`, the website's name without one, or nothing when it is `false`.
- `site.url`: the website's absolute URL, e.g. `https://example.com`, for links that leave the website (e.g. in feeds).
- `site.baseUrl`: the path of `site.url`, e.g. `/my-site` for `https://example.github.io/my-site`, or nothing for a website at its domain's root. Every URL in the template data already starts with it. Use it for links you write yourself, such as static files: `{{ site.baseUrl }}/base.css`.
- `site.path`: the URL of the website's home page, e.g. `/` (or `/docs/` with the `path` setting `docs`), after `site.baseUrl`.
- `site.types`: each article type's settings (`labelSingle`, `labelPlural`, `path`, `generate`) and `url`.
- `site.files`: where the [shared files folder](/docs/03-configuration/#files)'s files are: `path` is their website path, e.g. `/files/` (after `site.baseUrl`), and `url` is what to put before a shared file's name, e.g. `{{ site.files.url }}logo.png`: the config's `files.url` when they're hosted elsewhere, otherwise `path`.
- `type`: the page's article type, e.g. `news`: the article's, or the list's.
- `isArticle`: `true` on an article's page (index articles and the editor's previews included).
- `isList`: `true` on a list's pages and its RSS feed.

Other outputs of a page (see [output file types](#output-file-types)) are given as lists of `extension`, `type` (its MIME type, e.g. `application/json`) and `url`.

These make it easy to show something on some pages only, e.g. in your `layouts/html.njk`:

<!-- embed:codehighlight -->

```njk
{% if type == "page" and isArticle %}
<p>Last updated {{ article.date | date }}</p>
{% endif %}
```

<!-- /embed:codehighlight -->

Article pages also get `article`:

| Variable                                         | Description                                                                                                                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `article.title`                                  | The title.                                                                                                                                                                              |
| `article.url`                                    | The page's URL, e.g. `/news/hello-world/`.                                                                                                                                              |
| `article.type`, `article.slug`, `article.status` | The type, slug and status (`published` or `unlisted`).                                                                                                                                  |
| `article.date`                                   | The date, as an ISO 8601 timestamp. Use the `date` filter to show it.                                                                                                                   |
| `article.author`                                 | `name`, `email`, `url`, and `listUrl` (the author's list); nothing for articles without an author, so check it first: `{% if article.author %}`.                                        |
| `article.tags`                                   | Each tag's `name` and `url` (the tag's list).                                                                                                                                           |
| `article.thumbnail`                              | The thumbnail's URL, if there is one.                                                                                                                                                   |
| `article.bodyHtml`, `article.bodyText`           | The body as HTML, and as plain text.                                                                                                                                                    |
| `article.excerptHtml`, `article.excerptText`     | The excerpt as HTML, and as plain text.                                                                                                                                                 |
| `article.attachments`                            | Each attachment's `name`, `url`, `thumbnail`, `mimeType` and `sizeRelative` (e.g. "2.5 MB").                                                                                            |
| `article.meta`                                   | The article's [custom settings](/docs/03-configuration/#metadata) by key, e.g. `article.meta.featured`: the valid values of those its type uses, with file fields' names as their URLs. |
| `article.alternates`                             | The page's other outputs than HTML, e.g. `/news/hello-world/index.json` from an `article/single.json.njk`. Empty in the editor's previews.                                              |

List pages (and [index articles](/docs/06-lists/#index-articles)) get `list`:

| Variable                                   | Description                                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `list.name`                                | The type's plural label, the tag's name or the author's name.                             |
| `list.kind`                                | `type`, `tag` or `author`.                                                                |
| `list.type`                                | The article type the list belongs to.                                                     |
| `list.url`, `list.feedUrl`, `list.hasFeed` | The list's first page, its RSS feed, and whether it has one.                              |
| `list.feeds`                               | Each of the list's feeds, e.g. `feed.xml` (`application/rss+xml`) and `feed.json`.        |
| `list.alternates`                          | This page's other outputs than HTML, e.g. `/news/2.json` from an `article/list.json.njk`. |
| `list.articles`                            | The articles on this page, newest first.                                                  |
| `list.pagination`                          | `pages` (each with `index`, `url` and `isCurrent`), `page`, `prevPage` and `nextPage`.    |

In templates that output HTML or XML, HTML values such as `bodyHtml` must be output with the `safe` filter, as everything else is escaped:

<!-- embed:codehighlight -->

```njk
{{ article.bodyHtml | safe }}
```

<!-- /embed:codehighlight -->

## Filters

As well as Nunjucks' own filters, templates have:

| Filter                   | Example                                               | Output                                                                                                             |
| ------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `date`                   | `{{ article.date \| date }}`                          | 16 November 2026                                                                                                   |
| `rfc822`                 | `{{ article.date \| rfc822 }}`                        | Mon, 16 Nov 2026 09:00:00 GMT                                                                                      |
| `absoluteUrl(site.url)`  | `{{ article.url \| absoluteUrl(site.url) }}`          | `https://example.com/news/hello/`                                                                                  |
| `absoluteUrls(site.url)` | `{{ article.excerptHtml \| absoluteUrls(site.url) }}` | The HTML with absolute links                                                                                       |
| `json`                   | `{{ article.tags \| json }}`                          | `[{"name":"News","url":"/tags/news/"}]`                                                                            |
| `json(true)`             | `{{ article.tags \| json(true) }}`                    | The same JSON, indented by 2 spaces                                                                                |
| `parseJson`              | `{% set data = '{"a":1}' \| parseJson %}{{ data.a }}` | `1` (nothing if the text isn't valid JSON)                                                                         |
| `contains(value)`        | `{% if article.slug \| contains("plugin-") %}`        | `true` if a string has the text, or an array has the value                                                         |
| `where(property)`        | `{{ article.tags \| where("name") \| join(", ") }}`   | `News, Releases` (a property's values, skipping items without it; nested properties like `"author.name"` work too) |

In templates that output HTML or XML, add `| safe` after `json` to write it as it is, e.g. in a `<script type="application/ld+json">`.

## Embed tags

Some [embeds](/docs/07-embeds/) need a stylesheet or a script on the pages that use them, e.g. to draw diagrams. Two tags output them, once per page:

- `{% embedHead %}`: before `</head>`.
- `{% embedFoot %}`: before `</body>`.

They output nothing on pages without such embeds, and in files that aren't HTML, such as feeds and JSON. The default theme's `layouts/html.njk` has both, so you only need them in a layout of your own that doesn't extend it. `{% embedRenderHead() %}` and `{% embedRenderFoot() %}` work too.

## Checking templates

`edaha check` reads every template in your templates folder and the theme's without building, and lists each problem by file, line and column:

```sh
npx edaha check
```

```
templates/article/single.njk:12:23 Unknown filter "dat"
templates/layouts/html.njk:4:3 unknown block tag: endfo
templates/news/list.njk:1:4 Template "layouts/page.njk" not found
Found 3 problems in the templates
```

It finds syntax mistakes and unknown tags, unknown filters, templates named in `extends`, `include` and `import` that don't exist, missing required templates, and two templates in one folder that output the same type of file. It exits with code 1 when there are problems, so it can run before a build, e.g. in CI. It takes the same `--config` and `--dir` options as `edaha build`.

Some mistakes only show when a page is rendered, such as calling something that isn't a function, or a template named in a variable that doesn't exist. Add `--render` to also render every page as the build would, without writing anything. Each problem is listed once, in the template it is in (e.g. an included partial), with the first page it was found on:

```sh
npx edaha check --render
```

```
templates/partials/byline.njk:3:15 Unable to call `formatName`, which is undefined or falsey (on /news/hello/ and 11 other pages)
Found 1 problem in the templates
```

Pages are only rendered once the templates have no problems of the first kind. A misspelt variable (e.g. `{{ artcle.title }}`) isn't a problem to Nunjucks, which writes nothing for it, so it isn't found. `--render` takes `--site-url` too, like `edaha build`.

## Examples

### Change the page layout

The theme's templates extend `layouts/html.njk` and fill in its blocks: `headTitle`, `headDescription`, `headImports` (stylesheets), `bodyClass`, `header`, `headerNav`, `breadcrumb`, `breadcrumbItems`, `main`, `aside`, `footer`, `footerNav`, `colophon` and `bodyImports` (scripts). Copy it into `templates/layouts/html.njk` to change every page at once, e.g. to add a navigation menu:

<!-- embed:codehighlight -->

```njk
{% block header %}
<header class="site-header">
  <p class="site-title"><a href="{{ site.path }}">{{ site.name }}</a></p>
  <nav aria-label="Main">
    <a href="{{ site.baseUrl }}/docs/">Docs</a>
    <a href="{{ site.baseUrl }}/news/">News</a>
  </nav>
</header>
{% endblock %}
```

<!-- /embed:codehighlight -->

### Show the reading time on articles

`templates/article/single.njk` can extend the theme's own article page and replace just one block:

<!-- embed:codehighlight -->

```njk
{% extends "layouts/html.njk" %}

{% block headTitle %}{{ article.title }} | {{ site.name }}{% endblock %}

{% block main %}
<article>
  <h1>{{ article.title }}</h1>
  <p>{{ (article.bodyText | wordcount / 200) | round(0, "ceil") }} min read</p>
  {{ article.bodyHtml | safe }}
</article>
{% endblock %}
```

<!-- /embed:codehighlight -->

### A different list for a type

`templates/docs/list.njk` shows documentation as a plain list of links, without dates or excerpts:

<!-- embed:codehighlight -->

```njk
{% extends "layouts/html.njk" %}

{% block headTitle %}{{ list.name }} | {{ site.name }}{% endblock %}

{% block main %}
<h1>{{ list.name }}</h1>
<ol>
  {% for article in list.articles %}
  <li><a href="{{ article.url }}">{{ article.title }}</a></li>
  {% endfor %}
</ol>
{% endblock %}
```

<!-- /embed:codehighlight -->

### A one-off template

Create `templates/page/landing.njk`, then set `template: landing` in an article's header to use it for that article only.

### Show tags with their lists

<!-- embed:codehighlight -->

```njk
{% if article.tags.length and site.types[article.type].generate.tag %}
<ul class="tags">
  {% for tag in article.tags %}
  <li><a href="{{ tag.url }}">{{ tag.name }}</a></li>
  {% endfor %}
</ul>
{% endif %}
```

<!-- /embed:codehighlight -->
