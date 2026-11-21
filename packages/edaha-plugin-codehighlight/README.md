# @lvl99dotcom/edaha-plugin-codehighlight

An [edaha.md](https://github.com/lvl99/edaha.md#readme) embed plugin for code blocks with line numbers, syntax highlighting and a copy button. Several code blocks in one block become tabs. Pages with code load [Shiki](https://shiki.style) from jsDelivr to highlight it, in light or dark colours to match the page.

```sh
npm add @lvl99dotcom/edaha-plugin-codehighlight --save-dev
yarn add @lvl99dotcom/edaha-plugin-codehighlight -D
pnpm add @lvl99dotcom/edaha-plugin-codehighlight -D
```

```yaml
# edahaconfig.yml
plugins:
  - "@lvl99dotcom/edaha-plugin-codehighlight"
```

<!-- prettier-ignore-start -->
````md
<!-- embed:codehighlight -->
<!--yaml
lineNumbers: true
-->
## ts-node

```ts
const example = { treatPeople: "With kindness!" };
```

```js
const example = { treatPeople: "With kindness!" };
```
<!-- /embed:codehighlight -->
````
<!-- prettier-ignore-end -->

Each tab is labelled by the heading before its code block, else its language's name (e.g. `ts` is "TypeScript"), else "Code". Tabs work with a mouse, touch, and the keyboard (arrow keys, Home and End). Other Markdown in the block is left out.

| Option            | What it does                     | Default |
| ----------------- | -------------------------------- | ------- |
| `lineNumbers`     | Shows line numbers               | `true`  |
| `syntaxHighlight` | Highlights the code with Shiki   | `true`  |
| `copyButton`      | Shows a copy to clipboard button | `true`  |

Without JavaScript, the code blocks are shown one under another with their labels, without highlighting or copy buttons. Code in a language Shiki doesn't know is shown as it is.

Your layout template needs `{% embedHead %}` before `</head>` and `{% embedFoot %}` before `</body>` (the default theme has them). See [Embeds](https://lvl99.github.io/edaha.md/docs/07-embeds/) in the docs.

Licensed under the [Apache License 2.0](LICENSE).
