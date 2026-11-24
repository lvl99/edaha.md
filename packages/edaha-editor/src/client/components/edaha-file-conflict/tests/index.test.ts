// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveResolvingConflicts } from "..";
import type { ConflictChoice, EdahaFileConflict } from "..";
import { ApiError, type EditorApi } from "../../../editorApi";
import type { FileConflict } from "../../../../server/types";
import {
  button,
  find,
  input,
  mount,
  settle,
} from "../../../../shared/tests/helpers";

// jsdom has no dialogs: open and close them by their `open` attribute
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

afterEach(() => document.body.replaceChildren());

const CONFLICT: FileConflict = {
  incoming: {
    name: "photo.png",
    kind: "image",
    size: 1536,
    url: "/news/hello/photo.png",
  },
  existing: {
    type: "@shared",
    slug: "",
    name: "photo.png",
    kind: "image",
    size: 2048,
    updated: "2026-11-24T00:00:00.000Z",
    url: "/files/photo.png",
  },
};

/** A dialog resolving a conflict with an attempt (resolving it, by default) */
const setup = async (
  attempt = vi.fn<
    (choice: ConflictChoice) => Promise<FileConflict | undefined>
  >(async () => undefined),

  conflict: FileConflict = CONFLICT,
) => {
  const element = await mount<EdahaFileConflict>("edaha-file-conflict");
  const resolved = element.resolve(conflict, attempt, {
    action: "move",
    address: (url) => `http://127.0.0.1:5180${url}`,
  });
  await settle(element);
  return { element, attempt, resolved };
};

/** A file's name box */
const nameBox = (element: HTMLElement, side: "incoming" | "existing") =>
  find<HTMLInputElement>(element, `#file-conflict-${side}-name`);

/** The text of an element, with its spaces collapsed */
const text = (element: Element) =>
  element.textContent?.replace(/\s+/g, " ").trim();

