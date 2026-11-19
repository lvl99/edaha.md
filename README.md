# edaha.md

A static website and blog generator. It builds pages, paginated lists, tag and author pages and RSS feeds from Markdown articles with [Nunjucks](https://mozilla.github.io/nunjucks/) templates. It also includes a local article editor.

Licensed under the [Apache License 2.0](LICENSE).

## Install

Requires Node.js 22 or later.

```sh
pnpm add -D @lvl99dotcom/edaha.md
```

## Quick start

A site is a folder with a config file (e.g. `edahaconfig.yml`) and an `articles/` folder:

```
my-site/
  edahaconfig.yml
  articles/
    news/
      hello-world/
        article.md
        photo.jpg
  templates/   # optional; overrides the default theme's templates
  static/      # optional; overrides and adds to the default theme's static files
```

```yaml
# edahaconfig.yml
name: My Site
description: News and notes.
```

```sh
npx edaha build --dir my-site --site-url https://example.com
npx edaha editor --dir my-site
```

The build writes the website into `my-site/build`. The editor runs at http://127.0.0.1:5180.

## Commands

```
edaha build    Build the site into the config file's outputDir (and copy it into publishDir, if set)
edaha editor   Run the local article editor (only reachable from this computer)
```

| Option                  | Command | Description                                                                          |
| ----------------------- | ------- | ------------------------------------------------------------------------------------ |
| `-c`, `--config <file>` | both    | The config file. Default: the first one found (see [Config file](#config-file))      |
| `--dir <folder>`        | both    | The folder to look for a config file in. Default: the current folder                 |
| `--site-url <url>`      | build   | The website's absolute URL, for feeds. Default: `SITE_URL`, then `siteUrl` in config |
| `--port <number>`       | editor  | The port to listen on. Default: 5180                                                 |
| `-h`, `--help`          |         | Show help                                                                            |
| `-v`, `--version`       |         | Show the version                                                                     |

## Config file

The config file can be YAML, JSON or JavaScript. Without `--config`, the commands look for the first of these names in the `--dir` folder, then in the folder of the nearest `package.json`:

- `.edahaconfigrc`, `.edahaconfig`, `edahaconfigrc`, `edahaconfig` or `edaha.config`
- ending in `.yml`, `.yaml`, `.json`, `.js`, `.cjs` or `.mjs` (in that order)

If there is none, they stop with an error. If a folder has several, the first is used with a warning.

The site folder is the config file's folder: `articlesDir`, `templatesDir`, `staticDir`, `outputDir` and `publishDir` are relative to it.

A JavaScript config file exports a plain object:

```js
// edaha.config.mjs
export default {
  name: "My Site",
  description: "News and notes.",
};
```

All settings, in YAML:

```yaml
# Required: the website's name and description
name: My Site
description: News and notes.
# Optional; the URL path prefix of every article type. Default: "" (the website's root)
path: ""
# Optional; the articles, templates and static files folders, inside the site folder and apart from each other
# Defaults: articles, templates and static
articlesDir: articles
templatesDir: templates
staticDir: static
# Optional; the build folder, inside the site folder and apart from the articles, templates and static folders. It is emptied on every build. Default: build
outputDir: build
# Optional; a folder outside the site folder that the built files are copied into, e.g. another app's build folder
publishDir: ../app/dist
# Optional; the website's absolute URL for feeds, used when SITE_URL isn't set. Default: http://localhost (with a warning)
siteUrl: https://example.com
# Optional; paths at the website's root that articles and types can't use, e.g. another app's routes
reservedPaths: [app, api]
# Optional; the author of articles that don't name one: a name, { name, email, url }, or false for none. Types can set their own. Default: the website's name
author: Jo Bloggs
# Optional; custom embed renderers, only in a JavaScript config file (see Embeds)
# embeds: [vimeo]
# Optional; settings for each article type (a folder in the articles folder)
types:
  news:
    labelSingle: News
    labelPlural: News
  page:
    labelSingle: Page
    labelPlural: Pages
    # The website's own pages, at its root: page/index is "/", page/about is "/about"
    path: ""
    generate:
      list: false
      feed: false
      author: false
      tag: false
```

- **Article types:** each folder in the articles folder is a type. `types` sets:
  - its URL `path` (default: its name; `""` for the root);
  - its labels (`labelSingle`, `labelPlural`);
  - what is built for it (`generate`: `article`, `list`, `feed`, `author`, `tag`, all `true` by default, or `generate: false` for nothing).

  A type that isn't configured gives a warning and uses the defaults. Unknown settings stop the build. Types can't be called `tags` or `authors`.

- **Publishing:** when `publishDir` is set, the copy first removes what the previous build published there. It stops if a file is already there (e.g. one written by the other app's build).

## Articles

Each article is a folder `<articlesDir>/<type>/<slug>/` (e.g. `articles/news/hello-world/`) with an `article.md`. Its images and attachments go in the same folder. Folder names are lowercase kebab-case.

The config header at the top is YAML (`<!--yaml` or `<!--yml`) or JSON (`<!--json`). It is never written into the built files.

```md
<!--yaml
date: 2026-10-19T12:00:00.000Z # required
status: published # published (default), draft (not built) or unlisted (own page only, not in lists or feeds)
author: Jo Bloggs # or { name, email, url }, or false for none; defaults to the type's or config's author, then the website name
template: single # optional; a template in templates/<type>/ (or templates/article/), e.g. home
tags: [News]
thumbnail: thumb.jpg # relative to the article folder, or an absolute URL
attachments:
  - url: guide.pdf
-->

# Article title

The excerpt shown in lists. <!-- readmore -->The rest of the article.

<!-- embed -->https://www.youtube.com/watch?v=aju_UB5VIf8<!-- /embed -->
```

- **Heading IDs:** headings get IDs from their text, so they can be linked to. "This?! Is an, example..." becomes `#this-is-an-example`. A repeated heading gets `-2`, `-3`…, and a heading without letters or numbers gets none.
- **Extra HTML:** `<small>`, `<big>` and `<details><summary>…</summary>…</details>` can be used. Leave a blank line after `<summary>…</summary>` and before `</details>`, so the content between them is read as Markdown.
- **Raw content:** anything between `<!-- raw -->` and `<!-- /raw -->` is shown exactly as it is written: no Markdown, embeds, read more breaks or typography. On its own lines it is a `<pre class="raw">` block; within a line, a `<span class="raw">`. Code formatters such as Prettier may change raw content (and Markdown in ` ```md ` code blocks): wrap it in `<!-- prettier-ignore-start -->` and `<!-- prettier-ignore-end -->`, or leave the articles folder out of formatting.
- **Code:** read more breaks, embeds and raw markers in code blocks and inline code are left as they are.
- **Output:**
  - Each type's list is at its path (e.g. `/news/`, 20 per page: `/news/2`, …), with a `feed.xml` RSS feed.
  - Tag and author lists are under it (`/news/tags/<tag>/`, `/news/authors/<author>/`).
  - Articles are at `/<type path>/<slug>/`.
  - An article named `index` is built at its type's path in place of the list (the feed is still built). Its template gets the list's newest articles.
- **URLs can't clash:** slugs can't be `tags`, `authors` or numbers. At the website's root, slugs and type paths can't be a `reservedPaths` entry or another type's path.

## Embeds

Put a URL between `<!-- embed -->` and `<!-- /embed -->` to embed it:

- **YouTube** embeds always use youtube-nocookie.com.
- **Bandcamp** embeds fetch the page at build time, so the build needs internet access.

An unrecognised URL gives a warning and is rendered as a link.

To add your own renderers, list them under `embeds` in a JavaScript config file. They are tried before the built-in ones, by `edaha build` and by the editor and its previews:

```js
// edaha.config.mjs
/** @type {import("@lvl99dotcom/edaha.md").EmbedRenderer} */
const vimeo = {
  name: "Vimeo",
  // Origins its iframes load from, which the editor's preview pages allow
  frameSources: ["https://player.vimeo.com"],
  match: (url) => url.hostname === "vimeo.com",
  render: async (url) =>
    `<iframe src="https://player.vimeo.com/video${url.pathname}"></iframe>`,
};

export default {
  name: "My Site",
  description: "News and notes.",
  embeds: [vimeo],
};
```

`render` gets the URL and `{ fetch }`, and returns HTML; it throws if the URL can't be embedded, which gives a warning and a link. From code, `buildSite` and `startEditor` also take `embedRenderers`: the renderers tried after the config file's (default: the built-in ones, `EMBED_RENDERERS`).

## Templates and the default theme

edaha.md ships a neutral default theme in `theme/`: Nunjucks templates in `theme/templates/` and a stylesheet in `theme/static/site.css`.

- **Templates:** a site's own templates folder (`templates/`, or `templatesDir`) overrides the theme's templates file by file. `article/single.njk`, `article/list.njk`, `layouts/html.njk` and `layouts/rssfeed.njk` must exist in one of the two. They are the defaults for every type. A type's own folder (e.g. `templates/page/`) overrides them, and an article's `template` setting picks another one (e.g. `page/home.njk`). Names starting with `@theme/` always load the theme's file, so a template can override the theme's and still extend it: `{% extends "@theme/article/single.njk" %}`.
- **Static files:** a site's own static files folder (`static/`, or `staticDir`) is copied to the website's root, over the theme's static files. A static file with the same path as an article's file stops the build.

Templates get these variables:

- `site`: the website's `name`, `description`, `url` (its absolute URL), `path` (its home URL, e.g. `/`) and `types` (each type's settings and `url`).
- `type`, `isArticle` and `isList`: the page's article type, and whether it is an article's page or a list's page (or feed), e.g. `{% if type == "page" and isArticle %}`.
- `article` (on article pages): its settings, `bodyHtml`, `excerptHtml`, `author`, `tags` and `attachments`.
- `list` (on list pages and index articles): its `articles` and `pagination`.

They have these filters:

- `date`: e.g. 19 October 2026.
- `rfc822`: the date format feeds use.
- `absoluteUrls(site.url)`: makes root-relative links absolute.

The full types are exported as `TemplateData*`.

## Editor

`edaha editor` runs a local WYSIWYG editor for a site's articles. It only listens on `127.0.0.1` and must never be deployed.

- **Articles:** the welcome prompt shows the 6 most recently changed articles when the editor opens. The nav shows each type's 5 most recently changed articles (including drafts) and a title search. The article browser ("All articles") finds any article by title, type, author, tag and status, in a table sorted by any column (title, type, status, publication date or last change), 50 at a time. It edits the title, template, body and settings.
- **Settings groups:** the editor shows settings in groups that open and close (Info, Categorise, Customise, Files and Custom); `metadataGroups` adds more, and custom settings choose theirs with `$edahaField.group`.
- **Custom settings:** the config file's `metadata` defines custom article settings as JSON Schema, with how the editor shows each (text, number, select, checkbox, radio, file and more, in groups and lists). Each type chooses which it uses. Values are checked with ajv: the editor won't save invalid ones, the build warns about them, and templates get the valid ones as `article.meta`.
- **Index:** the editor keeps an index of the articles in memory, read when it starts and updated when it saves, moves or deletes an article. It watches the articles folder, so changes made outside the editor (e.g. a `git pull`) show too. Nothing is written besides the articles themselves.
- **Body:** rich text with images, links, tables, small and big text, collapsible details blocks, raw blocks, embeds and the read more break.
- **Files:** it uploads images and attachments into the article's folder. Uploads need the article to be saved first. The file browser ("Files") lists every article's files to open, copy the website path of, replace or delete; replacing a file with another name and deleting one update references to it in every article.
- **Moving:** changing an article's type or slug moves its folder.
- **Layout:** three columns that scroll on their own: the article list, the title and body, and the article's buttons and settings. On narrow screens (below 900px), the list opens from a menu button, and the buttons are a bar at the bottom of the screen that opens the settings full screen.
- **Views:** the "WYSIWYG", "Markdown" and "Preview" tabs switch between rich text, the body's Markdown, and the unsaved article rendered with its type's "single" template. The Markdown view has the same toolbar as the rich text one, writing Markdown (or HTML where Markdown has none). The preview can be shown at full width, 900px, 600px or 320px. The preview uses the site's templates and static files over the theme's. It is sent with a Content Security Policy that forbids scripts, requests and forms, so nothing in an article can use the editor's API.
- **Safety:** its API only accepts changes from the editor page itself.
- **Theme:** it follows the device's light or dark setting, and its theme switcher swaps them, remembering the choice in the browser.
- **Saving:** saving rewrites `article.md` in a normalised form (e.g. the read more break on its own line). The config header keeps its format (`yaml`, `yml` or `json`); new articles get `yaml`.

## API

```ts
import { buildSite, startEditor } from "@lvl99dotcom/edaha.md";

const result = await buildSite({
  siteDir: "my-site",
  siteUrl: "https://example.com",
});
console.log(result.files);

const editor = await startEditor({ siteDir: "my-site", port: 5180 });
console.log(`Open ${editor.url}`);
```

`buildSite` options:

- `siteDir`: the folder to look for a config file in. Default: the current folder
- `configFile`: the config file to use instead
- `siteUrl`
- `themeDir`: another theme folder
- `logger`
- `fetch`
- `embedRenderers`: tried after the config file's `embeds`. Default: `EMBED_RENDERERS`

`startEditor` (and `createEditorServer`) options:

- `siteDir`, `configFile`: as for `buildSite`
- `port`
- `themeDir`
- `fetch`
- `embedRenderers`

## Development

```sh
pnpm install
pnpm build          # dist/: Node.js code and types (tsc), and the editor page (Vite)
pnpm test           # unit tests
pnpm test:coverage  # unit tests with coverage
pnpm typecheck
pnpm lint
pnpm format:check
EDAHA_SITE_DIR=../my-site pnpm dev:editor  # work on the editor page with Vite, for the site whose config file is found from there (restarts when the API's code changes)
pnpm site:build     # build edaha.md's own website (site/) into build/ (kept in git)
pnpm site:serve     # serve build/ at http://127.0.0.1:5181 (PORT=... for another port)
pnpm site:dev       # build and serve site/ at http://127.0.0.1:8449, rebuilding and reloading pages on changes
```

### Project layout

- `src/generator/`: finds and reads the config file and articles, renders templates and builds the site (`buildSite`).
- `src/embeds/`: embed renderers.
- `src/server/`: the editor's API, article store and Markdown conversion.
- `src/client/`: the editor page (Lit and Tiptap), bundled into `dist/client`.
- `src/editor/`: the editor's web server (`startEditor`).
- `src/cli/`: the `edaha` command.
- `src/theme/`: the path to `theme/`.
- `src/shared/tests/`: test helpers and a fixture site.
- `theme/`: the default templates and stylesheet.

Source imports name their files with `.ts` extensions (e.g. `../slug/index.ts`), so scripts run directly with Node.js type stripping. The build rewrites them to `.js`.

See [CONTRIBUTING.md](CONTRIBUTING.md) to contribute.
