<!--yaml
status: published
date: 2026-11-20T18:52:00.000Z
author: false
-->

# Release v0.2.0

**edaha.md** v0.2.0 has been published! Lots of new updates:

## Added

- The article editor is now its own package, [@lvl99dotcom/edaha-editor](https://www.npmjs.org/package/@lvl99dotcom/edaha-editor), which `edaha editor` loads when it's installed.
- Embeds are plugins, with packages for [YouTube](https://www.npmjs.org/package/@lvl99dotcom/edaha-plugin-youtube), [Bandcamp](https://www.npmjs.org/package/@lvl99dotcom/edaha-plugin-bandcamp) and [MermaidJS](https://www.npmjs.org/package/@lvl99dotcom/edaha-plugin-mermaidjs) listed under the config file's plugins setting.
- Embed plugins can add HTML once per page through the `{% embedHead %}` and `{% embedFoot %}` template tags.
- Embed plugins can check a block's content, and blocks that aren't valid are left out of the page with a warning.
- Embeds can have options, saved as YAML in the block, such as the Bandcamp player's layout, artwork, tracklist and colours.
- The config file can define custom metadata fields, with groups, default values and show/hide conditions, and templates get them as `article.meta`.
- Raw blocks and raw text are shown exactly as written.
- Config files can be YAML, JSON or JavaScript, found in the site folder or named with `--config`.
- The new `articlesDir`, `templatesDir` and `staticDir` settings choose where articles, templates and static files live.
- The `@theme/` template prefix always loads the default theme's template.
- Templates get new type, isArticle and isList variables.
- The site and each article type can have a default author, and author: false means no author.
- Sites can live in a sub-folder of their domain, with every URL starting with `siteUrl`'s path.
- The editor has a welcome prompt, recent articles and search in the nav, and an article browser.
- The editor has a file browser for every article's files.
- Existing files can be chosen wherever files are uploaded in the editor.
- The editor's article form shows custom settings in groups, with their defaults and conditions.
- The editor has a button for each embed, opening a dialog that checks the content and options.
- The editor shows embeds in sandboxed frames.
- The editor has a floating toolbar above selected text, with bold, italic, underline, strikethrough, link and headings 1–3.
- The editor has a Markdown toolbar, a Preview width control, focus mode, light and dark themes, and a layout for narrow screens.
- edaha.md has its own [docs](https://edaha.md) website, including an article for each plugin.

## Changed

- `buildBlog` is now `buildSite`, `BlogConfig` is now `EdahaConfig`, and templates' blog data is now part of site.
- The embeds setting and built-in renderers are replaced by the plugins setting and plugin packages.
- `outputDir` now defaults to `build`.
- The editor's elements are now named `edaha-` instead of `blog-`.
- Editor body headings can now be H1.
- Underlined text is now saved as `<u>`, and struck-through text as `~~`.
- Metadata problems are now described in plain words.

## Fixed

- Embeds whose HTML has blank lines are no longer cut off by Markdown.
- Embedded players such as Bandcamp's now work in the editor.
- `readmore` and embed blocks inside code are no longer acted on.
- The default theme's pages have their own titles again.
- `edaha editor` in the workspace no longer serves the editor page's unbuilt source.
