<!--yaml
status: published
date: 2026-11-15T20:36:00.000+02:00
-->

# Configuration

A config file tells edaha.md about your website, where its files are, and what to build for each type of article. <!-- readmore -->

You can use it to structure, build and edit your site in a way that fits you and your project. Only the website's `name` and `description` are required; everything else has a default.

A typical project looks like this:

```
<project>/
  package.json
  edahaconfig.yml       # The config file
  articles/             # Articles, in a folder per article type
    news/
      example-article/  # An article: the folder name is its slug
        article.md
  templates/            # Optional; your own templates
  static/               # Optional; your own static files (stylesheets, fonts, images)
  dist/                 # The generated website
```

## The config file

### File names and formats

The config file can be written in YAML, JSON or JavaScript. edaha.md looks for these names, in this order:

1. `.edahaconfigrc`
2. `.edahaconfig`
3. `edahaconfigrc`
4. `edahaconfig`
5. `edaha.config`

Each name can end in `.yml`, `.yaml`, `.json`, `.js`, `.cjs` or `.mjs` (tried in that order). If a folder has more than one config file, the first one is used and you get a warning.

The same settings in each format:

```yaml
# edahaconfig.yml
name: My Site
description: News and notes.
```

```json
{
  "name": "My Site",
  "description": "News and notes."
}
```

```js
// edaha.config.mjs (or .js in a package with "type": "module")
export default {
  name: "My Site",
  description: "News and notes.",
};
```

```js
// edaha.config.cjs (or .js in a CommonJS package)
module.exports = {
  name: "My Site",
  description: "News and notes.",
};
```

