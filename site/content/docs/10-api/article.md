<!--yaml
status: published
date: 2026-11-20T18:36:00.000Z
author: false
-->

# API

Everything the `edaha` command does, you can do from JavaScript or TypeScript: build a site when and how you like, read its config file, write embed plugins, and run the article editor.

<!-- readmore -->

The packages are ES modules with TypeScript types, and need Node.js 22 or later:

| Package                       | What it exports                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `@lvl99dotcom/edaha.md`       | `buildSite`, `loadSiteConfig` and the other config helpers, the embed API, `runCli` |
| `@lvl99dotcom/edaha-editor`   | `startEditor` and `createEditorServer`                                              |
| `@lvl99dotcom/edaha-plugin-…` | One embed plugin each, as their default export                                      |

## Build

`buildSite` builds a site, as `edaha build` does:

```ts
import { buildSite } from "@lvl99dotcom/edaha.md";

const result = await buildSite({
  siteDir: "my-site",
  siteUrl: "https://example.com",
});
console.log(`Built ${result.files.length} files into ${result.outputDir}`);
```

### How a build works

A build reads the [config file](/docs/03-configuration/) and the site's articles, turns each article's Markdown into HTML, and renders it with the site's [templates](/docs/05-templating/) into the output folder:

<!-- embed:mermaidjs -->

flowchart TD
config["Config file<br>(edahaconfig.yml)"] --> load["loadSiteConfig<br>settings and embed plugins"]
load --> types["Article types"]
articles["articles/&lt;type&gt;/&lt;slug&gt;/article.md"] --> article["Each article:<br>header settings, embeds, Markdown to HTML"]
types --> article
article --> lists["Lists: types, tags and authors"]
article --> pages["Article pages"]
lists --> listPages["List pages and RSS feeds"]
templates["Templates:<br>the site's over the theme's"] --> pages
templates --> listPages
pages --> output["outputDir"]
listPages --> output
files["Articles' files"] --> output
statics["Static files:<br>the site's over the theme's"] --> output
output -. "if set" .-> publish["publishDir"]
<!-- /embed:mermaidjs -->

