<!--yaml
status: published
date: 2026-11-15T18:36:00.000Z
author: false
-->

# Configuration

A config file tells edaha.md about your website, where its files are, and what to build for each type of article.

<!-- readmore -->

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
  templates/            # Optional; your own templates (templatesDir)
  static/               # Optional; your own static files (staticDir)
  build/                # The generated website
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

A JavaScript config file exports a plain object. It is the only format that can give [embed plugins](#plugins) themselves, rather than their package names.

### Where it is found

`edaha build` and `edaha editor` look for the config file:

1. in the folder given with `--dir` (default: the folder you run the command in);
2. then in the folder of the nearest `package.json`, looking up from there.

You can also name the file yourself with `-c` or `--config`:

```sh
edaha build --config config/edaha.config.json
```

If no config file is found, the command stops with an error that lists the names it looked for.

The folder that holds the config file is the **site folder**. Every folder in the config file (`articlesDir`, `templatesDir`, `staticDir`, `theme`, `outputDir`, `publishDir`) is relative to it.

## Settings

| Setting                             | Required | Description                                                                             |
| ----------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| [`name`](#name)                     | Yes      | The website's name.                                                                     |
| [`description`](#description)       | Yes      | The website's description.                                                              |
| [`path`](#path)                     | No       | A URL path that every article type's URLs start with.                                   |
| [`articlesDir`](#articlesdir)       | No       | The folder that holds the articles.                                                     |
| [`templatesDir`](#templatesdir)     | No       | The folder that holds your own templates.                                               |
| [`staticDir`](#staticdir)           | No       | The folder that holds your own static files.                                            |
| [`theme`](#theme)                   | No       | The theme your templates and static files override: a folder or a package.              |
| [`outputDir`](#outputdir)           | No       | The folder the website is built into.                                                   |
| [`publishDir`](#publishdir)         | No       | A folder outside the site folder that the built website is copied into.                 |
| [`siteUrl`](#siteurl)               | No       | The website's absolute URL, for links in RSS feeds.                                     |
| [`reservedPaths`](#reservedpaths)   | No       | Paths at the website's root that articles and article types can't use.                  |
| [`types`](#types)                   | No       | Settings for each article type: URL path, labels and what is built.                     |
| [`plugins`](#plugins)               | No       | Embed plugins: their package names, or (JavaScript config only) the plugins themselves. |
| [`metadata`](#metadata)             | No       | Custom settings for articles, with how the editor shows them.                           |
| [`metadataGroups`](#metadatagroups) | No       | Groups of settings in the editor, besides the built-in ones.                            |
| [`author`](#author)                 | No       | The author of articles that don't name one.                                             |

Unknown settings stop the build, so a typo doesn't go unnoticed.

### `name`

The website's name, shown in page titles, the header and footer, and RSS feeds. It is also the author of articles that don't name one, unless [`author`](#author) is set.

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

- **Accepted values:** a folder inside the site folder. It can't be the site folder itself, and must be apart from the templates and static files folders.
- **Default:** `articles`

```yaml
articlesDir: content
```

### `templatesDir`

The folder that holds your own [templates](/docs/05-templating/), relative to the site folder. Templates in it are used over the default theme's, one file at a time.

- **Accepted values:** a folder inside the site folder, apart from the articles and static files folders.
- **Default:** `templates`

```yaml
templatesDir: site/templates
```

### `staticDir`

The folder that holds your own static files: stylesheets, fonts, images and anything else copied to the website's root as it is. Its files are used over the default theme's, e.g. a `site.css` replaces the theme's stylesheet.

- **Accepted values:** a folder inside the site folder, apart from the articles and templates folders.
- **Default:** `static`

```yaml
staticDir: site/static
```

A whole site can live in one folder of a bigger project, with the config file at the project's root:

```yaml
articlesDir: site/content
templatesDir: site/templates
staticDir: site/static
outputDir: site/build
```

### `theme`

The [theme](/docs/05-templating/#using-another-theme) that your own templates and static files override, instead of edaha.md's default theme. It's either a folder (with `templates/` and `static/`) or the name of an installed theme package.

- **Accepted values:** a folder path starting with `.` (relative to the site folder) or an absolute path, which can be outside the site folder; or a package name, found from the site folder like a plugin.
- **Default:** edaha.md's default theme (`@lvl99dotcom/edaha-theme-default`)

```yaml
theme: ../themes/my-theme
```

```yaml
theme: "@my-org/edaha-theme-blog"
```

The build stops if the folder or package isn't found.

### `outputDir`

The folder the website is built into, relative to the site folder. It is **emptied on every build**, so keep nothing else in it.

- **Accepted values:** a folder inside the site folder, apart from the articles, templates and static files folders.
- **Default:** `build`

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

If the website lives in a sub-folder of its domain, e.g. a GitHub Pages project site at `https://example.github.io/my-site`, every URL in its pages starts with that path (`/my-site/`), which templates get as [`site.baseUrl`](/docs/05-templating/#template-data). The built files stay at the same places in the output folder, so publish its contents to that sub-folder.

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

| Setting       | Description                                                                                           | Default                       |
| ------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------- |
| `path`        | The type's URL path: lowercase kebab-case, or `""` for the website root.                              | The type's name               |
| `labelSingle` | The label for one article, e.g. "Article".                                                            | The name, capitalised         |
| `labelPlural` | The label for several articles, e.g. "Articles".                                                      | `labelSingle` followed by "s" |
| `generate`    | What is built for the type (see below), or `false` to build nothing.                                  | Everything                    |
| `metadata`    | The [custom settings](#metadata) the type uses, or `false` for none.                                  | All of them                   |
| `author`      | The author of the type's articles that don't name one, or `false` for none ([see `author`](#author)). | The site's `author`           |

`generate` has these settings, all `true` by default:

| Setting   | Builds                                                                |
| --------- | --------------------------------------------------------------------- |
| `article` | The type's article pages. Without them, nothing else is built either. |
| `list`    | The type's [list pages](/docs/06-lists/).                             |
| `feed`    | The type's RSS feed, and its articles in the tag and author feeds.    |
| `author`  | The type's author lists.                                              |
| `tag`     | The type's tag lists.                                                 |

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

### `plugins`

The site's [embed plugins](/docs/07-embeds/), which render `<!-- embed:<key> -->` blocks. edaha.md has none of its own.

- **Accepted values:** a list of package names, found from the config file's folder (install them first). A JavaScript config file can also give the plugins themselves.
- **Default:** none

```yaml
plugins:
  - "@lvl99dotcom/edaha-plugin-youtube"
  - "@lvl99dotcom/edaha-plugin-mermaidjs"
```

```js
// edaha.config.mjs
import { vimeo } from "./embeds/vimeo.mjs";

export default {
  name: "My Site",
  description: "News and notes.",
  plugins: ["@lvl99dotcom/edaha-plugin-youtube", vimeo],
};
```

No two plugins can have the same key. See [Embeds](/docs/07-embeds/) for the plugins there are, and how to write one.

### `author`

The author of articles that don't name one (unless their type has its own `author`): their author lists and feeds use it, and the editor shows it in the author fields. `false` means no author: those articles have none, and aren't in any author's list.

- **Accepted values:** a name, `{ name, email, url }` like an article's [`author`](/docs/04-articles/#settings), or `false`.
- **Default:** the website's [`name`](#name)

```yaml
author:
  name: Jo Bloggs
  email: jo@example.com
  url: https://example.com
types:
  docs:
    author: Docs team # docs articles without an author have this one
  page:
    author: false # pages without an author have none
```

An article chooses its own author, or `author: false` for none, whatever the defaults are.

### `metadata`

Custom settings articles can have besides the core ones (`type`, `status`, `date`, `title`, `template`, `author`, `excerpt`, `thumbnail`, `attachments` and `tags`), e.g. a featured image or a rating. Each is a [JSON Schema](https://json-schema.org/) under the key articles store it with, plus an `$edahaField` saying how the editor shows it.

- **Accepted values:** a map of keys (a letter or `_`, then letters, digits, `_` and `-`; not a core setting's name) to JSON Schemas.
- **Default:** none

```yaml
metadata:
  featured:
    title: Featured image # the label, and in messages (default: the key)
    description: A large image at the top of the article
    type: string
    $edahaField:
      info: JPG, PNG, GIF or WebP
      file:
        accept: image/jpg, image/png, image/gif, image/webp
  rating:
    type: number
    minimum: 0
    maximum: 10
    $edahaField:
      number:
        step: 1
types:
  news:
    metadata: [featured] # news articles use only "featured"
  docs:
    metadata: false # docs use none
  # Types without a metadata setting use them all
```

`$edahaField` has an optional `title`, `description` and `info` (shown under the label), and exactly one field kind, set to `true` or to its options:

| Field kind                                                               | Shows                                                                                                                              |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `text`, `email`, `url`, `tel`, `color`, `date`, `time`, `datetime-local` | An input of that type.                                                                                                             |
| `number`, `range`                                                        | A number input or slider, e.g. with `step`.                                                                                        |
| `textarea`                                                               | A multi-line text box, e.g. with `rows`.                                                                                           |
| `select`                                                                 | A dropdown of `options` (each a `value` and `title`, or the schema's `enum`); `list: true` shows it as a list.                     |
| `checkbox`                                                               | A checkbox, for `type: boolean` (`true` or `false`). With `{ value: ... }`, it saves that value when checked and nothing when not. |
| `radio`                                                                  | Radio buttons for `options` (each with an optional `description`), or the schema's `enum`.                                         |
| `file`                                                                   | A file chooser that uploads into the article's folder (e.g. with `accept`).                                                        |

A `color` field keeps a value written without its `#` (e.g. `0687f5`) that way.

Options are the input's HTML attributes. JSON Schema's own keywords set them too: `minimum` and `maximum` become `min` and `max`, `minLength` and `maxLength` become `minlength` and `maxlength`, and `pattern` stays `pattern`; a field's own options win.

A `type: object` setting is a group of fields, one per property (each with its own `$edahaField`; `required` marks them). A `type: array` setting is a list with Add and Delete buttons, its `items` having the `$edahaField` (`maxItems` limits it). Or give the array itself an `$edahaField`, e.g. a `select` with `multiple: true`, to choose several at once.

```yaml
metadata:
  credit:
    title: Credit
    type: object
    properties:
      name:
        type: string
        $edahaField: { text: true }
      email:
        type: string
        format: email
        $edahaField: { email: true }
    required: [name]
  images:
    title: Images
    type: array
    items:
      type: string
      $edahaField:
        file: { accept: image/* }
    maxItems: 5
```

Each custom setting appears in a group of the editor's settings: `$edahaField.group` names the group (see [`metadataGroups`](#metadatagroups)), or is `{ key, after }` to come after a given setting in it. Without one, it's in the **Custom** group. A map's or list's `$edahaField` may set only its group.

```yaml
metadata:
  featured:
    type: string
    $edahaField:
      group:
        key: files
        after: thumbnail # right after the thumbnail
      file: true
```

#### Default values and conditions

`$edahaField` can also have:

- `defaultValue`: the value a field has when it has none (text, a number, `true`, `false` or `null`). The editor shows it, and saves it with the article.
- `showWhen`: show the field only when these conditions match.
- `hideWhen`: hide the field when these conditions match.

A hidden field's value is left out: the editor doesn't save it, and templates don't get it. A field with both shows when `showWhen` matches and `hideWhen` doesn't. Conditions can use the other fields' values (with their defaults), so fields can show and hide as the author changes them.

A condition is a list of a value's path (in dot notation from the top of the settings, e.g. `credit.name` or `images.0`), an operator, and a value: `=`, `!=`, `>`, `>=`, `<` and `<=` compare with one value (a missing value equals `null`); `in` and `not-in` check a list of values. Group conditions with `and` (all must match) or `or` (any must match), and nest groups; a list of groups must all match.

```yaml
metadata:
  layout:
    type: string
    enum: [slim, large]
    $edahaField:
      select: true
      defaultValue: large
  tracklist:
    type: boolean
    $edahaField:
      checkbox: true
      defaultValue: false
      hideWhen: [layout, "=", slim]
  coverNote:
    type: string
    $edahaField:
      text: true
      showWhen:
        or:
          - [layout, "=", large]
          - [tracklist, "=", true]
```

[Embed options](/docs/07-embeds/#defining-options) use the same fields and conditions.

Values are checked against their schemas with [ajv](https://ajv.js.org/), including formats like `uri` and `email`. Problems are described in plain words, e.g. "Rating must be at most 10" or "Credit name is required", and show above the field in the editor. The build and the editor stop with an error if a key is a core setting's name, a type lists a key that isn't defined, a value has no field kind or more than one, a default value or condition isn't valid, or a schema isn't valid.

### `metadataGroups`

The editor shows articles' settings in groups that open and close. These are built in, in this order:

| Group        | Settings                                                                    | Starts |
| ------------ | --------------------------------------------------------------------------- | ------ |
| `info`       | Type, status, slug, publication date and author.                            | Open   |
| `categorise` | Tags.                                                                       | Closed |
| `customise`  | Excerpt and template.                                                       | Open   |
| `files`      | Thumbnail, attachments, and the files in the article's folder (`uploaded`). | Open   |
| `custom`     | Custom settings without a group.                                            | Closed |

`metadataGroups` adds groups of your own, for [custom settings](#metadata) to be in.

- **Accepted values:** a map of keys (a letter, then letters, digits, `_` and `-`; not a built-in group's key) to a group's settings:
  - `title` (required): the group's heading.
  - `description`: shown above its settings.
  - `after`: the group it comes after. Without it, groups go at the end.
  - `openedByDefault`: whether it starts open (`true`) or closed (`false`, the default).
- **Default:** none

```yaml
metadataGroups:
  seo:
    title: Search engines
    description: How the article appears in search results.
    after: info
    openedByDefault: true
metadata:
  keywords:
    type: string
    $edahaField:
      group: seo
      text: true
```

A setting in a group that doesn't exist, or coming after a setting or group that isn't there, stops the build and the editor with an error.

## Commands

### `edaha build`

Builds the website into `outputDir`, and copies it into `publishDir` if that is set. See [Build & deploy](/docs/08-build-and-deploy/).

| Option                  | Description                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `-c`, `--config <file>` | The config file. Default: the first one found (see [Where it is found](#where-it-is-found)). |
| `--dir <folder>`        | The folder to look for a config file in. Default: the current folder.                        |
| `--site-url <url>`      | The website's absolute URL, for feeds. Default: `SITE_URL`, then `siteUrl`.                  |

### `edaha editor`

Runs the [WYSIWYG editor](/docs/09-wysiwyg-editor/) on your computer.

| Option                  | Description                                                    |
| ----------------------- | -------------------------------------------------------------- |
| `-c`, `--config <file>` | The config file, as for `edaha build`.                         |
| `--dir <folder>`        | The folder to look for a config file in, as for `edaha build`. |
| `--port <number>`       | The port the editor listens on. Default: `5180`.               |

Both commands also take `-h` / `--help` and `-v` / `--version`.
