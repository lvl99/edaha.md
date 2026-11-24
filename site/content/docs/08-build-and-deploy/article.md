<!--yaml
status: published
date: 2026-11-15T18:36:00.000Z
author: false
-->

# Build & deploy

`edaha build` turns your articles into a folder of plain HTML, RSS and static files. Deploying is uploading that folder to any host that serves static files.

<!-- readmore -->

## Building

Run the build from your project's folder:

```sh
npx edaha build --site-url https://example.com
```

It finds your [config file](/docs/03-configuration/#where-it-is-found), renders every published and unlisted article, list and feed, and copies your static files and the theme's. You get a summary when it's done:

```
Built 12 articles (48 files) into /my-project/build
```

Problems that would make a broken website stop the build with an error naming the file, e.g. an article without a date. Problems the website can live with are warnings, e.g. an embed that couldn't be rendered.

To find mistakes in your templates before building, e.g. in CI, run `npx edaha check`: it lists each problem by file and line, and exits with an error when there are any (see [Checking templates](/docs/05-templating/#checking-templates)).

To add it to your project's scripts, in `package.json`:

```json
{
  "scripts": {
    "build:site": "edaha build"
  }
}
```

### Settings that affect the build

| Setting      | What it does                                                           |
| ------------ | ---------------------------------------------------------------------- |
| `outputDir`  | Where the website is built. Emptied on every build. Default: `build`.  |
| `siteUrl`    | The website's address, for RSS feed links.                             |
| `publishDir` | Another folder the website is copied into, e.g. an app's build folder. |
| `path`       | A URL path every article type's URLs start with.                       |
| `types`      | What is built for each article type.                                   |

The website's address can also come from the `SITE_URL` environment variable or the `--site-url` option, which take the place of `siteUrl`. That's handy when the same site is built for a staging and a live address:

```sh
SITE_URL=https://staging.example.com npx edaha build
```

### Checking it locally

The build folder is a complete website. Serve it with any static file server and open it in your browser:

```sh
npx serve build
```

## Deploying

Upload the contents of the build folder to your host's web root. That's all: there is no server or database to set up.

- **Any web host:** copy the files with your host's file manager, FTP, `rsync` or `scp`.
- **Static hosting services** (GitHub Pages, Netlify, Cloudflare Pages, Vercel and others): set the build command to `npx edaha build` and the folder to publish to your `outputDir`.
- **Next to another app:** set `publishDir` to the app's build folder, so the website is deployed with it. Use `reservedPaths` to keep articles off the app's routes.

edaha.md's URLs start at the website's root (e.g. `/site.css`, `/news/`), so publish the website at the root of its domain or sub-domain.

### Example: GitHub Pages

This GitHub Actions workflow builds the website and publishes it to GitHub Pages on every push to `main`. Save it as `.github/workflows/pages.yml`, and choose "GitHub Actions" as the source in your repository's Pages settings:

```yaml
name: Publish website

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  publish:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npx edaha build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: build
      - id: deploy
        uses: actions/deploy-pages@v4
```

A repository's Pages website is served from `https://<user>.github.io/<repository>/`, which isn't the root of the domain. Use a custom domain for it, or publish from your `<user>.github.io` repository, so that edaha.md's URLs work.
