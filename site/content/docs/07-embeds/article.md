<!--yaml
status: published
date: 2026-11-15T20:36:00.000+02:00
-->

# Embeds

Embeds turn a URL in an article into richer content, such as a video or a music player. They are like shortcodes in WordPress, or an HTML `<iframe>` you don't have to write yourself. <!-- readmore -->

## Using embeds

Put a URL between `<!-- embed -->` and `<!-- /embed -->`, on its own line:

```md
Here is the launch video:

<!-- embed -->https://www.youtube.com/watch?v=aju_UB5VIf8<!-- /embed -->
```

When the site is built, the URL is replaced with the embed's HTML. In the [WYSIWYG editor](/docs/09-wysiwyg-editor/), the **Embed** button inserts one and shows a preview.

edaha.md comes with two embeds:

| Embed    | URLs                                                   | Notes                                                                       |
| -------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| YouTube  | `youtube.com/watch?v=…`, `youtu.be/…` and similar      | Always uses youtube-nocookie.com.                                           |
| Bandcamp | Album and track pages, e.g. `artist.bandcamp.com/album/…` | Reads the page when building, so the build needs internet access.        |

A URL that no embed recognises, or that fails to render, gives a warning and is shown as a plain link instead, so the build carries on.

Embed blocks inside code blocks and inline code are left alone, so you can write about them.

## Creating your own

An embed is an **embed renderer**: an object that says which URLs it handles and turns them into HTML. You can render anything from the URL: its host, path and query parameters are all yours to read.

```js
/** @type {import("@lvl99dotcom/edaha.md").EmbedRenderer} */
const vimeo = {
  // Shown in warnings
  name: "Vimeo",
  // Optional; the origins its iframes load from (see "Previews in the editor")
  frameSources: ["https://player.vimeo.com"],
  // Whether it handles a URL
  match: (url) => url.hostname === "vimeo.com" && /^\/\d+$/.test(url.pathname),
  // The HTML for a URL; throw if it can't be embedded
  render: async (url) =>
    `<iframe src="https://player.vimeo.com/video${url.pathname}" title="Vimeo video" allowfullscreen></iframe>`,
};
```

| Property       | Description                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| `name`         | The embed's name, shown in warnings and used in its wrapper's class. Use one word, e.g. `Vimeo`.        |
| `match(url)`   | Whether it handles a URL. Gets a [`URL`](https://developer.mozilla.org/docs/Web/API/URL) object.        |
| `render(url, context)` | Returns a promise of the HTML. `context.fetch` fetches other data, e.g. an oEmbed response. Throw an error if the URL can't be embedded. |
| `frameSources` | Optional; the `https://` origins its iframes load from.                                                  |

Escape anything from the URL that you put into the HTML. Each URL is rendered once per build, however many articles use it.

### Adding it to your site

List your renderers under `embeds` in a JavaScript [config file](/docs/03-configuration/#embeds). They are tried in order, before the built-in ones, by `edaha build` and by the editor:

```js
// edaha.config.mjs
import { vimeo } from "./embeds/vimeo.mjs";

export default {
  name: "My Site",
  description: "News and notes.",
  embeds: [vimeo],
};
```

### Using data from elsewhere

`render` gets a `fetch` function to fetch other data. For example, an embed for any page that has an oEmbed endpoint:

```js
const example = {
  name: "Example",
  frameSources: ["https://media.example.com"],
  match: (url) => url.hostname === "media.example.com",
  render: async (url, { fetch }) => {
    const response = await fetch(
      `https://media.example.com/oembed?url=${encodeURIComponent(url.href)}`,
    );
    if (!response.ok) throw new Error(`oEmbed answered ${response.status}`);
    const { html } = await response.json();
    return html;
  },
};
```

### Previews in the editor

The editor's preview pages only allow frames from the origins that embeds list in `frameSources`, so a custom embed without them shows as an empty frame there. The website itself isn't affected.

### From code

If you build with code rather than the `edaha` command, `buildBlog` and `startEditor` also take `embedRenderers`: the renderers tried after the config file's. They default to the built-in ones, which are exported as `EMBED_RENDERERS`.

```ts
import { buildBlog, EMBED_RENDERERS } from "@lvl99dotcom/edaha.md";

await buildBlog({
  siteDir: "my-site",
  embedRenderers: [...EMBED_RENDERERS, vimeo],
});
```

## Styling embeds

Embeds are wrapped in `<div class="embed embed-<name>">`, where `<name>` is the renderer's name in lowercase, e.g. `embed-youtube` or `embed-vimeo`. Links for URLs that couldn't be embedded are `<p class="embed-link">`. Style them in your site's `static/site.css`, e.g. to make videos fill the page's width:

```css
.embed iframe {
  width: 100%;
  aspect-ratio: 16 / 9;
  border: 0;
}
```

See [Templating](/docs/05-templating/) for how your static files override the theme's.
