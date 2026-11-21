<!--yaml
status: published
date: 2026-11-21T09:30:00.000Z
-->

# Code Highlighter Embed

The [code highlighter embed plugin](https://www.npmjs.com/package/@lvl99dotcom/edaha-plugin-codehighlight) shows code with line numbers, syntax highlighting and a copy button. Several code blocks in one embed become tabs.

<!-- readmore -->

## Demo

<!-- embed:codehighlight -->

## ts-node

```ts
const example = {
  treatPeople: "With kindness!",
};
```

```js
const example = {
  treatPeople: "With kindness!",
};
```

```
This is just a random example to show default code tab label.
```

<!-- /embed:codehighlight -->

## Installation

Add the package to your project:

```sh
npm install --save-dev @lvl99dotcom/edaha-plugin-codehighlight
yarn add --dev @lvl99dotcom/edaha-plugin-codehighlight
pnpm add --save-dev @lvl99dotcom/edaha-plugin-codehighlight
```

Add the plugin's package name to your [configuration file](/docs/03-configuration/#plugins):

```yaml
plugins:
  - "@lvl99dotcom/edaha-plugin-codehighlight"
```

If you use your own layout template, it needs `{% embedHead %}` before `</head>` and `{% embedFoot %}` before `</body>` (the default theme's `layouts/html.njk` has them). See [Templating](/docs/05-templating/#embed-tags).

## How to use

When using the [WYSIWYG or Markdown editor](/docs/09-wysiwyg-editor/), press the **Code** button in the toolbar, then write one or more fenced code blocks. To change it, select it in the body and press its **Edit** button.

You can also write it in an article's Markdown yourself:

````md
<!-- embed:codehighlight -->

## ts-node

```ts
const example = { treatPeople: "With kindness!" };
```

## node

```js
const example = { treatPeople: "With kindness!" };
```

<!-- /embed:codehighlight -->
````

With more than one code block, each becomes a tab, labelled by:

1. the heading just before its code block, e.g. `## ts-node`;
2. else its language's name, e.g. `ts` is "TypeScript" (common languages only; others are shown as written);
3. else "Code".

A single code block is shown on its own, with its heading as a label if it has one. Other Markdown in the embed is left out, and headings inside it aren't listed by a [table of contents](/docs/plugin-toc/). An embed without fenced code blocks gives a warning and is left out of the website.

### Options

| Option            | What it does                     | Default |
| ----------------- | -------------------------------- | ------- |
| `lineNumbers`     | Shows line numbers               | `true`  |
| `syntaxHighlight` | Highlights the code with Shiki   | `true`  |
| `copyButton`      | Shows a copy to clipboard button | `true`  |

```md
<!-- embed:codehighlight -->
<!--yaml
lineNumbers: false
copyButton: false
-->

...
<!-- /embed:codehighlight -->
```

## How it works

The code is built into the page as text, one `<span class="line">` per line, so it can be read and copied without scripts; line numbers are added by CSS, so they aren't copied with the code. Without JavaScript, code blocks are shown one under another with their labels.

Pages with code run a small script once, which:

- turns groups of code blocks into tabs. Tabs work with a mouse, touch, and the keyboard: the arrow keys, Home and End move between them;
- adds copy buttons, which say when the code is copied (also to screen readers);
- loads [Shiki](https://shiki.style) 4.6.0 from `https://cdn.jsdelivr.net`, only when a code block on the page has highlighting on, and highlights the code in GitHub's light or dark colours: dark when the page's `<html>` element's `data-theme` is `dark` (as the default theme's switcher sets it), or, without `data-theme`, when the visitor's device is set to dark mode. Shiki loads only the languages the page uses.

Code in a language Shiki doesn't know, or without a language, is shown without highlighting, as it is when Shiki can't be loaded. Building doesn't need internet access.

Code blocks are wrapped in `<div class="embed embed-codehighlight">`. See [Embeds](/docs/07-embeds/) for more about embeds.
