<!--yaml
status: published
date: 2026-11-21T10:39:00.000Z
author: false
-->

# Release v0.3.0

**edaha.md** v0.3.0 has been published! Two new plugins plus some core updates and additions:

## Added

- The new [table of contents plugin](https://www.npmjs.org/package/@lvl99dotcom/edaha-plugin-toc) lists an article's headings as nested lists of links, built with the page so it needs no JavaScript.
- Each heading level in a table of contents can have its own list style: number, number-depth, alpha, number-roman, circle, disc, square or diamond.
- The new [code highlighter plugin](https://www.npmjs.org/package/@lvl99dotcom/edaha-plugin-codehighlight) shows code blocks with line numbers, a copy button and syntax highlighting by Shiki, in light or dark colours to match the page.
- Several code blocks in one code highlighter embed become tabs, labelled by the heading before each block or its language.
- Embed plugins get the headings of the article a block is in, through `context.headings` in their `render` function.
- Embed plugins can set `contentOptional`, so the editor's embed dialog saves blocks without content.
- Templates have new `json`, `parseJson`, `contains` and `where` filters.
- The [docs](https://lvl99.github.io/edaha.md/docs/) have a front page, and a page for each new plugin.

## Changed

- Checkboxes and radio buttons in the editor's metadata and embed option fields now come before their labels, or after them in right-to-left text.

## Fixed

- Links to the docs in the READMEs now work on GitHub and npm.
