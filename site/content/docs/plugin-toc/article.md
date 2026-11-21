<!--yaml
status: published
date: 2026-11-21T09:00:00.000Z
-->

# Table of Contents Embed

The [table of contents embed plugin](https://www.npmjs.com/package/@lvl99dotcom/edaha-plugin-toc) lists an article's headings as a table of contents, with links to each heading.

<!-- readmore -->

## Demo

<!-- embed:toc -->
<!--yaml
level1: number
level2: number-depth
level3: number-depth
level4: alpha
level5: number-roman
level6: circle
-->

**On this page:**
<!-- /embed:toc -->

## Installation

Add the package to your project:

```sh
npm install --save-dev @lvl99dotcom/edaha-plugin-toc
yarn add --dev @lvl99dotcom/edaha-plugin-toc
pnpm add --save-dev @lvl99dotcom/edaha-plugin-toc
```

Add the plugin's package name to your [configuration file](/docs/03-configuration/#plugins):

```yaml
plugins:
  - "@lvl99dotcom/edaha-plugin-toc"
```

If you use your own layout template, it needs `{% embedHead %}` before `</head>` for the table of contents' styles (the default theme's `layouts/html.njk` has it). See [Templating](/docs/05-templating/#embed-tags).

## How to use

When using the [WYSIWYG or Markdown editor](/docs/09-wysiwyg-editor/), press the **Table of contents** button in the toolbar to add one. You can leave its content empty, or write Markdown to show above the list, e.g. a heading. The editor's body shows a note in its place, as it doesn't show the article; the **Preview** tab shows the list.

You can also write it in an article's Markdown yourself:

```md
<!-- embed:toc -->
<!--yaml
level2: number
level3: alpha
-->

## Contents

<!-- /embed:toc -->
```

The table of contents lists the article's headings, but not its title, nor headings inside embed blocks (such as the `## Contents` above). Headings without letters or numbers have no ID to link to, so they aren't listed.

### Options

Each level of headings, from `<h1>` (`level1`) to `<h6>` (`level6`), is marked in its own list style:

| Style          | Marker                                                                     |
| -------------- | -------------------------------------------------------------------------- |
| `number`       | 1. 2. 3.                                                                   |
| `number-depth` | its parent's marker, then its own number, e.g. 1.1. 1.2., or b.1. under b. |
| `alpha`        | a. b. c.                                                                   |
| `number-roman` | i. ii. iii.                                                                |
| `circle`       | ∙                                                                          |
| `disc`         | ◦                                                                          |
| `square`       | ▪                                                                          |
| `diamond`      | ⬩                                                                          |

| Option   | Default        |
| -------- | -------------- |
| `level1` | `number`       |
| `level2` | `number-depth` |
| `level3` | `number-depth` |
| `level4` | `alpha`        |
| `level5` | `number-roman` |
| `level6` | `circle`       |

#### Nesting

A heading goes under the nearest heading before it with a lower level. A skipped level, e.g. an `<h4>` straight after an `<h2>`, adds no empty item: the `<h4>` goes straight under the `<h2>`, still marked in `level4`'s style. A `number-depth` heading under a bullet uses the marker of the nearest numbered heading above it.

## How it works

The table of contents is built with the page, so it needs no JavaScript. It is a `<nav aria-label="Table of contents">` with nested ordered lists (`<ol role="list">`) of links to the headings, under the block's own Markdown. Markers are written into the page as text, so they look the same in every browser; bullets are hidden from screen readers. Pages with a table of contents get a small stylesheet, once.

A table of contents in an article's excerpt (on list pages) lists the whole article's headings, linking to them on that page.

Tables of contents are wrapped in `<div class="embed embed-toc">`. See [Embeds](/docs/07-embeds/) for more about embeds.
