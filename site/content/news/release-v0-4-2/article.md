<!--yaml
status: published
date: 2026-11-23T01:01:55.000Z
author: false
-->

# Release v0.4.2

**edaha.md** v0.4.2 has been released, with everything from v0.4.0 and v0.4.1, and some additions for apps that manage sites' settings and themes! There is also work in parallel on some future delights that will hopefully make maintaining a website very easy, especially for non-technical people.

## Added

- The default theme is now its own package, [`@lvl99dotcom/edaha-theme-default`](https://www.npmjs.org/package/@lvl99dotcom/edaha-theme-default), which edaha.md installs for you.
- The new [`theme`](https://edaha.md/docs/03-configuration/#theme) setting uses another theme instead of the default one: a folder, or an installed theme package.
- Themes can describe themselves in an `edahatheme.yml` file with their name, description, version and authors.
- Core has new theme helpers, `resolveTheme`, `readThemeInfo`, `parseThemeInfo`, `isThemePath` and `packageAuthor`, for tools that manage themes.
- The editor's nav has a **Home** link under the search, which shows the welcome prompt.
- The editor's rich text and Markdown toolbars have underline and strikethrough buttons, after italic.
- `startEditor` has `hideTitle` and `hideThemeSwitcher` options, for apps that show the editor in their own window.
- The editor is published as the `<edaha-editor>` web component, in `@lvl99dotcom/edaha-editor/client`, with its stylesheet and design tokens, so apps can [show it in their own pages](https://edaha.md/docs/10-api/#showing-the-editor-in-your-own-app).
- `EditorApi` takes a `baseUrl`, so the editor can show articles' files, images and previews from an editor server that isn't its page's own.
- `<edaha-editor>` has a `dirty` property that says whether the open article has unsaved changes.
- `startEditor`'s server has a `fetch` function that answers the editor's requests without the network.
- `updateConfigFile` changes a config file's settings from code, keeping YAML files' comments. (v0.4.1)
- `changeConfigText` gives a config file's changed text without reading or writing the file. (v0.4.1)
- `CONFIG_FORM_SCHEMA` describes the main settings as a schema, so apps can show them as a form. (v0.4.1)
- `configFormProblems` says what's wrong with each of the form's fields, in plain words. (v0.4.1)
- `configFormChanges` turns the form's values into changes for `updateConfigFile`. (v0.4.1)
- The editor's `<edaha-metadata-field>` is exported, so apps can build their own forms from schemas. (v0.4.1)
- The default theme has an `edahatheme.yml`, which names it "edaha.md". (v0.4.2)
- In the editor's select fields, an option with an empty value replaces the "—" choice, so forms can name it. (v0.4.2)
- The docs explain [using another theme](https://edaha.md/docs/05-templating/#using-another-theme) and making your own.
- The docs explain [changing the config file](https://edaha.md/docs/10-api/#changing-the-config-file). (v0.4.1)

## Changed

- edaha.md's website is now at [https://edaha.md](https://edaha.md).
- Lit and Tiptap are now dependencies of `@lvl99dotcom/edaha-editor`, as apps that show the editor's component install them.
- The table of contents' `disc` and `circle` list styles now use the same bullets as nested HTML lists: `disc` is • and `circle` is ◦.
- `readThemeInfo` uses a theme's `edahatheme.yml` even when the theme is a package. (v0.4.2)

## Fixed

- The editor's page no longer scrolls down and leaves a gap under it while you edit an article.
