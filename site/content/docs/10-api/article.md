<!--yaml
status: published
date: 2026-11-15T18:36:00.000Z
author: false
-->

# API

<!-- @agent

Write about the API here, namely how to use the site generation/templating using JavaScript.

Also review the content and update anything that might be out of date or incorrect.

/@agent -->

## Build

<!-- @agent

Introduction to the build API with some detail about the architecture.

Use MermaidJS to create flow diagrams showing how content gets transformed by the default and inherited templates to be output as static assets.

/@agent -->

```ts
import { buildSite, startEditor } from "@lvl99dotcom/edaha.md";

const result = await buildSite({
  siteDir: "my-site",
  siteUrl: "https://example.com",
});
console.log(result.files);

const editor = await startEditor({ siteDir: "my-site", port: 5180 });
console.log(`Open ${editor.url}`);
```

`buildSite` options:

| Option           | Type       | Description                                                         | Example                          |
| ---------------- | ---------- | ------------------------------------------------------------------- | -------------------------------- |
| `siteDir`        | String     | The relative path from the root where the site's files are located. | `my-site`                        |
| `configFile`     | String     | A relative or absolute path to the edaha.md config.                 | `edahaconfig.yml`                |
| `port`           | Number     | The port to serve the editor from.                                  | 8449                             |
| `themeDir`       | String     | The relative from the root where template files are located.        | `theme`                          |
| `fetch`          | Function   | A specific function to use to send HTTP requests.                   | Uses `fetch` function by default |
| `embedRenderers` | Function[] | An array of functions to use as the embed renderers.                | `EMBED_RENDERERS`                |

## Editor

You can programmatically start the editor using `startEditor`:

```ts
import { startEditor } from "@lvl99dotcom/edaha.md";

const editor = await startEditor({ siteDir: "my-site", port: 5180 });
console.log(`Open ${editor.url}`);
```

`startEditor` (and `createEditorServer`) options:

| Option           | Type       | Description                                                         | Example                          |
| ---------------- | ---------- | ------------------------------------------------------------------- | -------------------------------- |
| `siteDir`        | String     | The relative path from the root where the site's files are located. | `my-site`                        |
| `configFile`     | String     | A relative or absolute path to the edaha.md config.                 | `edahaconfig.yml`                |
| `port`           | Number     | The port to serve the editor from.                                  | 8449                             |
| `themeDir`       | String     | The relative from the root where template files are located.        | `theme`                          |
| `fetch`          | Function   | A specific function to use to send HTTP requests.                   | Uses `fetch` function by default |
| `embedRenderers` | Function[] | An array of functions to use as the embed renderers.                | `EMBED_RENDERERS`                |
