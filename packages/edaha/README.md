# edaha.md 🍃🍂

A static website generator that turns Markdown files into HTML pages and RSS feeds.

It builds pages, paginated lists, tag and author pages and RSS feeds from Markdown files using [Nunjucks](https://mozilla.github.io/nunjucks/) templates.

There is also an optional [locally-run WYSIWYG editor](https://www.npmjs.org/package/@lvl99dotcom/edaha-editor) with an article browser and a file browser.

Licensed under the [Apache License 2.0](LICENSE).

## Installation and quick start

```sh
npm add @lvl99dotcom/edaha.md --save-dev
yarn add @lvl99dotcom/edaha.md -D
pnpm add @lvl99dotcom/edaha.md -D
```

```sh
npx edaha build --dir my-site
```

Add [`@lvl99dotcom/edaha-editor`](https://www.npmjs.com/package/@lvl99dotcom/edaha-editor) to write articles in a local WYSIWYG editor with `edaha editor`.

## Packages

This package is edaha.md's core: the `edaha` command (`edaha build` and `edaha editor`), the build (`buildSite`), the config file, embed blocks and the theme helpers. The other packages add to it:

| Package                                                                                                            | What it has                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `@lvl99dotcom/edaha.md`                                                                                            | The `edaha` command, the build, the config file, embed blocks and theme helpers                               |
| [`@lvl99dotcom/edaha-theme-default`](https://www.npmjs.com/package/@lvl99dotcom/edaha-theme-default)               | The default theme's templates and stylesheet, installed with `@lvl99dotcom/edaha.md`                          |
| [`@lvl99dotcom/edaha-editor`](https://www.npmjs.com/package/@lvl99dotcom/edaha-editor)                             | The local WYSIWYG article editor (`edaha editor`), and its `<edaha-editor>` web component for apps' own pages |
| [`@lvl99dotcom/edaha-plugin-youtube`](https://www.npmjs.com/package/@lvl99dotcom/edaha-plugin-youtube)             | Embeds YouTube videos                                                                                         |
| [`@lvl99dotcom/edaha-plugin-bandcamp`](https://www.npmjs.com/package/@lvl99dotcom/edaha-plugin-bandcamp)           | Embeds Bandcamp albums and tracks                                                                             |
| [`@lvl99dotcom/edaha-plugin-mermaidjs`](https://www.npmjs.com/package/@lvl99dotcom/edaha-plugin-mermaidjs)         | Draws Mermaid diagrams                                                                                        |
| [`@lvl99dotcom/edaha-plugin-toc`](https://www.npmjs.com/package/@lvl99dotcom/edaha-plugin-toc)                     | Lists an article's headings as a table of contents                                                            |
| [`@lvl99dotcom/edaha-plugin-codehighlight`](https://www.npmjs.com/package/@lvl99dotcom/edaha-plugin-codehighlight) | Shows code with line numbers, syntax highlighting, a copy button and tabs                                     |

A site's own `templates/` and `static/` folders override its theme's files one by one. The `theme` setting in the config file uses another theme instead of the default one: a folder, or an installed theme package.

For more information, visit [edaha.md](https://edaha.md/).
