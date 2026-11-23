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
- each RSS feed with `layouts/rssfeed.njk`.

Templates are looked for in your site's templates folder first (`templates/`, or the [`templatesDir`](/docs/03-configuration/#templatesdir) setting), then in the default theme's. So to change one, copy it from the theme into your `templates/` folder at the same path and edit it. The theme is the `@lvl99dotcom/edaha-theme-default` package, installed with edaha.md; its files are in its `templates/` folder (e.g. `node_modules/@lvl99dotcom/edaha-theme-default/templates/`):

```
templates/
  layouts/
    html.njk          # The HTML page every other template extends
    rssfeed.njk       # RSS feeds
  article/
    single.njk        # An article's page
    list.njk          # A list's pages
  page/
    single.njk        # Pages: a "last updated" date, without author or tags
    home.njk          # The home page
```

Your site's static files folder (`static/`, or [`staticDir`](/docs/03-configuration/#staticdir)) works the same way: its files are copied to the website's root over the theme's, so a `static/site.css` replaces the theme's stylesheet.

## Using another theme

The [`theme`](/docs/03-configuration/#theme) setting uses another theme instead of the default one: a folder, or an installed theme package. Your own templates and static files still override its files one by one, and `@theme/` (see below) loads its files.

```yaml
theme: ../themes/my-theme
```

A theme is a folder with:

- `templates/`: its templates. It needs `layouts/html.njk`, `layouts/rssfeed.njk`, `article/single.njk` and `article/list.njk`, unless your site has them.
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

A theme that is a package (it has a `package.json`) can have an `edahatheme.yml` too, e.g. for a shorter name than its package's: the settings it leaves out come from its `package.json` (`name`, `description`, `version`, and `author` and `contributors`). Without one, they all come from its `package.json`. The default theme's `edahatheme.yml` names it "Default". Installed packages shouldn't be edited: to change one, copy its folder and delete the copy's `package.json` (keeping or adding an `edahatheme.yml`).

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

Relative paths such as `../theme/article/single.njk` don't work: they're looked for inside your templates folder, and the theme's folder can be anywhere (e.g. in `node_modules`).

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
- `type`: the page's article type, e.g. `news`: the article's, or the list's.
- `isArticle`: `true` on an article's page (index articles and the editor's previews included).
- `isList`: `true` on a list's pages and its RSS feed.

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

List pages (and [index articles](/docs/06-lists/#index-articles)) get `list`:

| Variable                                   | Description                                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `list.name`                                | The type's plural label, the tag's name or the author's name.                          |
| `list.kind`                                | `type`, `tag` or `author`.                                                             |
| `list.type`                                | The article type the list belongs to.                                                  |
| `list.url`, `list.feedUrl`, `list.hasFeed` | The list's first page, its RSS feed, and whether it has one.                           |
| `list.articles`                            | The articles on this page, newest first.                                               |
| `list.pagination`                          | `pages` (each with `index`, `url` and `isCurrent`), `page`, `prevPage` and `nextPage`. |

HTML values such as `bodyHtml` must be output with the `safe` filter, as Nunjucks escapes everything else:

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
| `json`                   | `{{ article.tags \| json \| safe }}`                  | `[{"name":"News","url":"/tags/news/"}]`                                                                            |
| `json(true)`             | `{{ article.tags \| json(true) \| safe }}`            | The same JSON, indented by 2 spaces                                                                                |
| `parseJson`              | `{% set data = '{"a":1}' \| parseJson %}{{ data.a }}` | `1` (nothing if the text isn't valid JSON)                                                                         |
| `contains(value)`        | `{% if article.slug \| contains("plugin-") %}`        | `true` if a string has the text, or an array has the value                                                         |
| `where(property)`        | `{{ article.tags \| where("name") \| join(", ") }}`   | `News, Releases` (a property's values, skipping items without it; nested properties like `"author.name"` work too) |

## Embed tags

Some [embeds](/docs/07-embeds/) need a stylesheet or a script on the pages that use them, e.g. to draw diagrams. Two tags output them, once per page:

- `{% embedHead %}`: before `</head>`.
- `{% embedFoot %}`: before `</body>`.

They output nothing on pages without such embeds, and on feeds. The default theme's `layouts/html.njk` has both, so you only need them in a layout of your own that doesn't extend it. `{% embedRenderHead() %}` and `{% embedRenderFoot() %}` work too.

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