describe("edaha-file-conflict", () => {
  it("should show both files, incoming then existing, with their names, types and sizes", async () => {
    const { element } = await setup();
    expect(element.open).toBe(true);
    expect(text(find(element, "#file-conflict-title"))).toBe(
      "Resolve file conflict",
    );
    expect(text(find(element, "#file-conflict-description"))).toBe(
      "You are moving a file to a location where an existing file has the same name. Please select how you wish to resolve this conflict.",
    );
    const files = [...element.querySelectorAll(".file-conflict-file")];
    expect(files.map((file) => text(find(file, "h3")))).toEqual([
      "Incoming",
      "Existing",
    ]);
    expect(
      files.map((file) => text(find(file, ".file-conflict-details"))),
    ).toEqual(["PNG image 1.5 KB", "PNG image 2 KB"]);
    expect(
      files.map((file) => find<HTMLImageElement>(file, "img").src),
    ).toEqual([
      "http://127.0.0.1:5180/news/hello/photo.png",
      "http://127.0.0.1:5180/files/photo.png",
    ]);
    expect(nameBox(element, "incoming").value).toBe("photo.png");
    expect(document.activeElement).toBe(nameBox(element, "incoming"));
    // Overwriting is only offered for the incoming file
    expect(files[1]!.textContent).not.toContain("Overwrite");
  });

  it("should show an upload's own preview, and icons for files that aren't images", async () => {
    const element = await mount<EdahaFileConflict>("edaha-file-conflict");
    void element.resolve(
      {
        incoming: { ...CONFLICT.incoming, url: undefined },
        existing: { ...CONFLICT.existing, name: "notes", kind: "other" },
      },
      async () => undefined,
      { action: "upload", incomingUrl: "blob:photo" },
    );
    await settle(element);
    expect(text(find(element, "#file-conflict-description"))).toContain(
      "You are uploading a file",
    );
    expect(find<HTMLImageElement>(element, "img").src).toBe("blob:photo");
    expect(element.querySelectorAll(".file-conflict-icon")).toHaveLength(1);
    expect(text(element.querySelectorAll(".file-conflict-details")[1]!)).toBe(
      "File 2 KB",
    );
    // An image without a URL to show it from gets its icon
    void element.resolve(CONFLICT, async () => undefined, {
      action: "upload",
    });
    await settle(element);
    expect(element.querySelectorAll("img")).toHaveLength(2);
    void element.resolve(
      { ...CONFLICT, incoming: { ...CONFLICT.incoming, url: undefined } },
      async () => undefined,
      { action: "upload" },
    );
    await settle(element);
    expect(element.querySelectorAll("img")).toHaveLength(1);
  });

  it("should rename either file to the name typed for it", async () => {
    const { element, attempt, resolved } = await setup();
    const rename = (side: string) => button(element, `Rename ${side} file`);
    expect(rename("incoming").disabled).toBe(true);
    input(nameBox(element, "existing"), " ");
    await element.updateComplete;
    expect(rename("existing").disabled).toBe(true);
    input(nameBox(element, "existing"), " old-photo.png ");
    await element.updateComplete;
    rename("existing").click();
    await settle(element);
    expect(attempt).toHaveBeenCalledWith({
      rename: "existing",
      name: "old-photo.png",
    });
    expect(await resolved).toBe(true);
    expect(element.open).toBe(false);
  });

  it("should show the next conflict a choice causes, and its errors", async () => {
    const attempt = vi
      .fn<(choice: ConflictChoice) => Promise<FileConflict | undefined>>()
      .mockResolvedValueOnce({
        ...CONFLICT,
        incoming: { ...CONFLICT.incoming, name: "photo-2.png" },
      })
      .mockRejectedValueOnce(new Error("Disk full"));
    const { element } = await setup(attempt);
    input(nameBox(element, "incoming"), "photo-2.png");
    await element.updateComplete;
    button(element, "Rename incoming file").click();
    await settle(element);
    expect(element.open).toBe(true);
    expect(nameBox(element, "incoming").value).toBe("photo-2.png");
    input(nameBox(element, "incoming"), "photo-3.png");
    await element.updateComplete;
    button(element, "Rename incoming file").click();
    await settle(element);
    expect(text(find(element, "[role=alert]"))).toBe("Disk full");
    expect(element.open).toBe(true);
  });

  it("should overwrite the existing file once confirmed", async () => {
    const { element, attempt, resolved } = await setup();
    const overwrite = button(element, "Overwrite…");
    overwrite.click();
    await settle(element);
    expect(overwrite.getAttribute("aria-expanded")).toBe("true");
    expect(text(find(element, "#file-conflict-question"))).toBe(
      "Are you sure you want to overwrite the file with photo.png (PNG image; 1.5 KB)?",
    );
    expect(document.activeElement).toBe(button(element, "No, cancel"));
    button(element, "No, cancel").click();
    await settle(element);
    expect(element.querySelector("#file-conflict-question")).toBeNull();
    expect(document.activeElement).toBe(overwrite);
    expect(attempt).not.toHaveBeenCalled();

    overwrite.click();
    await settle(element);
    button(element, "Yes, overwrite").click();
    await settle(element);
    expect(attempt).toHaveBeenCalledWith({ overwrite: true });
    expect(await resolved).toBe(true);
  });

  it("should give up on the conflict when cancelled, closed, or another is shown", async () => {
    const { element, attempt, resolved } = await setup();
    button(element, "Cancel").click();
    expect(await resolved).toBe(false);
    expect(element.open).toBe(false);

    const closed = element.resolve(CONFLICT, attempt, { action: "move" });
    await settle(element);
    find<HTMLButtonElement>(element, "button[title=Close]").click();
    expect(await closed).toBe(false);

    const first = element.resolve(CONFLICT, attempt, { action: "move" });
    await settle(element);
    const second = element.resolve(CONFLICT, attempt, { action: "move" });
    expect(await first).toBe(false);
    await settle(element);
    // Nothing is tried once given up on
    element.close();
    expect(await second).toBe(false);
    await element.choose({ overwrite: true });
    expect(attempt).not.toHaveBeenCalled();
    // Before it is rendered, it is closed
    const unrendered = document.createElement(
      "edaha-file-conflict",
    ) as EdahaFileConflict;
    unrendered.close();
    expect(unrendered.open).toBe(false);
  });
});

