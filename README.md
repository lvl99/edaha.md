# edaha.md 🍃🍂

A static website generator using markdown.

It builds pages, paginated lists, tag and author pages and RSS feeds from Markdown files using [Nunjucks](https://mozilla.github.io/nunjucks/) templates.

It also includes a local WYSIWYG editor with an article browser and a file browser. You can also define article metadata and customise how it is manipulated in the editor.

Licensed under the [Apache License 2.0](LICENSE).

## Install

Requires Node.js 22 or later.

```sh
npm add @lvl99dotcom/edaha.md --save-dev
yarn add @lvl99dotcom/edaha.md -D
pnpm add @lvl99dotcom/edaha.md -D
```

The WYSIWYG editor is a separate package. Add it to use `edaha editor`:

```sh
npm add @lvl99dotcom/edaha-editor --save-dev
yarn add @lvl99dotcom/edaha-editor -D
pnpm add @lvl99dotcom/edaha-editor -D
```

| Package                                   | What it has                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `@lvl99dotcom/edaha.md`                   | The `edaha` command, the build and embed blocks                           |
| `@lvl99dotcom/edaha-theme-default`        | The default theme (installed with `@lvl99dotcom/edaha.md`)                |
| `@lvl99dotcom/edaha-editor`               | The local WYSIWYG article editor (`edaha editor`)                         |
| `@lvl99dotcom/edaha-plugin-youtube`       | Embeds YouTube videos                                                     |
| `@lvl99dotcom/edaha-plugin-bandcamp`      | Embeds Bandcamp albums and tracks                                         |
| `@lvl99dotcom/edaha-plugin-mermaidjs`     | Draws Mermaid diagrams                                                    |
| `@lvl99dotcom/edaha-plugin-toc`           | Lists an article's headings as a table of contents                        |
| `@lvl99dotcom/edaha-plugin-codehighlight` | Shows code with line numbers, syntax highlighting, a copy button and tabs |

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

The build writes the website into `my-site/build`. The editor runs at [http://127.0.0.1:5180].

## Commands

```sh
edaha build    # Build the site into the config file's outputDir (and copy it into publishDir, if set)
edaha editor   # Run the local article editor (only reachable from this computer)
```

| Option                  | Command | Description                                                                          |
| ----------------------- | ------- | ------------------------------------------------------------------------------------ |
| `-c`, `--config <file>` | both    | The config file. Default: the first one found (see [Config file](#config-file))      |
| `--dir <folder>`        | both    | The folder to look for a config file in. Default: the current folder                 |
| `--site-url <url>`      | build   | The website's absolute URL, for feeds. Default: `SITE_URL`, then `siteUrl` in config |
| `--port <number>`       | editor  | The port to listen on. Default: 5180                                                 |
| `-h`, `--help`          |         | Show help                                                                            |
| `-v`, `--version`       |         | Show the version                                                                     |

> For more information, see [Build & deploy](https://edaha.md/docs/08-build-and-deploy/) and [WYSIWYG Editor](https://edaha.md/docs/09-wysiwyg-editor/).

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

> For more information, see [Configuration](https://edaha.md/docs/03-configuration/).

## Articles

Each article is a folder `<articlesDir>/<type>/<slug>/` (e.g. `articles/news/hello-world/`) with an `article.md`. Its images and attachments go in the same folder. Folder names are lowercase kebab-case.

Articles can contain metadata. The metadata is located in the article's header within an HTML comment block that has its data format: YAML (`<!--yaml` or `<!--yml`) or JSON (`<!--json`). It is never written into the built files.

> For more information on articles and also how to configure metadata, see [Articles](https://edaha.md/docs/04-articles/).

## Embeds

Embeds turn text in an article into richer content, such as a video player or a diagram. Write the content between `<!-- embed:<key> -->` and `<!-- /embed:<key> -->`, where the key names the kind of embed:

```md
<!-- embed:youtube -->https://www.youtube.com/watch?v=aju_UB5VIf8<!-- /embed:youtube -->

<!-- embed:mermaidjs -->

graph TD;
A-->B;
<!-- /embed:mermaidjs -->
```

Each kind of embed is a plugin. Install the ones you want and list them under `plugins` in the config file:

```sh
npm add @lvl99dotcom/edaha-plugin-youtube @lvl99dotcom/edaha-plugin-mermaidjs --save-dev
```

```yaml
# edahaconfig.yml
plugins:
  - "@lvl99dotcom/edaha-plugin-youtube"
  - "@lvl99dotcom/edaha-plugin-mermaidjs"
```

Some embeds have options, e.g. the Bandcamp player's layout, written in YAML at the start of the block (in a `<!--yaml ... -->` comment); the editor's embed dialog shows them as fields. A block whose key has no plugin gives a warning and is shown as it is written. Plugins can add stylesheets and scripts once per page, through the `{% embedHead %}` and `{% embedFoot %}` template tags (the default theme has them).

> For more information about embeds such as how to create your own, see [Embeds](https://edaha.md/docs/07-embeds/).

## Lists

edaha.md will collate articles by various properties into paginated lists. Typically these lists are generated based on:

- Article type
- Author
- Tag

Lists will also have RSS feeds generated.

When defining article types in the [config](https://edaha.md/docs/03-configuration/) file, you can specify what lists are built.

> For more information about lists, see [Lists](https://edaha.md/docs/06-lists/).

## Templates and the default theme

edaha.md's neutral default theme is the `@lvl99dotcom/edaha-theme-default` package, installed with `@lvl99dotcom/edaha.md`: Nunjucks templates in `templates/` and a stylesheet in `static/base.css`.

A site's own templates folder (`templates/`, or `templatesDir`) overrides the theme's templates file by file. `article/single.njk`, `article/list.njk`, `layouts/html.njk` and `layouts/rssfeed.njk` must exist in one of the two. They are the defaults for every type.

A type's own folder (e.g. `templates/page/`) overrides them, and an article's `template` metadata picks another one (e.g. `page/home.njk`).

Within Nunjucks templates, names starting with `@theme/` always load the theme's file, so a template can override the theme's and still extend it: `{% extends "@theme/article/single.njk" %}`.

A site's own static files folder (`static/`, or `staticDir`) is copied to the website's root, over the theme's static files. A static file with the same path as an article's file stops the build.

> For more information, see [Templating](https://edaha.md/docs/05-templating/).

## Editor

`edaha editor` runs a local WYSIWYG editor for a site's articles, from the `@lvl99dotcom/edaha-editor` package (see [Install](#install)). It only listens on `127.0.0.1` and must never be deployed.

edaha.md was designed to be file-system first, with an editor as a convenience for non-technical users or ones who prefer a GUI.

> For more information about the editor, see [WYSIWYG Editor](https://edaha.md/docs/09-wysiwyg-editor/).

## API

You can programmatically trigger when and how to build your site using TypeScript or JavaScript code, as well as start the editor:

```ts
import { buildSite } from "@lvl99dotcom/edaha.md";
import { startEditor } from "@lvl99dotcom/edaha-editor";

const result = await buildSite({
  siteDir: "my-site",
  siteUrl: "https://example.com",
});
console.log(result.files);

const editor = await startEditor({ siteDir: "my-site", port: 5180 });
console.log(`Open ${editor.url}`);
```

## Development

edaha.md is a [pnpm workspace](https://pnpm.io/workspaces). Run these in the workspace's folder:

```sh
pnpm install
pnpm build          # each package's dist/: Node.js code and types (tsc), and the editor page (Vite)
pnpm test           # unit tests
pnpm test:coverage  # unit tests with coverage
pnpm typecheck
pnpm lint
pnpm format:check
pnpm editor         # run the built editor (after `pnpm build`) for edaha.md's own website at http://127.0.0.1:5180; add `--dir ../my-site` for another site
EDAHA_SITE_DIR=../my-site pnpm dev:editor  # work on the editor page with Vite, for the site whose config file is found from there (restarts when the API's code changes)
pnpm site:build     # build edaha.md's own website (site/) into build/
pnpm site:serve     # serve build/ at http://127.0.0.1:5181/edaha.md/, as GitHub Pages does (PORT=... for another port)
pnpm site:dev       # build and serve site/ at http://127.0.0.1:8449, rebuilding and reloading pages on changes
pnpm site:publish   # build site/ and publish it to the gh-pages branch (GitHub Pages); --dry-run to see what would be published
```

### Project layout

- `packages/edaha/` (`@lvl99dotcom/edaha.md`):
  - `src/generator/`: finds and reads the config file and articles, renders templates and builds the site (`buildSite`).
  - `src/embeds/`: embed blocks, plugins and the embed resolver.
  - `src/cli/`: the `edaha` command. `edaha editor` loads `@lvl99dotcom/edaha-editor` when it is installed.
  - `src/theme/`: the path to the default theme (`@lvl99dotcom/edaha-theme-default`).
  - `src/shared/tests/fixtures/`: a fixture site, also used by the editor's tests.
- `packages/edaha-editor/` (`@lvl99dotcom/edaha-editor`):
  - `src/server/`: the editor's API, article store and Markdown conversion.
  - `src/client/`: the editor page (Lit and Tiptap), bundled into `dist/client`.
  - `src/editor/`: the editor's web server (`startEditor`).
  - `src/shared/tests/`: test helpers.
- `packages/edaha-theme-default/` (`@lvl99dotcom/edaha-theme-default`): the default templates and stylesheet.
- `packages/edaha-plugin-youtube/`, `packages/edaha-plugin-bandcamp/`, `packages/edaha-plugin-mermaidjs/`, `packages/edaha-plugin-toc/`, `packages/edaha-plugin-codehighlight/`: embed plugins.
- `scripts/`: the `site:*` scripts for edaha.md's own website.
- `site/`: edaha.md's own website and docs.

Source imports name their files with `.ts` extensions (e.g. `../slug/index.ts`), so scripts run directly with Node.js type stripping. The build rewrites them to `.js`.

The editor and the plugins import the core's modules by their folder, e.g. `@lvl99dotcom/edaha.md/generator/article`. In the workspace, packages' `exports` point at their `src/` TypeScript files, so nothing needs building first; `publishConfig` points them at `dist/` for npm. `pnpm build` builds `@lvl99dotcom/edaha.md` first, as the other packages' types are built from its `dist/`.

See [CONTRIBUTING.md](CONTRIBUTING.md) to contribute.
