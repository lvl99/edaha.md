<!--yaml
status: published
date: 2026-11-15T18:36:00.000Z
author: false
-->

# Lists

A list is a collection of articles, newest first. edaha.md builds lists of each article type, and of its articles by tag and by author, each with its own RSS feed.

<!-- readmore -->

## Kinds of lists

| List         | URL                       | Holds                                |
| ------------ | ------------------------- | ------------------------------------ |
| Article type | `/news/`                  | Every published article of the type. |
| Tag          | `/news/tags/<tag>/`       | The type's articles with that tag.   |
| Author       | `/news/authors/<author>/` | The type's articles by that author.  |

Tag and author names become kebab-case in URLs, e.g. "Release notes" is `/news/tags/release-notes/`.

Only `published` articles are listed: `unlisted` articles only have their own page, and drafts aren't built. See [Articles](/docs/04-articles/#statuses).

## Pages

Lists show 20 articles per page. The first page is at the list's URL, and the others follow it with their number:

```
/news/          # Articles 1 to 20
/news/2         # Articles 21 to 40
/news/3         # ...
```

Templates get the page's articles in `list.articles` and links to the other pages in `list.pagination`. See [Templating](/docs/05-templating/#template-data).

## RSS feeds

Each list has an RSS feed next to its first page, e.g. `/news/feed.xml` or `/news/tags/release-notes/feed.xml`. Each item has the article's title, link, date, tags, excerpt and, when the author has an email address, its author.

Feeds need the website's absolute URL for their links: set `siteUrl` in the [config file](/docs/03-configuration/#siteurl), the `SITE_URL` environment variable or the `--site-url` option.

The feeds are rendered with `layouts/rssfeed.xml.njk`, which you can [override](/docs/05-templating/) like any other template (with `layouts/rssfeed.njk` or `layouts/rssfeed.xml.njk`). Feeds of other types sit beside it, e.g. `layouts/rssfeed.json.njk` for a `feed.json` (see [output file types](/docs/05-templating/#output-file-types)).

## Choosing what is built

Each article type's `generate` settings choose its lists and feeds. For example, documentation without author lists, and plain pages without any lists:

```yaml
types:
  docs:
    labelSingle: Documentation
    labelPlural: Documentation
    generate:
      author: false
  page:
    path: ""
    generate:
      list: false
      feed: false
      author: false
      tag: false
```

| Setting  | When `false`                                                                     |
| -------- | -------------------------------------------------------------------------------- |
| `list`   | No list pages for the type. Its feed can still be built.                         |
| `feed`   | No feed for the type, and its articles are left out of the tag and author feeds. |
| `author` | No author lists for the type.                                                    |
| `tag`    | No tag lists for the type.                                                       |

See [Configuration](/docs/03-configuration/#types) for every type setting.

## Index articles

An article named `index` is built at its type's URL in place of the type's list pages, e.g. `articles/news/index/article.md` becomes `/news/`. The type's feed, tag lists and author lists are still built.

Its template gets the list's first page as well as the article, so an index article can introduce a type and show its newest articles:

```njk
{% block main %}
<h1>{{ article.title }}</h1>
{{ article.bodyHtml | safe }}

<h2>Latest</h2>
<ul>
  {% for item in list.articles %}
  <li><a href="{{ item.url }}">{{ item.title }}</a></li>
  {% endfor %}
</ul>
{% endblock %}
```

When the `page` type's path is `""`, `page/index` is the website's home page.

## Customising lists

Each type's list pages use its `list` template: `templates/<type>/list.njk`, or else `templates/article/list.njk`. Use `list.kind` to tell type, tag and author lists apart:

```njk
<h1>{{ list.name }}</h1>
{% if list.kind == "tag" %}
<p>{{ site.types[list.type].labelPlural }} tagged "{{ list.name }}".</p>
{% elif list.kind == "author" %}
<p>{{ site.types[list.type].labelPlural }} by {{ list.name }}.</p>
{% endif %}
```

See [Templating](/docs/05-templating/) for more.