describe("saveResolvingConflicts", () => {
  /** A conflict error, as the API throws it */
  const clash = (conflict: FileConflict = CONFLICT) =>
    new ApiError(
      "A file called photo.png is already in Shared files",
      [],
      conflict,
    );

  /** A dialog, and an API that renames files */
  const setupSave = async () => {
    const dialog = await mount<EdahaFileConflict>("edaha-file-conflict");
    const api = {
      moveFile: vi.fn(async () => ({
        type: "@shared",
        slug: "",
        name: "old.png",
        articles: [{ type: "news", slug: "hello" }],
      })),
    };
    return { dialog, api, apiAs: api as unknown as EditorApi };
  };

  it("should give the save's result when there is no conflict, and throw other errors", async () => {
    const { dialog, apiAs } = await setupSave();
    const save = vi.fn(async () => "saved");
    expect(
      await saveResolvingConflicts(dialog, apiAs, save, { action: "upload" }),
    ).toBe("saved");
    expect(save).toHaveBeenCalledWith({});
    expect(dialog.open).toBe(false);
    await expect(
      saveResolvingConflicts(
        dialog,
        apiAs,
        async () => {
          throw new ApiError("Disk full");
        },
        { action: "upload" },
      ),
    ).rejects.toThrow("Disk full");
  });

  it("should save under another name, again on another conflict, or overwrite", async () => {
    const { dialog, apiAs } = await setupSave();
    const save = vi
      .fn()
      .mockRejectedValueOnce(clash())
      .mockRejectedValueOnce(
        clash({
          ...CONFLICT,
          incoming: { ...CONFLICT.incoming, name: "b.png" },
        }),
      )
      .mockResolvedValueOnce("overwritten");
    const saved = saveResolvingConflicts(dialog, apiAs, save, {
      action: "move",
    });
    await settle(dialog);
    await dialog.choose({ rename: "incoming", name: "b.png" });
    expect(save).toHaveBeenLastCalledWith({ name: "b.png" });
    expect(dialog.open).toBe(true);
    expect(nameBox(dialog, "incoming").value).toBe("b.png");
    await dialog.choose({ overwrite: true });
    expect(save).toHaveBeenLastCalledWith({ name: "b.png", overwrite: true });
    expect(await saved).toBe("overwritten");
  });

  it("should rename the existing file first, showing a clash doing so as an error", async () => {
    const { dialog, api, apiAs } = await setupSave();
    const renamed = vi.fn();
    const save = vi
      .fn()
      .mockRejectedValueOnce(clash())
      .mockResolvedValueOnce("saved");
    const saved = saveResolvingConflicts(dialog, apiAs, save, {
      action: "upload",
      onExistingRenamed: renamed,
    });
    await settle(dialog);
    api.moveFile.mockRejectedValueOnce(clash());
    await dialog.choose({ rename: "existing", name: "old.png" });
    expect(text(find(dialog, "[role=alert]"))).toBe(
      "A file called photo.png is already in Shared files",
    );
    await dialog.choose({ rename: "existing", name: "old.png" });
    expect(api.moveFile).toHaveBeenLastCalledWith(
      CONFLICT.existing,
      CONFLICT.existing,
      { name: "old.png" },
    );
    expect(renamed).toHaveBeenCalledWith(
      CONFLICT.existing,
      expect.objectContaining({ name: "old.png" }),
    );
    expect(save).toHaveBeenLastCalledWith({ name: undefined });
    expect(await saved).toBe("saved");
  });

  it("should give nothing when the user cancels", async () => {
    const { dialog, apiAs } = await setupSave();
    const saved = saveResolvingConflicts(
      dialog,
      apiAs,
      vi.fn().mockRejectedValueOnce(clash()),
      { action: "upload" },
    );
    await settle(dialog);
    dialog.close();
    expect(await saved).toBeUndefined();
  });
});
