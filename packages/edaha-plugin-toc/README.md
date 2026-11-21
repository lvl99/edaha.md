# @lvl99dotcom/edaha-plugin-toc

An [edaha.md](https://github.com/lvl99/edaha.md#readme) embed plugin for tables of contents. It lists the article's headings (not its title, nor headings in other embed blocks) as nested ordered lists of links, built with the page, without JavaScript.

```sh
npm add @lvl99dotcom/edaha-plugin-toc --save-dev
yarn add @lvl99dotcom/edaha-plugin-toc -D
pnpm add @lvl99dotcom/edaha-plugin-toc -D
```

```yaml
# edahaconfig.yml
plugins:
  - "@lvl99dotcom/edaha-plugin-toc"
```

<!-- prettier-ignore-start -->
```md
<!-- embed:toc -->
<!--yaml
level2: number
level3: alpha
-->
## Contents
<!-- /embed:toc -->
```
<!-- prettier-ignore-end -->

Markdown in the block (optional) is shown above the table of contents.

Headings nest by level: a heading goes under the nearest heading before it with a lower level, so a skipped level (e.g. an `<h4>` after an `<h2>`) adds no empty item. Each level is marked in its own list style, with the options `level1` to `level6`:

| Style          | Marker                                                  |
| -------------- | ------------------------------------------------------- |
| `number`       | 1. 2. 3.                                                |
| `number-depth` | its parent's marker, then its number, e.g. 1.1. or b.2. |
| `alpha`        | a. b. c.                                                |
| `number-roman` | i. ii. iii.                                             |
| `circle`       | ∙                                                       |
| `disc`         | ◦                                                       |
| `square`       | ▪                                                       |
| `diamond`      | ⬩                                                       |

By default: `level1` number, `level2` and `level3` number-depth, `level4` alpha, `level5` number-roman, `level6` circle.

Your layout template needs `{% embedHead %}` before `</head>` (the default theme has it). The editor's embed frames show one block on its own, so they show a note instead of the list; previews show it. See [Embeds](https://edaha.md/docs/07-embeds/) in the docs.

Licensed under the [Apache License 2.0](LICENSE).
