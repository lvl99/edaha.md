<!--yaml
status: published
date: 2026-11-24T17:00:00.000Z
author: false
-->

# Release v0.6.0

**edaha.md** v0.6.0 has been released, with a shared files folder that any article can use, and an editor that moves files and resolves name clashes!

## Added

- The shared files folder (`files/`) holds files any article can use by their path, e.g. `/files/2026/11/photo.jpg`.
- The `files` setting can host shared files at another address, and copies them into their own folder to upload there.
- `files.uploadTo` puts the editor's uploads in the article's folder, the shared files folder, or its year and month folder.
- Templates get the shared files' address as `site.files.url` and `site.files.path`.
- Attachments can have a `description`.
- The editor's file browser shows shared files, uploads files, and moves files between articles and the shared files folder.
- The editor's **Resolve file conflict** dialog lets you rename, overwrite or cancel when a file's name is taken.
- The editor's file browser shows thumbnails, and images are shown on a checkerboard.
- The editor's preview has an **Output** select for templates that output other files, e.g. JSON.
- The docs explain [shared files](https://edaha.md/docs/04-articles/#shared-files) and [where uploads go](https://edaha.md/docs/09-wysiwyg-editor/#where-uploads-go).

## Changed

- The editor's preview uses the article's own template.
