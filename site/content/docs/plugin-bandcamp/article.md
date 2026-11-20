<!--yaml
status: draft
date: 2026-11-20T12:00:42.848Z
-->

# Bandcamp Embed

The [Bandcamp embed plugin](https://www.npmjs.com/package/@lvl99dotcom/edaha-plugin-bandcamp) allows you to insert Bandcamp players via URL.

<!-- readmore -->

## Demo

<!-- embed:bandcamp -->
<!--yaml
layout: large
size: large
tracklist: false
transparent: true
bgcol: ffffff
linkcol: 0687f5
-->

https://672354.bandcamp.com/album/void-ep-1
<!-- /embed:bandcamp -->

## Installation

Add the package to your project:

```sh
npm install --save-dev @lvl99dotcom/edaha-plugin-bandcamp
yarn add --dev @lvl99dotcom/edaha-plugin-bandcamp
pnpm add --save-dev @lvl99dotcom/edaha-plugin-bandcamp
```

Add the plugin's package name to your [configuration file](/docs/03-configuration/#plugins):

```yaml
plugins:
  - "@lvl99dotcom/edaha-plugin-bandcamp"
```

## How to use

When using the [WYSIWYG or Markdown editor](/docs/09-wysiwyg-editor/), press the **Bandcamp player** button in the toolbar to add a player.

You will then be prompted for the URL of an album's or track's page on Bandcamp, e.g. `https://artist.bandcamp.com/album/name`, and the options below. Options that don't apply to the layout you choose are hidden. To change a player, select it in the body and press its **Edit** button.

You can also write the player in an article's Markdown yourself, with its options (all optional) in YAML before the URL:

```md
<!-- embed:bandcamp -->
<!--yaml
layout: slim
linkcol: 051c2c
-->

https://artist.bandcamp.com/album/name
<!-- /embed:bandcamp -->
```

### Options

| Option        | Type    | Description                                     | Accepted values                   | Default  | Applies to           |
| ------------- | ------- | ----------------------------------------------- | --------------------------------- | -------- | -------------------- |
| `layout`      | String  | The layout style of the Bandcamp player         | `slim`, `artwork-only` or `large` | `large`  | All                  |
| `artwork`     | String  | Hides the artwork (**Hide artwork** in editor)  | `none`                            | (shown)  | `slim` and `large`   |
| `size`        | String  | The artwork's size                              | `small` or `large`                | `large`  | `large` with artwork |
| `tracklist`   | Boolean | Shows an album's tracklist (tracks have none)   | `true` or `false`                 | `false`  | `large`              |
| `transparent` | Boolean | Makes the player's background transparent       | `true` or `false`                 | `true`   | All                  |
| `bgcol`       | String  | The player's background colour                  | A hex colour, e.g. `ffffff`       | `ffffff` | All                  |
| `linkcol`     | String  | The colour of the player's links and highlights | A hex colour, e.g. `0687f5`       | `0687f5` | All                  |

Write colours with or without their `#`. Put colours made only of digits (e.g. `"000000"`) in quotes, so YAML reads them as text.

The editor saves every option that applies, defaults included, so a player keeps looking the same if the plugin's defaults change.

### Layouts

The player is sized like Bandcamp's own embed codes:

| Layout                       | Width                            | Height                                       |
| ---------------------------- | -------------------------------- | -------------------------------------------- |
| `slim`                       | The page's width                 | 42px                                         |
| `artwork-only`               | 350px                            | 350px                                        |
| `large`, large artwork       | 350px                            | 470px for albums, 442px for tracks           |
| `large`, small or no artwork | The page's width                 | 120px                                        |
| `large`, with the tracklist  | 350px (400px with small artwork) | Grows by 33px for each of the album's tracks |

To make players fill the page's width, style them in your site's `static/site.css`:

```css
.embed-bandcamp iframe {
  width: 100%;
  border: 0;
}
```

## How it works

Bandcamp's page URLs don't contain the album's or track's ID, which the player needs. So when the site is built, the plugin reads the page to find the ID (and the number of tracks, for the tracklist's height): **the build needs internet access**. Each page is read once per build, however many times it is embedded.

A URL that isn't a Bandcamp album or track page, or a page with no player, gives a warning, and the player is left out of the website; the rest of the article is still built. The editor's embed dialog checks the URL before adding the player.

The player is an `<iframe>` from `https://bandcamp.com`, wrapped in `<div class="embed embed-bandcamp">`. See [Embeds](/docs/07-embeds/) for more about embeds.
