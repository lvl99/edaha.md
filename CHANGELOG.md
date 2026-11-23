# Changelog

edaha.md follows [semantic versioning](https://semver.org).

## 0.5.0 (2026-11-23)

Templates can output any type of file, and the editor fits better in other apps' pages.

### Added

- A template's file name can give the type of file it outputs, with an extension before `.njk`: e.g. `article/single.json.njk` outputs each article's `index.json`, `article/list.json.njk` each list page's `index.json`, `2.json`, …, and `layouts/rssfeed.json.njk` each list's `feed.json`. Templates without one output HTML (the feed's, XML), and every template of a name is rendered. A list's `feedUrl` links to its XML feed, or its only feed.
- `Templates.outputs(type, name)` and `Templates.feedOutputs()` give a name's templates with the extension each outputs; `templateFileName` and `TemplateOutput` are exported.
- Docs: [output file types](https://edaha.md/docs/05-templating/#output-file-types).

### Changed

- The default theme's feed template is now `layouts/rssfeed.xml.njk`. A site's own `layouts/rssfeed.njk` still overrides it; a template that extends `@theme/layouts/rssfeed.njk` needs the new name.
- A site's template overrides the theme's template that outputs the same type of file, whatever its file name, and two templates in one folder that output the same type of file stop the build, naming them.
- The required templates (`article/single.njk`, `article/list.njk`, `layouts/rssfeed.njk`) can have any output extension.
- In the editor's file browser, a file's **Location** opens its article in the same editor instead of a new tab (cmd-, ctrl-, shift- and alt-clicks still open a new tab).

### Fixed

- The editor's overlays (the narrow layout's article list and article settings, dialogs and toasts) stay within `<edaha-editor>` when it's shown in part of an app's page, instead of covering the rest of the page.

## @lvl99dotcom/edaha.md 0.4.2, @lvl99dotcom/edaha-editor 0.4.2, @lvl99dotcom/edaha-theme-default 0.4.1 (2026-11-23)

Themes are named by their own settings file, and select fields can name their empty choice.

### Added

- `@lvl99dotcom/edaha-theme-default` has an `edahatheme.yml`, naming it "edaha.md".
- In `<edaha-metadata-field>` selects, an option whose `value` is `""` is the "none" choice, in place of "—".

### Changed

- `readThemeInfo` reads a theme's `edahatheme.yml` even when it's a package, with its `package.json` filling in what it leaves out (`isPackage` is still `true` for packages).

## @lvl99dotcom/edaha.md 0.4.1, @lvl99dotcom/edaha-editor 0.4.1 (2026-11-23)

Change a site's config file from code, and build settings forms from schemas.

### Added

- `updateConfigFile(file, changes)` changes a config file's top-level settings (`undefined` removes one), keeping YAML files' comments and layout and JSON files' indentation. The changed settings are checked as `loadSiteConfig` checks them before the file is written, and it's written to a temporary file and renamed. JavaScript config files aren't changed. `changeConfigText` gives the changed text without reading or writing the file.
- `CONFIG_FORM_SCHEMA`: the main settings (`name`, `description`, `siteUrl` and `theme`) as a JSON Schema with `$edahaField`s, for apps' settings forms, with `configFormProblems` (each field's problems in plain words) and `configFormChanges` (the form's values as changes for `updateConfigFile`).
- `@lvl99dotcom/edaha-editor/client` exports `<edaha-metadata-field>` (`EdahaMetadataField`), the field the editor builds from a schema, for apps' own forms.
- Docs for changing the config file and building forms with `<edaha-metadata-field>`.

## 0.4.0 (2026-11-22)

Themes: the default theme is its own package, and sites can use another theme. The editor can also be shown in other apps' pages, as the `<edaha-editor>` web component.

### Added

- `@lvl99dotcom/edaha-theme-default`: the default theme's templates and stylesheet as their own package, installed with `@lvl99dotcom/edaha.md`.
- The `theme` setting: a folder (starting with `.`, or absolute) or an installed theme package's name, which the site's own templates and static files override. `loadSiteConfig` gives its folder as `themeDir`, which the build, the editor and `pnpm site:dev` use.
- `edahatheme.yml`, a theme's name, description, version and authors (a theme package's come from its `package.json`), and the theme helpers `resolveTheme`, `readThemeInfo`, `parseThemeInfo`, `isThemePath`, `packageAuthor` and `THEME_FILE`.
- The editor:
  - A **Home** link under the nav's search, which shows the welcome prompt.
  - Underline and strikethrough buttons in the rich text and Markdown toolbars, after italic.
  - `startEditor`'s `hideTitle` and `hideThemeSwitcher` options, for apps that show the editor in their own window.
- `@lvl99dotcom/edaha-editor/client`: the `<edaha-editor>` web component (`EdahaEditor`), `EditorApi` and `ApiError` for apps' own pages, with `@lvl99dotcom/edaha-editor/client/style.css` (the editor's styles and edaha.md's design tokens).
- `EditorApi` takes `{ baseUrl, fetch }`, with `url()` and `previewUrl()`: articles' files, images, previews and embed frames are shown from the editor server at `baseUrl`. `<edaha-editor>` has `dirty`, and `startEditor`'s server has `fetch(request)`.
- Docs for using another theme and showing the editor in your own app.

### Changed

- The default theme moved from `@lvl99dotcom/edaha.md`'s `theme/` folder to `@lvl99dotcom/edaha-theme-default`; `THEME_DIR` is its folder.
- Lit and Tiptap are dependencies of `@lvl99dotcom/edaha-editor`, rather than bundled only into its page.
- The table of contents' `disc` and `circle` list styles use the same bullets as nested HTML lists: `disc` is • and `circle` is ◦.
- edaha.md's website is at https://edaha.md.

### Fixed

- The editor's page no longer scrolls and leaves a gap under it while editing.

## 0.3.0 (2026-11-21)

Two new embed plugins: a table of contents and a code highlighter.

### Added

- `@lvl99dotcom/edaha-plugin-toc`: a table of contents of the article's headings, as nested lists of links, with a list style for each heading level (`number`, `number-depth`, `alpha`, `number-roman`, `circle`, `disc`, `square`, `diamond`). It is built with the page and needs no JavaScript.
- `@lvl99dotcom/edaha-plugin-codehighlight`: code blocks with line numbers, a copy button and syntax highlighting (Shiki, loaded from jsDelivr, in light or dark colours to match the page). Several code blocks become tabs, labelled by their headings or languages.
- Embed plugins get the headings of the article a block is in (`context.headings` in `render`), and can set `contentOptional` so the embed dialog saves blocks without content.
- The `json`, `parseJson`, `contains` and `where` template filters.
- A docs front page, and docs pages for the new plugins.

### Changed

- Checkboxes and radio buttons in the editor's metadata and embed option fields come before their labels (after them in right-to-left text).

### Fixed

- Links to the docs in the READMEs work on GitHub and npm.

## 0.2.0 (2026-11-20)

edaha.md is now a set of packages: the core `@lvl99dotcom/edaha.md`, the article editor `@lvl99dotcom/edaha-editor`, and embed plugins for YouTube, Bandcamp and MermaidJS. From this release, the packages share their major and minor version numbers; each has its own patch number.

### Added

- `@lvl99dotcom/edaha-editor`: the article editor as its own package, loaded by `edaha editor` when it is installed.
- Embed plugins, keyed by name (`<!-- embed:<key> -->...<!-- /embed:<key> -->`): `@lvl99dotcom/edaha-plugin-youtube`, `@lvl99dotcom/edaha-plugin-bandcamp` and `@lvl99dotcom/edaha-plugin-mermaidjs`, listed under the config file's `plugins` setting.
- Embed plugins can add HTML once per page with `renderHead` and `renderFoot`, shown by the `{% embedHead %}` and `{% embedFoot %}` template tags; a page's blocks share each embed's `state`.
- Embed plugins can `validate` a block's content; blocks that aren't valid are left out of the page with a warning.
- Embed options, defined as fields and saved as YAML in the block. The Bandcamp player has layout, artwork, tracklist and colour options.
- Custom metadata: the config file defines fields as JSON Schema with `$edahaField`, in groups, with default values and `showWhen`/`hideWhen` conditions; each article type chooses which it uses. Templates get them as `article.meta`, and the build warns about problems.
- Raw blocks and raw text, shown exactly as written.
- Config files in YAML, JSON or JavaScript (`edahaconfig.yml` and similar names), found in `--dir` or the nearest `package.json`'s folder, or named with `--config`. Article headers can be YAML or JSON.
- The `articlesDir`, `templatesDir` and `staticDir` settings, the `@theme/` template prefix, and the `type`, `isArticle` and `isList` template variables.
- Default authors for the site and for each article type; `author: false` means no author.
- Sites in a sub-folder of their domain: every URL in built pages starts with `siteUrl`'s path, given to templates as `site.baseUrl`.
- The editor:
  - A welcome prompt, recent articles and title search in the nav, and an article browser that filters and sorts every article.
  - A file browser for every article's files, to open, copy the path of, replace or delete, updating references in every article; existing files can be chosen wherever files are uploaded.
  - Custom settings in the article form, in groups, showing defaults and hiding fields by their conditions.
  - A button for each embed, an embed dialog that checks the content and options, and embeds shown in sandboxed frames.
  - A floating toolbar above selected text, with bold, italic, underline, strikethrough, link and headings 1–3.
  - A Markdown toolbar, a Preview width control, focus mode, light and dark themes, and a layout for narrow screens.
- Docs for edaha.md on its own website, including articles for each plugin.

### Changed

- `buildBlog` is now `buildSite`, `BlogConfig` is now `EdahaConfig`, and the templates' `blog` data is merged into `site` (`blog.url` is now `site.path`).
- Embeds are plugins: the `embeds` setting and the built-in YouTube and Bandcamp renderers are replaced by the `plugins` setting and the plugin packages. Blocks without a key give a warning and are shown as written.
- `outputDir` defaults to `build`.
- The editor's elements are named `edaha-` instead of `blog-`.
- Body headings in the editor can be H1; underlined text is saved as `<u>` and struck-through text as `~~`.
- Metadata problems are described in plain words.

### Fixed

- Embeds whose HTML has blank lines were cut off by Markdown.
- Embedded players such as Bandcamp's failed in the editor; previews and embed frames are now shown from a separate address.
- `readmore` and embed blocks were acted on inside code blocks and inline code.
- The default theme's pages didn't get their own titles.
- `edaha editor` in the workspace served the editor page's unbuilt source.

## 0.1.0 (2026-11-15)

The first release: the blog generator and article editor from LiveCanvas, as a package of their own.

### Added

- `edaha build` and `edaha editor` commands, with `--dir`, `--site-url` and `--port`.
- A neutral default theme (`theme/`). A site's own `templates/` and `static/` override its files one by one.
- `siteUrl` and `reservedPaths` settings in `config.yml`.
- `buildBlog`, `startEditor`, `createEditorServer`, embed renderers and template data types in the public API.

### Changed

- `outputDir` and `publishDir` are relative to the site folder. `outputDir` defaults to `dist` and must be inside the site folder. `publishDir` is optional and must be apart from the site folder.
- Feeds link to `http://localhost` when neither `SITE_URL` nor `siteUrl` is set.
- The editor serves its pre-built page itself, so Vite is not needed to run it.
