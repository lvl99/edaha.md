<!--yaml
status: published
date: 2026-11-15T18:36:00.000Z
author: false
-->

# Embeds

Embeds turn text in an article into richer content, such as a video, a music player or a diagram. They are like shortcodes in WordPress, or an HTML `<iframe>` you don't have to write yourself. Each kind of embed is a plugin you add to your site.

<!-- readmore -->

## Using embeds

Put the embed's content between `<!-- embed:<key> -->` and `<!-- /embed:<key> -->`, where `<key>` names the kind of embed. For a URL, write it on one line:

```md
Here is the launch video:

<!-- embed:youtube -->https://www.youtube.com/watch?v=aju_UB5VIf8<!-- /embed:youtube -->
```

Content over several lines goes between the tags on their own lines:

```md
<!-- embed:mermaidjs -->

graph TD;
A-->B;
A-->C;
<!-- /embed:mermaidjs -->
```

When the site is built, the block is replaced with the embed's HTML. The closing tag can leave out the key (`<!-- /embed -->`). Blank lines around the content are left out, but the first line's indentation is kept.

That second block draws this diagram on this website:

<!-- embed:mermaidjs -->

graph TD;
A-->B;
A-->C;
<!-- /embed:mermaidjs -->

A block whose key has no plugin, or whose plugin fails, gives a warning and is shown as it is written instead (a URL as a link), so the build carries on. So does an old block without a key (`<!-- embed -->...<!-- /embed -->`): add the key to embed it again.

Embed blocks inside code blocks and inline code are left alone, so you can write about them.

In the [WYSIWYG editor](/docs/09-wysiwyg-editor/), each embed has its own toolbar button, which asks for its content (and options) and shows the embed in the article's body.

### Options

Some embeds have options that change how they show, e.g. the Bandcamp player's layout and colours. A block's options go in YAML in a `<!--yaml ... -->` comment before its content, like an article's settings:

```md
<!-- embed:bandcamp -->
<!--yaml
layout: large
tracklist: true
linkcol: 051c2c
-->

https://artist.bandcamp.com/album/name
<!-- /embed:bandcamp -->
```

Options you leave out get their defaults. The editor's embed dialog shows each option as a field below the content, and saves every option that applies (defaults included), so the block keeps looking the same if a plugin's defaults change. Options that don't apply to the others' values (e.g. the tracklist for a slim player) are hidden in the dialog and left out.

A block whose options aren't the embed's (an unknown name, or a value of the wrong kind) is left out of the website with a warning, like one whose content isn't valid.

## Adding embeds to your site

