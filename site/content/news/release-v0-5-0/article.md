<!--yaml
status: published
date: 2026-11-23T21:47:00.000Z
author: false
-->

# Release v0.5.0

**edaha.md** v0.5.0 has been released, with templates that can output any type of file, and an editor that fits better in other apps' pages!

## Added

- Templates can output any type of file, named by an extension before `.njk`: e.g. `single.json.njk` gives each article an `index.json`.
- `Templates.outputs` and `Templates.feedOutputs` list a template's files with the type of file each outputs.
- The docs explain [output file types](https://edaha.md/docs/05-templating/#output-file-types).

## Changed

- The default theme's feed template is now `layouts/rssfeed.xml.njk`.
- Your own template replaces the theme's that outputs the same type of file, and two templates in one folder can't output the same type.
- The required templates can have any output extension.
- In the editor's file browser, a file's **Location** opens its article in place, instead of a new tab.

## Fixed

- The editor's article list, settings panel, dialogs and messages stay within it when an app shows it in part of a page.
