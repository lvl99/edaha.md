<!--yaml
status: published
date: 2026-11-15T20:36:00.000Z+02:00
-->

# Introduction

**edaha.md** is a static site generater written in TypeScript and converts markdown files HTML and RSS XML.

In fact, you could have it output whatever you like — you control the templates and its outputs.

It was designed to be easy and simple and provide a quick way to leverage existing markdown content in a website context.

It was also designed to be performant and secure. No need to expose a backend — just generate the files you want, upload them to your hosting provider, and that is that.

## How it works

You write markdown files representing your individual articles organised into folders based on article type and article slug/guid:

```
<rootDir>/
  edahaconfig.yml     # Configures your site generation
  content/            # This is where your site content goes
    articles/         # This is an article type
      my-article/     # This is an individual article's slug/guid
        article.md    # This is an individual article's contents
  static/             # Where generated files are put
```
