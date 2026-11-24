import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { FilesUploadTo } from "@lvl99dotcom/edaha.md/generator/config";
import { fileKind } from "../files/index.ts";
import type { IndexedFile } from "../types/index.ts";

/**
 * The `type` the editor gives files in the shared files folder (their `slug` is their sub-folder, "" at its top). It
 * isn't a valid article type, so it can't be mistaken for one.
 */
export const SHARED_FILES_TYPE = "@shared";

/** Whether a file is in the shared files folder (rather than an article's) */
export const isShared = (file: { type: string }): boolean =>
  file.type === SHARED_FILES_TYPE;

/**
 * Whether a path in the shared files folder is safe: folders and a name, with no empty, hidden or parent ("..") parts.
 *
 * @example
 * isSafeSharedPath("2026/11/photo.png"); // true
 * isSafeSharedPath("../secret"); // false
 */
export const isSafeSharedPath = (path: string): boolean =>
  path.split("/").every((part) => part !== "" && !part.startsWith("."));

/**
 * A shared file's path in its folder: its sub-folder (if any) and name.
 *
 * @example
 * sharedFilePath({ slug: "2026/11", name: "photo.png" }); // "2026/11/photo.png"
 * sharedFilePath({ slug: "", name: "logo.png" }); // "logo.png"
 */
export const sharedFilePath = ({
  slug,
  name,
}: {
  slug: string;
  name: string;
}): string => (slug ? `${slug}/${name}` : name);

/**
 * List the files in the shared files folder, with their sub-folders as their `slug`, leaving out hidden files and
 * folders. Gives none if the folder doesn't exist.
 *
 * @example
 * await listSharedFiles("/site/files");
 * // [{ type: "@shared", slug: "2026/11", name: "photo.png", kind: "image", size: 1024, updated: "2026-11-24T…" }]
 */
export const listSharedFiles = async (dir: string): Promise<IndexedFile[]> => {
  let entries;
  try {
    entries = await readdir(dir, { recursive: true, withFileTypes: true });
  } catch {
    return [];
  }
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => ({
        entry,
        slug: relative(dir, entry.parentPath).split(sep).join("/"),
      }))
      .filter(({ entry, slug }) =>
        isSafeSharedPath(sharedFilePath({ slug, name: entry.name })),
      )
      .map(async ({ entry, slug }) => {
        const info = await stat(join(entry.parentPath, entry.name));
        return {
          type: SHARED_FILES_TYPE,
          slug,
          name: entry.name,
          kind: fileKind(entry.name),
          size: info.size,
          updated: info.mtime.toISOString(),
        };
      }),
  );
  return files.sort((a, b) =>
    sharedFilePath(a).localeCompare(sharedFilePath(b)),
  );
};

/**
 * The sub-folder of the shared files folder that new uploads go to: its top, or the year and month of the upload with
 * `files-by-date` (e.g. "2026/11").
 *
 * @example
 * uploadFolder("files-by-date", new Date("2026-11-24")); // "2026/11"
 * uploadFolder("files", new Date()); // ""
 */
export const uploadFolder = (
  uploadTo: Exclude<FilesUploadTo, "article">,
  date: Date,
): string =>
  uploadTo === "files-by-date"
    ? `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}`
    : "";
