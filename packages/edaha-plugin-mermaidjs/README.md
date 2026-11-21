# @lvl99dotcom/edaha-plugin-mermaidjs

An [edaha.md](https://github.com/lvl99/edaha.md#readme) embed plugin for [Mermaid](https://mermaid.js.org) diagrams. The diagram's code is kept in the page, and pages with diagrams load Mermaid from jsDelivr to draw them, in Mermaid's dark theme on dark pages.

```sh
npm add @lvl99dotcom/edaha-plugin-mermaidjs --save-dev
yarn add @lvl99dotcom/edaha-plugin-mermaidjs -D
pnpm add @lvl99dotcom/edaha-plugin-mermaidjs -D
```

```yaml
# edahaconfig.yml
plugins:
  - "@lvl99dotcom/edaha-plugin-mermaidjs"
```

<!-- prettier-ignore-start -->
```md
<!-- embed:mermaidjs -->
graph TD;
  A-->B;
  A-->C;
<!-- /embed:mermaidjs -->
```
<!-- prettier-ignore-end -->

Your layout template needs `{% embedFoot %}` before `</body>` (the default theme has it). See [Embeds](https://edaha.md/docs/07-embeds/) in the docs.

Licensed under the [Apache License 2.0](LICENSE).
