<!--yaml
status: published
date: 2026-11-15T20:36:00.000+02:00
-->

# Templating

edaha.md renders every page with [Nunjucks](https://mozilla.github.io/nunjucks/) templates. It comes with a neutral default theme, and you can replace any of its templates with your own, one file at a time. <!-- readmore -->

## How it works

When you build, edaha.md loads each article, works out its lists, and renders:

- each article with its type's `single` template (or the one its `template` setting names);
- each page of each list with its type's `list` template;
- each RSS feed with `layouts/rssfeed.njk`.

Templates are looked for in your site's templates folder first (`templates/`, or the [`templatesDir`](/docs/03-configuration/#templatesdir) setting), then in the default theme's. So to change one, copy it from the theme into your `templates/` folder at the same path and edit it. The theme's files are in `node_modules/@lvl99dotcom/edaha.md/theme/templates/`:

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

- `site.url`: the website's absolute URL, e.g. `https://example.com`.
- `blog`: the website's `name`, `description` and `url`, and its `types`, each with its settings (`labelSingle`, `labelPlural`, `path`, `generate`) and `url`.

Article pages also get `article`:

| Variable                                         | Description                                                                                  |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `article.title`                                  | The title.                                                                                   |
| `article.url`                                    | The page's URL, e.g. `/news/hello-world/`.                                                   |
| `article.type`, `article.slug`, `article.status` | The type, slug and status (`published` or `unlisted`).                                       |
| `article.date`                                   | The date, as an ISO 8601 timestamp. Use the `date` filter to show it.                        |
| `article.author`                                 | `name`, `email`, `url`, and `listUrl` (the author's list).                                   |
| `article.tags`                                   | Each tag's `name` and `url` (the tag's list).                                                |
| `article.thumbnail`                              | The thumbnail's URL, if there is one.                                                        |
| `article.bodyHtml`, `article.bodyText`           | The body as HTML, and as plain text.                                                         |
| `article.excerptHtml`, `article.excerptText`     | The excerpt as HTML, and as plain text.                                                      |
| `article.attachments`                            | Each attachment's `name`, `url`, `thumbnail`, `mimeType` and `sizeRelative` (e.g. "2.5 MB"). |

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

```njk
{{ article.bodyHtml | safe }}
```

## Filters

As well as Nunjucks' own filters, templates have:

| Filter                   | Example                                               | Output                        |
| ------------------------ | ----------------------------------------------------- | ----------------------------- |
| `date`                   | `{{ article.date \| date }}`                          | 16 November 2026              |
| `rfc822`                 | `{{ article.date \| rfc822 }}`                        | Mon, 16 Nov 2026 09:00:00 GMT |
| `absoluteUrls(site.url)` | `{{ article.excerptHtml \| absoluteUrls(site.url) }}` | The HTML with absolute links  |

## Examples

### Change the page layout

The theme's templates extend `layouts/html.njk` and fill in its blocks: `head_title`, `head_description`, `bodyClass`, `header`, `breadcrumb`, `breadcrumbItems`, `main`, `aside` and `footer`. Copy it into `templates/layouts/html.njk` to change every page at once, e.g. to add a navigation menu:

```njk
{% block header %}
<header class="site-header">
  <p class="site-title"><a href="{{ blog.url }}">{{ blog.name }}</a></p>
  <nav aria-label="Main">
    <a href="/docs/">Docs</a>
    <a href="/news/">News</a>
  </nav>
</header>
{% endblock %}
```

### Show the reading time on articles

`templates/article/single.njk` can extend the theme's own article page and replace just one block:

```njk
{% extends "layouts/html.njk" %}

{% block head_title %}{{ article.title }} | {{ blog.name }}{% endblock %}

{% block main %}
<article>
  <h1>{{ article.title }}</h1>
  <p>{{ (article.bodyText | wordcount / 200) | round(0, "ceil") }} min read</p>
  {{ article.bodyHtml | safe }}
</article>
{% endblock %}
```

### A different list for a type

`templates/docs/list.njk` shows documentation as a plain list of links, without dates or excerpts:

```njk
{% extends "layouts/html.njk" %}

{% block head_title %}{{ list.name }} | {{ blog.name }}{% endblock %}

{% block main %}
<h1>{{ list.name }}</h1>
<ol>
  {% for article in list.articles %}
  <li><a href="{{ article.url }}">{{ article.title }}</a></li>
  {% endfor %}
</ol>
{% endblock %}
```

### A one-off template

Create `templates/page/landing.njk`, then set `template: landing` in an article's header to use it for that article only.

### Show tags with their lists

```njk
{% if article.tags.length and blog.types[article.type].generate.tag %}
<ul class="tags">
  {% for tag in article.tags %}
  <li><a href="{{ tag.url }}">{{ tag.name }}</a></li>
  {% endfor %}
</ul>
{% endif %}
```
