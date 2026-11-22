# @lvl99dotcom/edaha-editor

edaha.md's local WYSIWYG article editor, with an article browser and a file browser. Install it next to [`@lvl99dotcom/edaha.md`](https://www.npmjs.com/package/@lvl99dotcom/edaha.md), then run it with `edaha editor`:

```sh
npm add @lvl99dotcom/edaha.md @lvl99dotcom/edaha-editor --save-dev
npx edaha editor --dir my-site
```

It only listens on `127.0.0.1`, as it reads and writes the site's files: never deploy it.

## In your own code

- `startEditor` starts the editor from code, as `edaha editor` does, and `createEditorServer` gives it as a [Hono](https://hono.dev) app to serve yourself (`@lvl99dotcom/edaha-editor`).
- `@lvl99dotcom/edaha-editor/client` gives the editor as the `<edaha-editor>` web component, for an app's own page, with `EditorApi` to connect it to an editor server. Its styles, with edaha.md's design tokens as CSS variables, are in `@lvl99dotcom/edaha-editor/client/style.css`.

See [Showing the editor in your own app](https://edaha.md/docs/10-api/#showing-the-editor-in-your-own-app).

See the [edaha.md README](https://github.com/lvl99/edaha.md#readme) and [docs](https://edaha.md/docs/09-wysiwyg-editor/).

Licensed under the [Apache License 2.0](LICENSE).
