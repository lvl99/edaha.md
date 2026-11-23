# @lvl99dotcom/edaha-theme-default

[edaha.md](https://github.com/lvl99/edaha.md#readme)'s default theme: neutral Nunjucks templates and a stylesheet. `@lvl99dotcom/edaha.md` installs and uses it, so you don't need to add it yourself.

A theme is a folder with:

- `templates/`: the Nunjucks templates (`layouts/`, `article/` and `page/`).
- `static/`: files copied as they are into the built site (`base.css`).
- `edahatheme.yml`: its name ("edaha.md") and description, for tools that list themes.

A site's own `templates/` and `static/` folders override the theme's files one by one: copy a file to the same path in your site and edit it. See [Templating](https://edaha.md/docs/05-templating/).

To make your own theme, copy this package's `templates/` and `static/` folders into a new folder, give it an `edahatheme.yml` (its name, description, version and authors), and name the folder in your config file's `theme` setting. See [Using another theme](https://edaha.md/docs/05-templating/#using-another-theme).

Licensed under the [Apache License 2.0](LICENSE).
