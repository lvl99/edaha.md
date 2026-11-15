# Changelog

edaha.md follows [semantic versioning](https://semver.org).

## Unreleased

The first release: the blog generator and article editor from LiveCanvas, as a package of their own.

### Added

- `edaha build` and `edaha editor` commands, with `--dir`, `--site-url` and `--port`.
- A neutral default theme (`theme/`). A site's own `templates/` and `static/` override its files one by one.
- `siteUrl` and `reservedPaths` settings in `config.yml`.
- `buildBlog`, `startEditor`, `createEditorServer`, embed renderers and template data types in the public API.

### Changed

- `outputDir` and `publishDir` are relative to the site folder. `outputDir` defaults to `dist` and must be inside the site folder. `publishDir` is optional and must be apart from the site folder.
- Feeds link to `http://localhost` when neither `SITE_URL` nor `siteUrl` is set.
- The editor serves its pre-built page itself, so Vite is not needed to run it.
