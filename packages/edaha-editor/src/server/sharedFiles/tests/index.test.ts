import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isSafeSharedPath,
  isShared,
  listSharedFiles,
  SHARED_FILES_TYPE,
  sharedFilePath,
  uploadFolder,
} from "..";

describe("shared files", () => {
  it("should tell shared files from articles' files", () => {
    expect(isShared({ type: SHARED_FILES_TYPE })).toBe(true);
    expect(isShared({ type: "news" })).toBe(false);
  });

  it("should only accept paths of folders and a name, without hidden or parent parts", () => {
    expect(isSafeSharedPath("2026/11/photo.png")).toBe(true);
    expect(isSafeSharedPath("logo.png")).toBe(true);
    for (const path of ["", "../x.png", "a//b.png", ".hidden", "a/./b.png"])
      expect(isSafeSharedPath(path), path).toBe(false);
  });

  it("should give a shared file's path in its folder", () => {
    expect(sharedFilePath({ slug: "2026/11", name: "a.png" })).toBe(
      "2026/11/a.png",
    );
    expect(sharedFilePath({ slug: "", name: "a.png" })).toBe("a.png");
  });

  it("should list the folder's files with their sub-folders, leaving out hidden ones, or none without the folder", async () => {
    const dir = await mkdtemp(join(tmpdir(), "edaha-shared-"));
    await mkdir(join(dir, "2026/11"), { recursive: true });
    await mkdir(join(dir, ".cache"));
    await writeFile(join(dir, "logo.png"), "png");
    await writeFile(join(dir, "2026/11/guide.pdf"), "pdf!");
    await writeFile(join(dir, ".DS_Store"), "");
    await writeFile(join(dir, ".cache/x.png"), "");
    const files = await listSharedFiles(dir);
    expect(
      files.map(({ type, slug, name, kind, size }) => [
        type,
        slug,
        name,
        kind,
        size,
      ]),
    ).toEqual([
      [SHARED_FILES_TYPE, "2026/11", "guide.pdf", "document", 4],
      [SHARED_FILES_TYPE, "", "logo.png", "image", 3],
    ]);
    expect(files[0]!.updated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await listSharedFiles(join(dir, "missing"))).toEqual([]);
  });

  it("should put uploads at the folder's top, or in the year and month's folder", () => {
    const date = new Date(2026, 0, 5);
    expect(uploadFolder("files", date)).toBe("");
    expect(uploadFolder("files-by-date", date)).toBe("2026/01");
  });
});