1. `loadSiteConfig` finds and reads the config file, checks its settings and loads its embed plugins. The site folder is the config file's folder.
2. Every folder in the articles folder is an article type, with its settings from the config file (or the defaults, with a warning).
3. Each article's `article.md` is read: its header settings are checked, its embed blocks are set aside for the pages that show them, and its Markdown becomes HTML. Drafts are checked but not built.
4. Published articles are collected into lists: one for each type, and one for each tag and author within a type, as the types' `generate` settings say.
5. Each article page, list page and RSS feed is rendered with its template, then the embed blocks it shows are rendered by their plugins (sharing each embed's state on the page) and the HTML its embeds need is added. Pages are written to `outputDir` with the articles' files and the static files. If `publishDir` is set, everything is then copied there.

Templates are found in the site's templates folder first, then in the default theme. A type's own template (e.g. `templates/news/single.njk`) comes before the `article` ones, and an article can name another with its `template` setting. Every page template extends a layout:

<!-- embed:mermaidjs -->

flowchart LR
data["Template data:<br>site, type, article, list, embeds"] --> page
subgraph page["Page template"]
direction TB
own["templates/&lt;type&gt;/single.njk"] -. "if missing" .-> siteArticle["templates/article/single.njk"]
siteArticle -. "if missing" .-> themeArticle["theme: article/single.njk"]
end
page -- "extends" --> layout["layouts/html.njk<br>(the site's, or the theme's)"]
layout --> html["index.html"]
<!-- /embed:mermaidjs -->

A site's template can build on the theme's version of itself with `{% extends "@theme/article/single.njk" %}`. See [Templating](/docs/05-templating/) for the template data and filters.

### `buildSite` options

| Option       | Type          | Description                                                                                                                        | Default                                                                  |
| ------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `siteDir`    | String        | The folder to look for a config file in, before the nearest `package.json`'s folder.                                               | The current folder                                                       |
| `configFile` | String        | The config file to use instead of looking for one. The site folder is its folder.                                                  | The first [config file](/docs/03-configuration/#where-it-is-found) found |
| `siteUrl`    | String        | The website's absolute URL, for feeds. Its path (e.g. `/edaha.md`) starts every URL in the pages.                                  | `siteUrl` in the config file, then `http://localhost` with a warning     |
| `themeDir`   | String        | The default theme's folder (with `templates/` and `static/`), which the site's own templates and static files override.            | edaha.md's theme (`THEME_DIR`)                                           |
| `plugins`    | EmbedPlugin[] | [Embed plugins](/docs/07-embeds/) added after the config file's `plugins`. One with the same key as the config file's is left out. | None                                                                     |
| `logger`     | `{ warn }`    | Where warnings go, e.g. about articles with problems.                                                                              | `console`                                                                |
| `fetch`      | Function      | Fetches data for embeds that need it, e.g. Bandcamp's.                                                                             | The global `fetch`                                                       |

`buildSite` resolves with:

| Property     | Description                                                             |
| ------------ | ----------------------------------------------------------------------- |
| `outputDir`  | The absolute output folder.                                             |
| `publishDir` | The absolute folder the files were copied into, if `publishDir` is set. |
| `articles`   | The built articles' template data (published and unlisted).             |
| `files`      | Every file written, relative to the output folder.                      |

It rejects with an error that names the problem (and the config file or article) when the site can't be built, e.g. a config setting is wrong, or a static file has the same path as an article's file. Problems that don't stop the build go to `logger.warn`.

### Reading the config file

`loadSiteConfig` finds and reads a site's config file as the build does, e.g. to read its settings in a script of your own:

```ts
import { loadSiteConfig } from "@lvl99dotcom/edaha.md";

const { configFile, siteDir, config } = await loadSiteConfig({
  siteDir: "my-site",
});
console.log(`${config.name}: ${Object.keys(config.types).join(", ")}`);
```

It takes `siteDir`, `configFile` and `logger`, like `buildSite`. The config helpers it uses are exported too: `findConfigFile` (which file would be used), `readConfigFile` (its raw settings) and `parseConfig` (check settings and fill in defaults; give it plugin objects, as it doesn't load packages).

### Embed plugins

The embed API (`EmbedPlugin`, `EmbedResolver`, `EMBED_PAGE_PARTS`, `embedBlock`, `splitEmbed`, `cachedFetch`, `isEmbedPlugin`, `loadPlugins` and `validationErrors`) is exported too. `EmbedResolver` renders embeds page by page: `replaceBlocks` puts placeholders for a page's blocks in its Markdown, and `renderPage` renders them in the page's HTML, with the HTML its embeds need in place of `EMBED_PAGE_PARTS` (the template data for `{% embedHead %}` and `{% embedFoot %}`). The fields' `defaultValue`, `showWhen` and `hideWhen` are applied by `resolveFields`, from `@lvl99dotcom/edaha.md/generator/fields`. See [Embeds](/docs/07-embeds/#creating-your-own) for how to write a plugin.

### The command line

`runCli` runs the `edaha` command with its arguments, and resolves with its exit code. It takes the folder, environment and output to use, so it can run inside another tool:

```ts
import { runCli } from "@lvl99dotcom/edaha.md";

const code = await runCli(["build", "--dir", "my-site"], {
  cwd: process.cwd(),
  env: process.env,
  log: console.log,
  error: console.error,
});
```

## Editor

`startEditor`, from the editor package, starts the [article editor](/docs/09-wysiwyg-editor/) on this computer, as `edaha editor` does:

```ts
import { startEditor } from "@lvl99dotcom/edaha-editor";

const editor = await startEditor({ siteDir: "my-site", port: 5180 });
console.log(`Open ${editor.url}`);
// Later
await editor.close();
```

It only listens on `127.0.0.1`: never deploy it, as it reads and writes the site's files.

### `startEditor` options

`startEditor` (and `createEditorServer`) take:

| Option       | Type          | Description                                                                           | Default                            |
| ------------ | ------------- | ------------------------------------------------------------------------------------- | ---------------------------------- |
| `siteDir`    | String        | The folder to look for a config file in, before the nearest `package.json`'s folder.  | The current folder                 |
| `configFile` | String        | The config file to use instead of looking for one.                                    | The first config file found        |
| `port`       | Number        | The port to listen on.                                                                | `5180`                             |
| `themeDir`   | String        | The default theme's folder, which the site's own templates and static files override. | edaha.md's theme                   |
| `plugins`    | EmbedPlugin[] | Embed plugins added after the config file's `plugins`.                                | None                               |
| `fetch`      | Function      | Fetches data for embeds that need it.                                                 | The global `fetch`                 |
| `clientDir`  | String        | The folder with the editor page's built files.                                        | The editor package's `dist/client` |
| `logger`     | `{ warn }`    | Where the warning about a folder with several config files goes.                      | None                               |

`startEditor` resolves with the editor's `url` and a `close` function, once it is listening. It rejects if the config file can't be read, or the port is in use.

### Serving it yourself

`createEditorServer` gives the editor as a [Hono](https://hono.dev) app instead, without listening, e.g. to serve it with your own server or test it:

```ts
import { createEditorServer } from "@lvl99dotcom/edaha-editor";

const app = await createEditorServer({ siteDir: "my-site" });
const response = await app.request("/api/articles");
console.log(await response.json());
```

Its API only accepts changes from the editor page's own address (`http://127.0.0.1:<port>`), so serve it there.
