<!--yaml
status: draft
date: 2026-11-20T16:00:00.000Z
-->

# MermaidJS Embed

The [MermaidJS embed plugin](https://www.npmjs.com/package/@lvl99dotcom/edaha-plugin-mermaidjs) allows you to insert diagrams, such as flowcharts and sequence diagrams, written in [Mermaid](https://mermaid.js.org) code.

<!-- readmore -->

## Demo

<!-- embed:mermaidjs -->

graph LR;
Write-->Edit;
Edit-->Build;
Build-->Publish;
<!-- /embed:mermaidjs -->

## Installation

Add the package to your project:

```sh
npm install --save-dev @lvl99dotcom/edaha-plugin-mermaidjs
yarn add --dev @lvl99dotcom/edaha-plugin-mermaidjs
pnpm add --save-dev @lvl99dotcom/edaha-plugin-mermaidjs
```

Add the plugin's package name to your [configuration file](/docs/03-configuration/#plugins):

```yaml
plugins:
  - "@lvl99dotcom/edaha-plugin-mermaidjs"
```

If you use your own layout template, it needs `{% embedFoot %}` before `</body>` to load Mermaid (the default theme's `layouts/html.njk` has it). See [Templating](/docs/05-templating/#embed-tags).

## How to use

When using the [WYSIWYG or Markdown editor](/docs/09-wysiwyg-editor/), press the **MermaidJS diagram** button in the toolbar to add a diagram, then write its Mermaid code. To change a diagram, select it in the body and press its **Edit** button.

You can also write the diagram in an article's Markdown yourself, with its code between the tags on their own lines:

```md
<!-- embed:mermaidjs -->

graph LR;
Write-->Edit;
Edit-->Build;
Build-->Publish;
<!-- /embed:mermaidjs -->
```

The diagram has no options. See [Mermaid's documentation](https://mermaid.js.org/intro/) for the kinds of diagrams and how to write them; its [live editor](https://mermaid.live) is handy for trying out code.

## How it works

The diagram's code is kept in the page, in `<pre class="mermaid">`, so it can still be read as text without scripts. Pages with diagrams load Mermaid 12.3.0 from `https://cdn.jsdelivr.net` once, however many diagrams they have, and Mermaid draws them in the visitor's browser when the page has loaded. Building doesn't need internet access.

Diagrams are drawn in Mermaid's dark theme when the page is dark: when its `<html>` element's `data-theme` is `dark` (as the default theme's switcher sets it), or, without `data-theme`, when the visitor's device is set to dark mode.

A diagram with no code gives a warning, and is left out of the website; the rest of the article is still built. Mermaid itself shows an error in place of a diagram whose code it can't read.

Diagrams are wrapped in `<div class="embed embed-mermaidjs">`. See [Embeds](/docs/07-embeds/) for more about embeds.