A JavaScript config file exports a plain object. It is the only format that can hold [custom embeds](#embeds).

### Where it is found

`edaha build` and `edaha editor` look for the config file:

1. in the folder given with `--dir` (default: the folder you run the command in);
2. then in the folder of the nearest `package.json`, looking up from there.

You can also name the file yourself with `-c` or `--config`:

```sh
edaha build --config config/edaha.config.json
```

If no config file is found, the command stops with an error that lists the names it looked for.

The folder that holds the config file is the **site folder**. Every folder in the config file (`articlesDir`, `outputDir`, `publishDir`) is relative to it, and so are `templates/` and `static/`.

## Settings

| Setting                           | Required | Description                                                                         |
| --------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| [`name`](#name)                   | Yes      | The website's name.                                                                 |
| [`description`](#description)     | Yes      | The website's description.                                                          |
| [`path`](#path)                   | No       | A URL path that every article type's URLs start with.                               |
| [`articlesDir`](#articlesdir)     | No       | The folder that holds the articles.                                                 |
| [`outputDir`](#outputdir)         | No       | The folder the website is built into.                                               |
| [`publishDir`](#publishdir)       | No       | A folder outside the site folder that the built website is copied into.             |
| [`siteUrl`](#siteurl)             | No       | The website's absolute URL, for links in RSS feeds.                                 |
| [`reservedPaths`](#reservedpaths) | No       | Paths at the website's root that articles and article types can't use.              |
| [`types`](#types)                 | No       | Settings for each article type: URL path, labels and what is built.                 |
| [`embeds`](#embeds)               | No       | Custom embed renderers, tried before the built-in ones (JavaScript config only).    |

Unknown settings stop the build, so a typo doesn't go unnoticed.

### `name`

The website's name, shown in page titles, the header and footer, and RSS feeds. It is also the author of articles that don't name one.

```yaml
name: My Site
```

### `description`

The website's description, used in the pages' `<meta name="description">` when a page has nothing more specific, and in RSS feeds.

```yaml
description: News and notes.
```

### `path`

A URL path that every article type's URLs start with. Use it when the website lives in a sub-folder of another website.

- **Accepted values:** lowercase kebab-case, e.g. `blog`, or `""` for the website's root.
- **Default:** `""`

```yaml
path: blog # news articles are at /blog/news/<slug>/
```

### `articlesDir`

The folder that holds the articles, relative to the site folder. Each folder inside it is an [article type](#types).

- **Accepted values:** a folder inside the site folder. It can't be the site folder itself, or inside `templates/` or `static/`.
- **Default:** `articles`

```yaml
articlesDir: content
```

### `outputDir`

The folder the website is built into, relative to the site folder. It is **emptied on every build**, so keep nothing else in it.

- **Accepted values:** a folder inside the site folder, apart from the articles folder, `templates/` and `static/`.
- **Default:** `dist`

```yaml
outputDir: build
```

### `publishDir`

A folder that the built website is copied into after every build, e.g. the build folder of another app that serves the website.

- **Accepted values:** any folder outside the site folder, relative to it.
- **Default:** none

Before copying, the files that the previous build published there are removed. The build stops if one of its files is already there, so it never overwrites another app's files.

```yaml
publishDir: ../app/dist
```

### `siteUrl`

The website's absolute URL. RSS feeds need it, because their links must be absolute. The `SITE_URL` environment variable and the `--site-url` option of `edaha build` take its place when they are set.

- **Accepted values:** an `http://` or `https://` URL.
- **Default:** `http://localhost`, with a warning.

```yaml
siteUrl: https://example.com
```

### `reservedPaths`

Paths at the website's root that articles and article types can't use, e.g. the routes of another app that shares the website. They only matter when `path` is `""`.

- **Accepted values:** a list of lowercase paths (letters, numbers, `.`, `_` and `-`).
- **Default:** none

```yaml
reservedPaths: [app, api, jwks.json]
```

### `types`

Settings for each article type, by its folder name. Each type can set:

| Setting       | Description                                                               | Default                       |
| ------------- | ------------------------------------------------------------------------- | ----------------------------- |
| `path`        | The type's URL path: lowercase kebab-case, or `""` for the website root. | The type's name               |
| `labelSingle` | The label for one article, e.g. "Article".                                | The name, capitalised         |
| `labelPlural` | The label for several articles, e.g. "Articles".                          | `labelSingle` followed by "s" |
| `generate`    | What is built for the type (see below), or `false` to build nothing.      | Everything                    |

`generate` has these settings, all `true` by default:

| Setting   | Builds                                                                    |
| --------- | ------------------------------------------------------------------------- |
| `article` | The type's article pages. Without them, nothing else is built either.    |
| `list`    | The type's [list pages](/docs/06-lists/).                                 |
| `feed`    | The type's RSS feed, and its articles in the tag and author feeds.        |
| `author`  | The type's author lists.                                                  |
| `tag`     | The type's tag lists.                                                     |

```yaml
types:
  news:
    labelSingle: News
    labelPlural: News
  page:
    labelSingle: Page
    labelPlural: Pages
    # The website's own pages, at its root: page/index is "/", page/about is "/about/"
    path: ""
    generate:
      list: false
      feed: false
      author: false
      tag: false
```

- A type folder that isn't in `types` uses the defaults, with a warning.
- Types can't be called `tags` or `authors`, and no two types can have the same path.
- A type with `generate: false` builds nothing, but its articles are still checked for errors.

### `embeds`

Custom embed renderers, tried before the built-in YouTube and Bandcamp ones. As renderers are code, only a JavaScript config file can set them.

- **Accepted values:** a list of objects with `name`, `match(url)`, `render(url, context)` and, optionally, `frameSources`.
- **Default:** none

```js
// edaha.config.mjs
export default {
  name: "My Site",
  description: "News and notes.",
  embeds: [
    {
      name: "Vimeo",
      frameSources: ["https://player.vimeo.com"],
      match: (url) => url.hostname === "vimeo.com",
      render: async (url) =>
        `<iframe src="https://player.vimeo.com/video${url.pathname}" title="Vimeo video"></iframe>`,
    },
  ],
};
```

See [Embeds](/docs/07-embeds/) for how to write one.

## Commands

### `edaha build`

Builds the website into `outputDir`, and copies it into `publishDir` if that is set. See [Build & deploy](/docs/08-build-and-deploy/).

| Option                  | Description                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `-c`, `--config <file>` | The config file. Default: the first one found (see [Where it is found](#where-it-is-found)). |
| `--dir <folder>`        | The folder to look for a config file in. Default: the current folder.               |
| `--site-url <url>`      | The website's absolute URL, for feeds. Default: `SITE_URL`, then `siteUrl`.          |

### `edaha editor`

Runs the [WYSIWYG editor](/docs/09-wysiwyg-editor/) on your computer.

| Option                  | Description                                                     |
| ----------------------- | --------------------------------------------------------------- |
| `-c`, `--config <file>` | The config file, as for `edaha build`.                          |
| `--dir <folder>`        | The folder to look for a config file in, as for `edaha build`.  |
| `--port <number>`       | The port the editor listens on. Default: `5180`.                |

Both commands also take `-h` / `--help` and `-v` / `--version`.
