<!--yaml
status: published
date: 2026-11-20T16:00:00.000Z
-->

# YouTube Embed

The [YouTube embed plugin](https://www.npmjs.com/package/@lvl99dotcom/edaha-plugin-youtube) allows you to insert YouTube video players via URL.

<!-- readmore -->

## Demo

<!-- embed:youtube -->https://www.youtube.com/watch?v=aju_UB5VIf8<!-- /embed:youtube -->

## Installation

Add the package to your project:

```sh
npm install --save-dev @lvl99dotcom/edaha-plugin-youtube
yarn add --dev @lvl99dotcom/edaha-plugin-youtube
pnpm add --save-dev @lvl99dotcom/edaha-plugin-youtube
```

Add the plugin's package name to your [configuration file](/docs/03-configuration/#plugins):

```yaml
plugins:
  - "@lvl99dotcom/edaha-plugin-youtube"
```

## How to use

When using the [WYSIWYG or Markdown editor](/docs/09-wysiwyg-editor/), press the **YouTube video** button in the toolbar to add a video, then paste the video's URL. To change a video, select it in the body and press its **Edit** button.

You can also write the video in an article's Markdown yourself:

```md
<!-- embed:youtube -->https://www.youtube.com/watch?v=aju_UB5VIf8<!-- /embed:youtube -->
```

The YouTube player has no options.

### Accepted URLs

Any form of a YouTube video's URL works, from `youtube.com`, `www.youtube.com`, `m.youtube.com`, `youtu.be` or `youtube-nocookie.com`:

| Form            | Example                                              |
| --------------- | ---------------------------------------------------- |
| Watch page      | `https://www.youtube.com/watch?v=aju_UB5VIf8`        |
| Short link      | `https://youtu.be/aju_UB5VIf8`                       |
| Short video     | `https://www.youtube.com/shorts/aju_UB5VIf8`         |
| Live video      | `https://www.youtube.com/live/aju_UB5VIf8`           |
| Embedded player | `https://www.youtube-nocookie.com/embed/aju_UB5VIf8` |

Other parts of the URL, e.g. a start time (`&t=30s`) or a playlist, are left out.

## How it works

Whatever form of URL is given, the video is always embedded from `https://www.youtube-nocookie.com`, YouTube's privacy-enhanced mode: YouTube says it doesn't keep information about a page's visitors unless they play the video.

The player is a 560×315px `<iframe>`, wrapped in `<div class="embed embed-youtube">`. To make videos fill the page's width, style them in your site's `static/site.css`:

```css
.embed-youtube iframe {
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
  border: 0;
}
```

A URL that isn't a YouTube video's gives a warning, and the video is left out of the website; the rest of the article is still built. The editor's embed dialog checks the URL before adding the video. Building doesn't need internet access.

See [Embeds](/docs/07-embeds/) for more about embeds.
