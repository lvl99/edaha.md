<!--yaml
status: draft
date: 2026-11-20T12:00:42.848Z
-->

# Bandcamp Embed

The Bandcamp embed plugin allows you to insert Bandcamp players via URL.

<!-- readmore -->

## Installation

Add package to your project:

```
npm install @lvl99dotcom/edaha-plugin-bandcamp --save
yarn add @lvl99dotcom/edaha-plugin-bandcamp
pnpm add @lvl99dotcom/edaha-plugin-bandcamp
```

Add plugin package name to your configuration file:

```yaml
plugins:
  - "@lvl99dotcom/edaha-plugin-bandcamp"
```

## How to use

When using the WYSIWYG or Markdown editor you can press the "Bandcamp player" button in the toolbar to add.

You will then be prompted to insert a Bandcamp URL, as well as additional options you can configure:

| Option | Type | Description | Accepted Values | Default |
| --- | --- | --- | --- | --- |
| `layout` | String | The layout style of the Bandcamp Player | slim artwork-only large | large |
|  |  |  |  |  |
