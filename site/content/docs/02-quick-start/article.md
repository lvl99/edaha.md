<!--yaml
status: published
date: 2026-11-15T20:36:00.000+02:00
-->

# Quick start

This builds a small website with one news article, using as little configuration as possible. You need [Node.js](https://nodejs.org/) 22 or later. <!-- readmore -->

## 1. Install edaha.md

Add edaha.md to your project with your favourite package manager:

```sh
npm install --save-dev @lvl99dotcom/edaha.md
yarn add --dev @lvl99dotcom/edaha.md
pnpm add --save-dev @lvl99dotcom/edaha.md
```

## 2. Add a config file

Create `edahaconfig.yml` next to your project's `package.json`. Only the website's name and description are required:

```yaml
name: My blog
description: My cool blog powered by edaha.md
```

The config file can also be JSON or JavaScript, and can have other names. See [Configuration](/docs/03-configuration/) for every setting.

## 3. Write an article

Create `articles/news/hello-world/article.md`:

```md
<!--yaml
date: 2026-11-16T09:00:00Z
tags: [Welcome]
-->

# Hello world

This is my first article. <!-- readmore -->

Everything after the read more break is only shown on the article's own page.
```

- `news` is the article type. Types that aren't in the config file get default settings, with a warning.
- `hello-world` is the article's slug, used in its URL.
- The header at the top holds the article's metadata. Only `date` is required. See [Articles](/docs/04-articles/).

Your project now looks like this:

```
<project>/
  package.json
  edahaconfig.yml
  articles/
    news/
      hello-world/
        article.md
```

## 4. Build the website

```sh
npx edaha build --site-url https://myblog.example.com
yarn edaha build --site-url https://myblog.example.com
pnpx edaha build --site-url https://myblog.example.com
```

The website is written into `build/`:

- `build/news/hello-world/index.html`: the article;
- `build/news/index.html`: the list of news articles;
- `build/news/feed.xml`: the RSS feed;
- `build/news/tags/welcome/`: the list (and feed) of articles tagged "Welcome";
- `build/site.css`: the default theme's stylesheet.

`--site-url` is your website's address, which RSS feeds need for their links. You can set it once in the config file instead, with `siteUrl`.

To look at the website on your computer, serve the folder with any static file server, e.g. `npx serve build`.

## 5. Edit articles in the editor (optional)

```sh
npx edaha editor
```

Open <http://127.0.0.1:5180> to write and edit articles without touching Markdown. See [WYSIWYG editor](/docs/09-wysiwyg-editor/).

## Next steps

- [Configuration](/docs/03-configuration/): article types, URL paths, output folders and more.
- [Templating](/docs/05-templating/): change how your pages look.
- [Build & deploy](/docs/08-build-and-deploy/): put your website online.