edaha.md has no embeds of its own. Install the plugins you want, then list their packages under `plugins` in your [config file](/docs/03-configuration/#plugins):

| Plugin                                                                                                             | Key             | Content                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@lvl99dotcom/edaha-plugin-youtube`](https://www.npmjs.com/package/@lvl99dotcom/edaha-plugin-youtube)             | `youtube`       | A YouTube video's URL. Always embedded from youtube-nocookie.com.                                                                                                             |
| [`@lvl99dotcom/edaha-plugin-bandcamp`](https://www.npmjs.com/package/@lvl99dotcom/edaha-plugin-bandcamp)           | `bandcamp`      | A Bandcamp album or track page's URL. The page is read when building, so it needs internet access. Options below.                                                             |
| [`@lvl99dotcom/edaha-plugin-mermaidjs`](https://www.npmjs.com/package/@lvl99dotcom/edaha-plugin-mermaidjs)         | `mermaidjs`     | [Mermaid](https://mermaid.js.org) code. Pages with diagrams load Mermaid from jsDelivr to draw them.                                                                          |
| [`@lvl99dotcom/edaha-plugin-toc`](https://www.npmjs.com/package/@lvl99dotcom/edaha-plugin-toc)                     | `toc`           | Optional Markdown shown above a table of contents of the article's headings. [Options](/docs/plugin-toc/) set each level's list style.                                        |
| [`@lvl99dotcom/edaha-plugin-codehighlight`](https://www.npmjs.com/package/@lvl99dotcom/edaha-plugin-codehighlight) | `codehighlight` | Fenced code blocks, shown with line numbers, a copy button and highlighting (Shiki, from jsDelivr); several become tabs. See [Code highlighter](/docs/plugin-codehighlight/). |

```sh
npm add --save-dev @lvl99dotcom/edaha-plugin-youtube @lvl99dotcom/edaha-plugin-mermaidjs
```

```yaml
# edahaconfig.yml
plugins:
  - "@lvl99dotcom/edaha-plugin-youtube"
  - "@lvl99dotcom/edaha-plugin-mermaidjs"
```

Packages are found from the config file's folder, like an `import` there would be. Their default export is an embed plugin (or a list of them).

### Bandcamp player options

The Bandcamp player's options are those of Bandcamp's own embed codes:

| Option        | Values                                 | Default  | Applies to           |
| ------------- | -------------------------------------- | -------- | -------------------- |
| `layout`      | `slim`, `artwork-only` or `large`      | `large`  | All                  |
| `artwork`     | `none` to hide the artwork             | (shown)  | `slim` and `large`   |
| `size`        | The artwork's size: `small` or `large` | `large`  | `large` with artwork |
| `tracklist`   | `true` to show an album's tracklist    | `false`  | `large`              |
| `transparent` | `true` for a transparent background    | `true`   | All                  |
| `bgcol`       | The background colour, e.g. `ffffff`   | `ffffff` | All                  |
| `linkcol`     | The links' colour, e.g. `0687f5`       | `0687f5` | All                  |

Write colours with or without their `#`. Put colours made only of digits (e.g. `000000`) in quotes, so YAML reads them as text.

## Creating your own

An embed is an **embed plugin**: an object with a key, a name and a `build.render` function that turns a block's content into HTML. The content is the text between its tags, so it can be anything: a URL, an ID, some code.

```js
const VIDEO_URL = /^https:\/\/vimeo\.com\/(\d+)$/;

/** @type {import("@lvl99dotcom/edaha.md").EmbedPlugin} */
export const vimeo = {
  key: "vimeo",
  name: "Vimeo video",
  // Optional; shown in the editor's embed dialog
  description: "A Vimeo video player, from the video's URL.",
  // Optional; shown under the content's label in the embed dialog
  info: "Paste the video's URL, e.g. https://vimeo.com/123",
  // Optional; the web addresses its HTML loads from (see "Previews in the editor")
  sources: { frame: ["https://player.vimeo.com"] },
  // Optional; options that change how a block shows (see "Defining options")
  options: {
    autoplay: {
      title: "Play automatically",
      type: "boolean",
      $edahaField: { checkbox: true, defaultValue: false },
    },
  },
  // Optional; check the content before it is rendered (see "Checking content")
  validate: (content) => {
    if (!VIDEO_URL.test(content))
      throw new Error(`${content} is not a Vimeo video URL`);
    return true;
  },
  build: {
    // The HTML for a block's content; throw if it can't be embedded
    render: async (content, { options }) => {
      const [, id] = VIDEO_URL.exec(content);
      return `<iframe src="https://player.vimeo.com/video/${id}?autoplay=${options.autoplay ? 1 : 0}" title="Vimeo video" allowfullscreen></iframe>`;
    },
  },
};
```

| Property                         | Description                                                                                                                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`                            | Which blocks it renders: `<!-- embed:<key> -->`. Lowercase kebab-case, e.g. `vimeo`. Also its wrapper's class: `embed-<key>`.                                                                                                                                                                                                   |
| `name`                           | Its name, shown in the editor and in warnings, e.g. `Vimeo video`.                                                                                                                                                                                                                                                              |
| `description`                    | Optional; what it embeds, shown in the editor's embed dialog.                                                                                                                                                                                                                                                                   |
| `info`                           | Optional; what to put in the content, shown under the content's label in the embed dialog. Without it, the dialog says "Provide the embed's content, e.g. a URL or code".                                                                                                                                                       |
| `contentOptional`                | Optional; `true` when a block can have no content, e.g. a table of contents. The embed dialog then saves blocks without content. Default: `false`.                                                                                                                                                                              |
| `sources`                        | Optional; the `https://` origins its HTML loads from, by kind: `frame`, `script`, `style`, `font` and `connect` (requests from its scripts). The editor's previews allow them.                                                                                                                                                  |
| `options`                        | Optional; the options blocks can set, as fields like [custom metadata](/docs/03-configuration/#metadata). See below.                                                                                                                                                                                                            |
| `validate(content, options)`     | Optional; checks a block's content (and options) before it is rendered. Return `true` when it is valid; throw an error saying what is wrong (or an `AggregateError` with one error for each problem). See below.                                                                                                                |
| `build.render(content, context)` | Returns a promise of the HTML for a block. `context.options` has the block's options; `context.fetch` fetches other data, e.g. an oEmbed response; `context.state` is shared by the page (see below); `context.headings` lists the headings of the article the block is in (see below). Throw if the content can't be embedded. |
| `build.renderHead(context)`      | Optional; HTML for the `<head>` of each page that has this embed, once, e.g. a stylesheet.                                                                                                                                                                                                                                      |
| `build.renderFoot(context)`      | Optional; HTML for the end of the `<body>` of each page that has this embed, once, e.g. a script.                                                                                                                                                                                                                               |
| `editor`                         | Optional; how it shows in the editor's rich text body (see "Previews in the editor").                                                                                                                                                                                                                                           |

Escape anything from the content or options that you put into the HTML. Blocks are rendered with each page that shows them (an article's page, and list pages showing its excerpt), and each address `fetch` fetches is fetched once per build.

### Defining options

`options` lists the options a block can set, by the name they are saved under. Each is a JSON Schema with `$edahaField`, saying how the editor's embed dialog shows it, exactly like [custom metadata fields](/docs/03-configuration/#metadata), including:

- `defaultValue`: the value used when a block doesn't set one.
- `showWhen` and `hideWhen`: conditions on the other options for when the option applies. An option that doesn't apply is hidden in the dialog and left out of the options `render` gets. See [conditions](/docs/03-configuration/#default-values-and-conditions).

```js
options: {
  layout: {
    title: "Layout",
    type: "string",
    enum: ["slim", "large"],
    $edahaField: { select: true, defaultValue: "large" },
  },
  tracklist: {
    title: "Show tracklist",
    type: "boolean",
    $edahaField: { checkbox: true, defaultValue: false, hideWhen: ["layout", "=", "slim"] },
  },
},
```

`render` and `validate` get a block's options with their defaults filled in and options that don't apply left out, e.g. `{ layout: "large", tracklist: false }`. A block's options are checked against their schemas before `validate`, and one with options that aren't valid is left out of the website, with a warning.

### Checking content

`validate` checks a block's content (its second argument is the block's options) before it is rendered, for the website and in the editor. Return `true` when it is valid. Otherwise, throw an error saying what is wrong, so the author can fix it; for several problems, throw an `AggregateError` with one error for each. Returning `false` gives a general message instead. It can be `async`.

```js
validate: (content) => {
  const problems = [];
  if (!content.startsWith("https://")) problems.push(new Error("Use an https:// URL"));
  if (content.length > 200) problems.push(new Error("The URL is too long"));
  if (problems.length) throw new AggregateError(problems, "The URL isn't valid");
  return true;
},
```

A block whose content isn't valid is left out of the website: the build warns with the problems, and still builds the rest of the article. In the editor, the embed dialog checks the content and options when you add or save an embed, and lists the problems under them instead of saving it; a block that isn't valid (e.g. written by hand) lists them in the article's body.

### Scripts and stylesheets once per page

An embed that needs a script, like a diagram library, adds it with `renderHead` or `renderFoot`. They are called after the page's content is rendered, only on pages that show the embed (an article's page, or a list page showing its excerpt), and only once however many blocks the page has.

`context.state` is an object the embed keeps for one page: every block's `render` on the page, then `renderHead` and `renderFoot`, get the same one, so blocks can leave things there for them, e.g. the IDs of the diagrams to start. Each page starts with an empty one. `renderHead` and `renderFoot` also get `context.options`: a list of each block's options, in page order.

```js
import { escapeHtml } from "@lvl99dotcom/edaha.md/generator/format";

const chart = {
  key: "chart",
  name: "Chart",
  sources: { script: ["https://cdn.example.com"] },
  build: {
    render: async (content, { state }) => {
      state.ids ??= [];
      const id = `chart-${state.ids.length + 1}`;
      state.ids.push(id);
      return `<canvas id="${id}" data-chart="${escapeHtml(content)}"></canvas>`;
    },
    renderFoot: async ({ state }) => `
      <script src="https://cdn.example.com/chart.js"></script>
      <script>${state.ids.map((id) => `drawChart("${id}");`).join("\n")}</script>`,
  },
};
```

Your layout template needs `{% embedHead %}` before `</head>` and `{% embedFoot %}` before `</body>` for these to show; the default theme's `layouts/html.njk` has both. They're only added to HTML pages, not to feeds or JSON files. See [Templating](/docs/05-templating/#embed-tags).

### Adding it to your site

Publish it as a package and list its name under `plugins`, or give the plugin itself in a JavaScript config file:

```js
// edaha.config.mjs
import { vimeo } from "./embeds/vimeo.mjs";

export default {
  name: "My Site",
  description: "News and notes.",
  plugins: ["@lvl99dotcom/edaha-plugin-youtube", vimeo],
};
```

### Using data from elsewhere

`render` gets a `fetch` function to fetch other data. For example, an embed for any page that has an oEmbed endpoint:

```js
const example = {
  key: "example",
  name: "Example media",
  sources: { frame: ["https://media.example.com"] },
  build: {
    render: async (content, { fetch }) => {
      const response = await fetch(
        `https://media.example.com/oembed?url=${encodeURIComponent(content)}`,
      );
      if (!response.ok) throw new Error(`oEmbed answered ${response.status}`);
      const { html } = await response.json();
      return html;
    },
  },
};
```

### The article's headings

`context.headings` lists the headings of the article a block is in, from its body, in order: each has a `level` (1 for `<h1>` to 6 for `<h6>`), its `text` without formatting, and its `id` to link to, e.g. `{ level: 2, text: "Fish & chips", id: "fish-chips" }`. The article's title isn't in its body, and headings inside embed blocks aren't listed. Blocks in an article's excerpt get the whole body's headings. It is empty in the editor's embed frames, which show one block on its own (its preview pages have it).

```js
const outline = {
  key: "outline",
  name: "Outline",
  contentOptional: true,
  build: {
    render: async (content, { headings }) =>
      `<ul>${headings.map(({ text, id }) => `<li><a href="#${escapeHtml(id)}">${escapeHtml(text)}</a></li>`).join("")}</ul>`,
  },
};
```

### Previews in the editor

The editor shows each embed block in its rich text body in a small frame, and the **Preview** tab shows the whole page, with the embeds' scripts and styles. Both are shown from a separate, sandboxed address: they can't reach the editor, and they only load from their own address and the web addresses the site's embeds list in `sources`. An embed that loads from somewhere it doesn't list shows empty there; the website itself isn't affected.

By default, the editor's frame shows the embed as the website does. An embed can show differently there with `editor`, whose functions each take the place of the website's:

```js
const chart = {
  // ...
  editor: {
    // An SVG icon for the editor's lists and blocks
    icon: '<svg viewBox="0 0 24 24"><path d="M3 3h2v18H3z"/></svg>',
    // A lighter look while editing
    render: async (content) => `<pre>${escapeHtml(content)}</pre>`,
    renderHead: async () => "",
    renderFoot: async () => "",
  },
};
```

### From code

If you build with code rather than the `edaha` command, `buildSite` and `startEditor` also take `plugins`: plugins added after the config file's (one with the same key as the config file's is left out).

```ts
import { buildSite } from "@lvl99dotcom/edaha.md";
import youtube from "@lvl99dotcom/edaha-plugin-youtube";

await buildSite({ siteDir: "my-site", plugins: [youtube, vimeo] });
```

## Styling embeds

Embeds are wrapped in `<div class="embed embed-<key>">`, e.g. `embed-youtube` or `embed-vimeo`. Blocks shown as they are written are `<p class="embed-link">` (a URL) or `<pre class="embed-text">`. Style them in your site's `static/site.css`, e.g. to make videos fill the page's width:

```css
.embed iframe {
  width: 100%;
  aspect-ratio: 16 / 9;
  border: 0;
}
```

See [Templating](/docs/05-templating/) for how your static files override the theme's.
