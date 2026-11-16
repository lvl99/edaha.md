<!--yaml
status: published
date: 2026-11-15T20:36:00.000Z+02:00
-->

# Quick start

You can install **edaha.md** into your existing project by adding it via your favourite Node.JS package manager:

```sh
npm i edaha.md --save
yarn add edaha.md --save
pnpm add edaha.md --save
```

## Folder structure

edaha.md then just needs a folder structure and some configuration. Our recommended folder structure is this:

```
<rootDir>/
  config.yml            # edaha.md's configuration file
  content/              # a folder containing content organised by article type
    articles/           # a folder containing an article type's articles
      example-article/  # each article will be in its own subfolder and its name is the article's slug/guid
        article.md      # article content file that will be processed by edaha.md
  static/               # where processed files will be output. It will match same folder structure as content
```

## Configuration

edaha.md requires a `config.yml` YAML configuration file. This provides some data about the website you are building and affects how content is processed and generated.

Using the folder structure above, our minimal configuration file may look like this:

```yml
name: My blog
description: My cool blog powered by edaha.md
path: ""
outputDir: static
siteUrl: https://myblog.example.com
```

## Generate files

Run the script to generate your files:

```sh
edaha build
```

Your HTML and RSS XML files should now be available in `<rootDir>/static`.
