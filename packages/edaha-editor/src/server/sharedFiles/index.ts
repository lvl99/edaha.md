import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { FilesUploadTo } from "@lvl99dotcom/edaha.md/generator/config";
import { fileKind } from "../files/index.ts";
import {
  isShared,
  SHARED_FILES_TYPE,
  sharedFilePath,
  type IndexedFile,
} from "../types/index.ts";

export { isShared, SHARED_FILES_TYPE, sharedFilePath };

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
