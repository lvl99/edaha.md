# @lvl99dotcom/edaha-plugin-bandcamp

An [edaha.md](https://github.com/lvl99/edaha.md#readme) embed plugin for Bandcamp album and track players. Bandcamp URLs don't contain the album or track ID, so the page is read when building: the build needs internet access.

```sh
npm add @lvl99dotcom/edaha-plugin-bandcamp --save-dev
yarn add @lvl99dotcom/edaha-plugin-bandcamp -D
pnpm add @lvl99dotcom/edaha-plugin-bandcamp -D
```

```yaml
# edahaconfig.yml
plugins:
  - "@lvl99dotcom/edaha-plugin-bandcamp"
```

```md
<!-- embed:bandcamp -->https://artist.bandcamp.com/album/name<!-- /embed:bandcamp -->
```

See [Embeds](/docs/07-embeds/) in the docs.

Licensed under the [Apache License 2.0](LICENSE).
