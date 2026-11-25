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

<!-- embed:toc -->
<!--yaml
level1: number
level2: number-depth
level3: number-depth
level4: alpha
level5: number-roman
level6: circle
-->

# Contents

<!-- /embed:toc -->

## Build

`buildSite` builds a site, as `edaha build` does:

<!-- embed:codehighlight -->

```ts
import { buildSite } from "@lvl99dotcom/edaha.md";

const result = await buildSite({
  siteDir: "my-site",
  siteUrl: "https://example.com",
});
console.log(`Built ${result.files.length} files into ${result.outputDir}`);
```

<!-- /embed:codehighlight -->

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
shared["Shared files"] --> output
shared -. "with files.url" .-> filesOutput["files.outputDir"]
statics["Static files:<br>the site's over the theme's"] --> output
output -. "if set" .-> publish["publishDir"]
<!-- /embed:mermaidjs -->

1. `loadSiteConfig` finds and reads the config file, checks its settings and loads its embed plugins. The site folder is the config file's folder.
2. Every folder in the articles folder is an article type, with its settings from the config file (or the defaults, with a warning).
3. Each article's `article.md` is read: its header settings are checked, its embed blocks are set aside for the pages that show them, and its Markdown becomes HTML. Drafts are checked but not built.
4. Published articles are collected into lists: one for each type, and one for each tag and author within a type, as the types' `generate` settings say.
5. Each article page, list page and RSS feed is rendered with its template, then the embed blocks it shows are rendered by their plugins (sharing each embed's state on the page) and the HTML its embeds need is added. Pages are written to `outputDir` with the articles' files, the static files and the shared files (at their path, e.g. `/files/`, or into `files.outputDir` when they are hosted at `files.url`). If `publishDir` is set, everything is then copied there.

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

| Option       | Type            | Description                                                                                                                                           | Default                                                                                                 |
| ------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `siteDir`    | String          | The folder to look for a config file in, before the nearest `package.json`'s folder.                                                                  | The current folder                                                                                      |
| `configFile` | String          | The config file to use instead of looking for one. The site folder is its folder.                                                                     | The first [config file](/docs/03-configuration/#where-it-is-found) found                                |
| `siteUrl`    | String          | The website's absolute URL, for feeds. Its path (e.g. `/edaha.md`) starts every URL in the pages.                                                     | `siteUrl` in the config file, then `http://localhost` with a warning                                    |
| `themeDir`   | String          | The theme's folder (with `templates/` and `static/`), which the site's own templates and static files override, instead of the config file's `theme`. | The config file's [`theme`](/docs/03-configuration/#theme), then edaha.md's default theme (`THEME_DIR`) |
| `plugins`    | EmbedPlugin\[\] | [Embed plugins](/docs/07-embeds/) added after the config file's `plugins`. One with the same key as the config file's is left out.                    | None                                                                                                    |
| `logger`     | `{ warn }`      | Where warnings go, e.g. about articles with problems.                                                                                                 | `console`                                                                                               |
| `fetch`      | Function        | Fetches data for embeds that need it, e.g. Bandcamp's.                                                                                                | The global `fetch`                                                                                      |
| `dryRun`     | Boolean         | Render every page without writing anything, and report pages that can't be rendered in `problems` instead of stopping (see below).                    | `false`                                                                                                 |
| `outputDir`  | String          | Build into this folder instead, e.g. a temporary folder to look at the website before publishing. See below.                                          | The config file's [`outputDir`](/docs/03-configuration/#outputdir)                                      |

With `outputDir`, the website is built into that folder: any folder apart from the site's source folders (the articles, templates, static files and shared files folders), and not the site folder or a folder it's in, as it is emptied first. A relative folder is relative to the current folder. Nothing is copied into `publishDir`, and shared files hosted elsewhere (`files.url`) aren't written, so the site's own build and its published copy stay as they are:

```js
import { tmpdir } from "node:os";
import { join } from "node:path";

const preview = await buildSite({
  siteDir: "my-site",
  outputDir: join(tmpdir(), "my-site-preview"),
});
// Serve preview.outputDir to look at the website
```

`buildSite` resolves with:

| Property         | Description                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `outputDir`      | The absolute output folder.                                                               |
| `publishDir`     | The absolute folder the files were copied into, if `publishDir` is set.                   |
| `filesOutputDir` | The absolute folder the shared files were copied into, if they are hosted at `files.url`. |
| `articles`       | The built articles' template data (published and unlisted).                               |
| `files`          | Every file written, relative to the output folder.                                        |

It rejects with an error that names the problem (and the config file or article) when the site can't be built, e.g. a config setting is wrong, or a static file or shared file has the same path as an article's file. Problems that don't stop the build go to `logger.warn`.

### Checking templates

`checkSite` checks a site's templates and its theme's as `edaha check` does (see [Templating](/docs/05-templating/#checking-templates)), without building. It takes `siteDir`, `configFile`, `themeDir` and `logger`, like `buildSite`, and resolves with a list of problems, empty when there are none. Each has the template's `file` (an absolute path), its `line` and `column` (from 1; not given for problems with a whole file) and a `message`. `checkTemplates` checks template folders you give it (the site's first, the theme's last), and `formatProblem` writes a problem as `file:line:column message`, with the file relative to a folder. To also render every page, as `edaha check --render` does, call `buildSite` with `dryRun: true`: nothing is written (static and shared files aren't copied), `files` lists the pages it rendered, and `problems` lists each render problem once, in the template it is in, with the first page it was found on:

<!-- embed:codehighlight -->

```ts
import { checkSite, formatProblem } from "@lvl99dotcom/edaha.md";

const problems = await checkSite({ siteDir: "my-site" });
for (const problem of problems)
  console.error(formatProblem(problem, process.cwd()));
```

<!-- /embed:codehighlight -->

### Reading the config file

`loadSiteConfig` finds and reads a site's config file as the build does, e.g. to read its settings in a script of your own:

<!-- embed:codehighlight -->

```ts
import { loadSiteConfig } from "@lvl99dotcom/edaha.md";

const { configFile, siteDir, config } = await loadSiteConfig({
  siteDir: "my-site",
});
console.log(`${config.name}: ${Object.keys(config.types).join(", ")}`);
```

<!-- /embed:codehighlight -->

It takes `siteDir`, `configFile` and `logger`, like `buildSite`. Besides the config file, its folder and its settings, it gives `themeDir`: the folder of the theme named in the config file's `theme`, or `undefined` for the default theme. The config helpers it uses are exported too: `findConfigFile` (which file would be used), `readConfigFile` (its raw settings) and `parseConfig` (check settings and fill in defaults; give it plugin objects, as it doesn't load packages).

### Changing the config file

`updateConfigFile` changes a config file's top-level settings, e.g. from an app's settings screen. A value sets a setting, and `undefined` removes it:

<!-- embed:codehighlight -->

```ts
import { updateConfigFile } from "@lvl99dotcom/edaha.md";

const { config } = await updateConfigFile("my-site/edahaconfig.yml", {
  name: "Notes",
  siteUrl: undefined,
});
```

<!-- /embed:codehighlight -->

YAML files keep their comments and layout, and JSON files keep their indentation. JavaScript files can't be changed (it rejects; change them yourself). The changed settings are checked as `loadSiteConfig` checks them before the file is written, and the file is written to a temporary file and renamed, so it's never half-written. It resolves with the site's new config, like `loadSiteConfig`, and rejects, naming the file, if the settings can't be used, leaving the file as it was. `changeConfigText` gives the changed text without reading or writing the file.

`CONFIG_FORM_SCHEMA` has the main settings (`name`, `description`, `siteUrl` and `theme`) as a JSON Schema with [`$edahaField`s](/docs/03-configuration/#metadata), so an app can show them as a form with `<edaha-metadata-field>` (see [Showing the editor in your own app](#showing-the-editor-in-your-own-app)). `configFormProblems(values)` says what's wrong with each field, as the editor's metadata problems, and `configFormChanges(values)` turns the form's values into changes for `updateConfigFile`: text is trimmed, and an empty optional field removes its setting.

### Themes

`@lvl99dotcom/edaha.md/theme` has helpers for [themes](/docs/05-templating/#using-another-theme), e.g. for tools that manage them:

<!-- embed:codehighlight -->

```ts
import { readThemeInfo, resolveTheme, THEME_DIR } from "@lvl99dotcom/edaha.md";

const themeDir = await resolveTheme("../themes/my-theme", "my-site");
const { name, version, authors, isPackage } = await readThemeInfo(themeDir);
```

<!-- /embed:codehighlight -->

| Export                         | Description                                                                                                                                                                                                                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `THEME_DIR`                    | The default theme's folder.                                                                                                                                                                                                                                                                                      |
| `THEME_FILE`                   | The name of a theme's settings file: `edahatheme.yml`.                                                                                                                                                                                                                                                           |
| `resolveTheme(theme, siteDir)` | The folder of a `theme` setting: a folder path (relative to `siteDir`) or an installed package's name. Rejects if it isn't found.                                                                                                                                                                                |
| `isThemePath(theme)`           | Whether a `theme` setting is a folder path (it starts with `.` or is absolute) rather than a package name.                                                                                                                                                                                                       |
| `readThemeInfo(themeDir)`      | A theme's `name`, `description`, `version` and `authors`, from its `edahatheme.yml`, with its `package.json` filling in what that leaves out (or giving them all, without one), else just its folder's name. `isPackage` is `true` when it has a `package.json`. Rejects, naming the file, if a file is invalid. |
| `parseThemeInfo(data, source)` | Checks the settings read from an `edahatheme.yml`.                                                                                                                                                                                                                                                               |
| `packageAuthor(value)`         | Reads a `package.json` author, e.g. `"Jane Doe <jane@example.com> (https://example.com)"`.                                                                                                                                                                                                                       |

### Embed plugins

The embed API (`EmbedPlugin`, `EmbedResolver`, `EMBED_PAGE_PARTS`, `embedBlock`, `splitEmbed`, `cachedFetch`, `isEmbedPlugin`, `loadPlugins` and `validationErrors`) is exported too. `EmbedResolver` renders embeds page by page: `replaceBlocks` puts placeholders for a page's blocks in its Markdown, and `renderPage` renders them in the page's HTML, with the HTML its embeds need in place of `EMBED_PAGE_PARTS` (the template data for `{% embedHead %}` and `{% embedFoot %}`). Give `renderPage` the page's output extension (its fourth argument, `html` by default), so embeds in a JSON file are written as JSON text. The fields' `defaultValue`, `showWhen` and `hideWhen` are applied by `resolveFields`, from `@lvl99dotcom/edaha.md/generator/fields`. See [Embeds](/docs/07-embeds/#creating-your-own) for how to write a plugin.

### The command line

`runCli` runs the `edaha` command with its arguments, and resolves with its exit code. It takes the folder, environment and output to use, so it can run inside another tool:

<!-- embed:codehighlight -->

```ts
import { runCli } from "@lvl99dotcom/edaha.md";

const code = await runCli(["build", "--dir", "my-site"], {
  cwd: process.cwd(),
  env: process.env,
  log: console.log,
  error: console.error,
});
```

<!-- /embed:codehighlight -->

## Editor

`startEditor`, from the editor package, starts the [article editor](/docs/09-wysiwyg-editor/) on this computer, as `edaha editor` does:

<!-- embed:codehighlight -->

```ts
import { startEditor } from "@lvl99dotcom/edaha-editor";

const editor = await startEditor({ siteDir: "my-site", port: 5180 });
console.log(`Open ${editor.url}`);
// Later
await editor.close();
```

<!-- /embed:codehighlight -->

It only listens on `127.0.0.1`: never deploy it, as it reads and writes the site's files.

### `startEditor` options

`startEditor` (and `createEditorServer`) take:

| Option              | Type            | Description                                                                                                                        | Default                                                  |
| ------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `siteDir`           | String          | The folder to look for a config file in, before the nearest `package.json`'s folder.                                               | The current folder                                       |
| `configFile`        | String          | The config file to use instead of looking for one.                                                                                 | The first config file found                              |
| `port`              | Number          | The port to listen on.                                                                                                             | `5180`                                                   |
| `themeDir`          | String          | The theme's folder, which the site's own templates and static files override, instead of the config file's `theme`.                | The config file's `theme`, then edaha.md's default theme |
| `plugins`           | EmbedPlugin\[\] | Embed plugins added after the config file's `plugins`.                                                                             | None                                                     |
| `hideTitle`         | Boolean         | Hide the "edaha.md" title, e.g. in an app that shows the editor in its own window. **Home** still goes back to the welcome prompt. | `false`                                                  |
| `hideThemeSwitcher` | Boolean         | Hide the light/dark theme switcher, showing the device's light or dark theme instead.                                              | `false`                                                  |
| `fetch`             | Function        | Fetches data for embeds that need it.                                                                                              | The global `fetch`                                       |
| `clientDir`         | String          | The folder with the editor page's built files.                                                                                     | The editor package's `dist/client`                       |
| `logger`            | `{ warn }`      | Where the warning about a folder with several config files goes.                                                                   | None                                                     |

`startEditor` resolves with the editor's `url`, a `fetch` function that answers a `Request` without the network (see [Showing the editor in your own app](#showing-the-editor-in-your-own-app)) and a `close` function, once it is listening. It rejects if the config file can't be read, or the port is in use.

### Serving it yourself

`createEditorServer` gives the editor as a [Hono](https://hono.dev) app instead, without listening, e.g. to serve it with your own server or test it:

<!-- embed:codehighlight -->

```ts
import { createEditorServer } from "@lvl99dotcom/edaha-editor";

const app = await createEditorServer({ siteDir: "my-site" });
const response = await app.request("/api/articles");
console.log(await response.json());
```

<!-- /embed:codehighlight -->

Its API only accepts changes from the editor page's own address (`http://127.0.0.1:<port>`), so serve it there.

### Showing the editor in your own app

`@lvl99dotcom/edaha-editor/client` gives the editor's page as a web component, `<edaha-editor>`, for an app's own page (e.g. a desktop app). It's defined when imported. It needs an editor server for the site (see `startEditor`), which it reaches with an `EditorApi`:

<!-- embed:codehighlight -->

```ts
import "@lvl99dotcom/edaha-editor/client/style.css";
import { EdahaEditor, EditorApi } from "@lvl99dotcom/edaha-editor/client";

const editor = document.createElement("edaha-editor") as EdahaEditor;
// Set the API before adding the editor to the page, which loads the site's articles
editor.api = new EditorApi({ baseUrl: "http://127.0.0.1:5180" });
editor.setAttribute("hide-title", "");
document.body.append(editor);
```

<!-- /embed:codehighlight -->

The stylesheet styles the editor and has edaha.md's design tokens as CSS variables on `:root` (e.g. `--colour-text`, `--colour-link`, `--border-radius`), in light and dark, so the app's page can use them too. Inside a shadow root, add the stylesheet to the shadow root as well, as `:root` rules don't apply there (the variables still do).

The editor is as tall as the window unless the app's page gives it another height, e.g. to show it under the app's own bar. Its overlays (the narrow layout's article list and article settings, dialogs and messages) stay within it.

| `EditorApi` option | Type     | Description                                                                                                                                                                                              | Default                     |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `baseUrl`          | String   | The editor server's address, e.g. `http://127.0.0.1:5180`. Requests, articles' files and images, and preview pages use it.                                                                               | `""`: the page's own server |
| `fetch`            | Function | Sends the requests, e.g. through the app's own channel to `startEditor`'s `fetch`, so the API isn't reached over the network. Requests other than `GET` need an `Origin` header of the editor's address. | The global `fetch`          |

`<edaha-editor>` has:

| Attribute or property | Description                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `api`                 | The `EditorApi` it uses. Set it before adding the editor to the page.                                               |
| `hide-title`          | Hides the "edaha.md" title. **Home** still goes back to the welcome prompt.                                         |
| `hide-theme-switcher` | Hides the light/dark theme switcher, showing the device's (or the app's) light or dark theme.                       |
| `dirty`               | Whether the open article has unsaved changes.                                                                       |
| `leaveForm()`         | Asks whether to save unsaved changes first: resolves with whether the editor can be closed (or another site shown). |

`<edaha-metadata-field>` (`EdahaMetadataField`) is the field the editor builds from a custom metadata value's schema, for an app's own forms, e.g. with `CONFIG_FORM_SCHEMA`. Give it a `path`, a `schema` (a JSON Schema with `$edahaField`s; an object's properties become a group of fields), a `value` and any `problems`; it fires `metadata-change` with `{ path, value }` when a value changes (paths inside an object are joined with `/`, e.g. `settings/name`). It renders without a shadow root, styled by the editor's stylesheet.

Preview pages and embed frames are still shown from the editor server, at its previews' own address (`http://localhost:<port>`), so the app's page must allow loading frames and images from it.
