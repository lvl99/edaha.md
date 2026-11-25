<!--yaml
status: published
date: 2026-11-25T17:00:00.000Z
author: false
-->

# Release v0.7.1

**edaha.md** v0.7.1 has been released, with everything from v0.7.0: `edaha check` to find template problems before building, links to each page's other outputs and feeds, and a round of editor improvements. v0.7.1 adds building your website into another folder, to look at it before publishing!

## Added

- `edaha check` lists problems in your templates by file and line, without building.
- `edaha check --render` also renders every page, without writing anything, and lists the pages' render problems.
- `buildSite` takes `dryRun`, which renders every page without writing and reports render problems instead of stopping.
- Articles and list pages get `alternates` and lists get `feeds`, and the default theme links to them.
- The default theme styles blockquotes with a border on their left.
- The editor's toolbars have **Main heading** (H1) and **Horizontal rule** buttons.
- Choosing a heading's ID in the editor's WYSIWYG body copies the link to the heading.
- The editor has button, input and corner radius size variables, and button size classes.
- `edaha build --output-dir <folder>` and `buildSite`'s `outputDir` option build the website into another folder, leaving your own build and `publishDir` as they are. (v0.7.1)
- The docs explain [checking templates](https://edaha.md/docs/05-templating/#checking-templates).
- The docs explain [building into another folder](https://edaha.md/docs/08-build-and-deploy/#building-into-another-folder). (v0.7.1)

## Changed

- Templates escape values only when they output HTML or XML, so JSON templates don't need `| safe`.
- A template name loads the template that outputs the same file type, e.g. `@theme/layouts/rssfeed.njk` loads `layouts/rssfeed.xml.njk`.
- Embed tags output nothing in files that aren't HTML, and embeds in JSON files are written as JSON text.
- `paginate` takes the extensions the list's templates output, instead of the feed's file name.
- `TemplateProblem` moved to the templates module.
- Nunjucks templates are left out of Prettier, and `edaha check` checks them instead.
- The editor's file fields have one **Choose or upload file** button that opens the file browser.
- Every editor button has the `btn` class and a `btn-` class for its purpose.
- Everything focused from the keyboard in the editor has the same thick outline.
- The editor's checkboxes are on/off switches, and article fields' labels sit above their fields.
- The editor's welcome prompt has large buttons with icons, and **Show all (n)**.
- The editor's **Show all** is grey with an icon, and its article list's links aren't underlined.
- Turning on **No author** hides the author's fields.
- The editor's dialog buttons are grouped together in a row.
- The editor's fieldsets match the inputs' border colour and corners.

## Fixed

- `./` and `../` template names load again.
- Embeds no longer break JSON files.
- File links no longer break when an article's type or slug changes.
