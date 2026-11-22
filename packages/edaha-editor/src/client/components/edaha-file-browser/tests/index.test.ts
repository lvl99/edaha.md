// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FilePage, FileSummary } from "../../../../server/types";
import type { EditorApi } from "../../../editorApi";
import "..";
import { acceptedKind, formatFileSize, type EdahaFileBrowser } from "..";
import {
  button,
  chooseFile,
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

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

/** A file */
const summary = (overrides: Partial<FileSummary> = {}): FileSummary => ({
  type: "news",
  slug: "hello",
  name: "photo.png",
  kind: "image",
  size: 1536,
  updated: "2026-11-01T00:00:00.000Z",
  url: "/news/hello/photo.png",
  ...overrides,
});

/** A page of files */
const page = (
  files: FileSummary[],
  overrides: Partial<FilePage> = {},
): FilePage => ({
  files,
  total: files.length,
  page: 1,
  pages: 1,
  perPage: 50,
  ...overrides,
});

/** A browser with a fake API, opened */
const setup = async () => {
  const api = {
    queryFiles: vi.fn(async () =>
      page([
        summary(),
        summary({
          type: "page",
          slug: "about",
          name: "guide.pdf",
          kind: "document",
          size: 20,
          url: "/page/about/guide.pdf",
        }),
      ]),
    ),
    fileFilters: vi.fn(async () => ({
      kinds: ["document", "image"],
      types: ["news", "page"],
    })),
    fileReferences: vi.fn(async () => [
      { type: "news", slug: "hello" },
      { type: "page", slug: "about" },
    ]),
    replaceFile: vi.fn(async () => ({
      name: "cover.png",
      articles: [{ type: "news", slug: "hello" }],
    })),
    deleteFile: vi.fn(async () => ({ articles: [] })),
    // The page's own server, as by default
    url: (path: string) => path,
  } as unknown as EditorApi &
    Record<
      | "queryFiles"
      | "fileFilters"
      | "fileReferences"
      | "replaceFile"
      | "deleteFile",
      ReturnType<typeof vi.fn>
    >;
  const element = await mount<EdahaFileBrowser>("edaha-file-browser", {
    api,
    types: { news: { labelSingle: "News item", labelPlural: "News" } },
  });
  element.searchDelay = 0;
  element.confirm = vi.fn(() => true);
  await element.show();
  await settle(element);
  return { api, element };
};

/** The status line's text */
const status = (element: EdahaFileBrowser) =>
  find(element, '[role="status"]').textContent?.trim();

describe("formatFileSize", () => {
  it("should show sizes in B, KB, MB or GB, with one decimal below 10", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(20 * 1024 + 300)).toBe("20 KB");
    expect(formatFileSize(3 * 1024 ** 2)).toBe("3 MB");
    expect(formatFileSize(5.25 * 1024 ** 3)).toBe("5.3 GB");
    expect(formatFileSize(4096 * 1024 ** 3)).toBe("4096 GB");
  });
});

describe("acceptedKind", () => {
  it("should be images only when a file input only accepts images", () => {
    expect(acceptedKind("image/png, image/jpeg")).toBe("image");
    expect(acceptedKind("image/*")).toBe("image");
    expect(acceptedKind("image/png, application/pdf")).toBeUndefined();
    expect(acceptedKind("")).toBeUndefined();
    expect(acceptedKind()).toBeUndefined();
  });
});

describe("edaha-file-browser", () => {
  it("should be closed before it renders", () => {
    const element = document.createElement(
      "edaha-file-browser",
    ) as EdahaFileBrowser;
    expect(element.open).toBe(false);
  });

  it("should link files and their articles on the editor's server when it isn't the page's", async () => {
    const { element, api } = await setup();
    element.api = Object.assign(Object.create(api), {
      url: (path: string) => `http://127.0.0.1:5193${path}`,
    });
    await element.updateComplete;
    const links = [...find(element, "tbody tr").querySelectorAll("a")].map(
      (link) => link.getAttribute("href"),
    );
    expect(links[0]).toMatch(/^http:\/\/127\.0\.0\.1:5193\/files\//);
    expect(links[1]).toMatch(/^http:\/\/127\.0\.0\.1:5193\/#/);
  });

  it("should open as a dialog listing files with their name, type, size, location and operations", async () => {
    const { element, api } = await setup();
    expect(element.open).toBe(true);
    expect(document.activeElement?.id).toBe("file-browser-search");
    expect(find(element, "dialog").getAttribute("aria-labelledby")).toBe(
      "file-browser-title",
    );
    expect(api.queryFiles).toHaveBeenCalledWith({
      search: "",
      kind: undefined,
      type: "",
      sort: undefined,
      order: undefined,
      page: 1,
    });
    expect(status(element)).toBe("2 files found");
    expect(
      [...element.querySelectorAll("thead th")].map((th) => [
        th.textContent?.trim(),
        th.hasAttribute("aria-sort"),
      ]),
    ).toEqual([
      ["Name", true],
      ["Type", true],
      ["Size", true],
      ["Location", true],
      // Not sortable
      ["Operations", false],
    ]);
    const row = find(element, "tbody tr");
    const cells = [...row.querySelectorAll("td")];
    expect(cells.slice(0, 4).map((td) => td.textContent?.trim())).toEqual([
      "photo.png",
      "Image",
      "1.5 KB",
      "news/hello",
    ]);
    const [name, location] = [...row.querySelectorAll("a")];
    expect(name!.getAttribute("href")).toBe("/files/news/hello/photo.png");
    expect(name!.target).toBe("_blank");
    expect(location!.getAttribute("href")).toBe("/#news/hello");
    expect(location!.target).toBe("_blank");
    expect(
      [...cells[4]!.querySelectorAll("button")].map((b) => [
        b.textContent?.trim(),
        b.title,
      ]),
    ).toEqual([
      ["Copy URL of photo.png", "Copy URL of photo.png"],
      ["Replace photo.png…", "Replace photo.png…"],
      ["Delete photo.png…", "Delete photo.png…"],
    ]);
    // Showing it again while open keeps it open
    await element.show();
    expect(element.open).toBe(true);
  });

  it("should offer the kinds and article types in use as filters, and search and sort, from the first page", async () => {
    const { element, api } = await setup();
    const options = (id: string) =>
      [...find<HTMLSelectElement>(element, `#${id}`).options].map((o) =>
        o.textContent?.trim(),
      );
    // In the browser's own order of kinds
    expect(options("file-browser-kind")).toEqual([
      "All types",
      "Image",
      "Document",
    ]);
    expect(options("file-browser-type")).toEqual([
      "All article types",
      "News",
      "page",
    ]);
    element.page = 3;
    input(
      find<HTMLSelectElement>(element, "#file-browser-kind"),
      "image",
      "change",
    );
    input(
      find<HTMLSelectElement>(element, "#file-browser-type"),
      "news",
      "change",
    );
    find<HTMLButtonElement>(element, "thead th button").click();
    input(find<HTMLInputElement>(element, "#file-browser-search"), "pho");
    await vi.waitFor(() =>
      expect(api.queryFiles).toHaveBeenLastCalledWith({
        search: "pho",
        kind: "image",
        type: "news",
        sort: "name",
        order: "asc",
        page: 1,
      }),
    );
  });

  it("should copy a file's path on the website, saying so or that it couldn't", async () => {
    const { element } = await setup();
    const writeText = vi.fn().mockResolvedValueOnce(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    button(element, "Copy URL of photo.png").click();
    await settle(element);
    expect(writeText).toHaveBeenCalledWith("/news/hello/photo.png");
    expect(status(element)).toBe("Copied /news/hello/photo.png");

    // Where the Clipboard API isn't allowed, the text is selected and copied
    writeText.mockRejectedValue(new Error("Not allowed"));
    let selected = "";
    const execCommand = vi.fn(() => {
      // The text is in a hidden text box inside the dialog while it is copied
      selected = find<HTMLTextAreaElement>(element, "dialog textarea").value;
      return true;
    });
    Object.defineProperty(document, "execCommand", {
      value: execCommand,
      configurable: true,
    });
    button(element, "Copy URL of guide.pdf").click();
    await settle(element);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(selected).toBe("/page/about/guide.pdf");
    expect(status(element)).toBe("Copied /page/about/guide.pdf");
    expect(element.querySelector("dialog textarea")).toBeNull();

    execCommand.mockReturnValue(false);
    button(element, "Copy URL of photo.png").click();
    await settle(element);
    expect(status(element)).toBe("Couldn't copy /news/hello/photo.png");
    expect(find(element, '[role="status"]').classList.contains("error")).toBe(
      true,
    );
    delete (document as { execCommand?: unknown }).execCommand;
  });

  it("should replace a file with a chosen one after confirming, telling the editor", async () => {
    const { element, api } = await setup();
    const changed = vi.fn();
    element.addEventListener("files-changed", changed);
    const chooser = find<HTMLInputElement>(
      element,
      "#file-browser-replacement",
    );
    const click = vi.spyOn(chooser, "click").mockImplementation(() => {});
    button(element, "Replace photo.png…").click();
    expect(click).toHaveBeenCalled();
    chooseFile(chooser, new File(["x"], "Cover.png"));
    await settle(element);
    expect(element.confirm).toHaveBeenCalledWith(
      "Replace photo.png in news/hello with Cover.png? 2 articles will refer to the new file if its name differs.",
    );
    expect(api.replaceFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: "photo.png" }),
      expect.any(File),
    );
    expect(status(element)).toBe(
      "Replaced photo.png with cover.png, updating 1 article",
    );
    expect(changed.mock.calls[0]![0].detail).toEqual({
      file: expect.objectContaining({ name: "photo.png" }),
      name: "cover.png",
      articles: [{ type: "news", slug: "hello" }],
    });
    // The list and filters are loaded again
    expect(api.fileFilters).toHaveBeenCalledTimes(2);

    // Same name, no references, and choosing no file
    api.fileReferences.mockResolvedValueOnce([]);
    api.replaceFile.mockResolvedValueOnce({ name: "photo.png", articles: [] });
    await element.replace(summary(), new File(["x"], "photo.png"));
    expect(element.confirm).toHaveBeenLastCalledWith(
      "Replace photo.png in news/hello with photo.png?",
    );
    expect(status(element)).toBe("Replaced photo.png");
    api.replaceFile.mockResolvedValueOnce({
      name: "b.png",
      articles: [
        { type: "news", slug: "hello" },
        { type: "page", slug: "about" },
      ],
    });
    await element.replace(summary(), new File(["x"], "b.png"));
    expect(status(element)).toBe(
      "Replaced photo.png with b.png, updating 2 articles",
    );
    api.replaceFile.mockResolvedValueOnce({ name: "c.png", articles: [] });
    await element.replace(summary(), new File(["x"], "c.png"));
    expect(status(element)).toBe("Replaced photo.png with c.png");
    const calls = api.replaceFile.mock.calls.length;
    chooseFile(chooser);
    await settle(element);
    expect(api.replaceFile).toHaveBeenCalledTimes(calls);
  });

  it("should delete a file after confirming, telling the editor", async () => {
    const { element, api } = await setup();
    const changed = vi.fn();
    element.addEventListener("files-changed", changed);
    button(element, "Delete guide.pdf…").click();
    await settle(element);
    expect(element.confirm).toHaveBeenCalledWith(
      "Delete guide.pdf from page/about? It will also be removed from 2 articles.",
    );
    expect(api.deleteFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: "guide.pdf" }),
    );
    expect(status(element)).toBe("Deleted guide.pdf");
    expect(changed).toHaveBeenCalledOnce();

    api.fileReferences.mockResolvedValueOnce([{ type: "news", slug: "hello" }]);
    api.deleteFile.mockResolvedValueOnce({
      articles: [{ type: "news", slug: "hello" }],
    });
    await element.delete(summary());
    expect(element.confirm).toHaveBeenLastCalledWith(
      "Delete photo.png from news/hello? It will also be removed from 1 article.",
    );
    expect(status(element)).toBe("Deleted photo.png, updating 1 article");
    api.fileReferences.mockResolvedValueOnce([]);
    await element.delete(summary());
    expect(element.confirm).toHaveBeenLastCalledWith(
      "Delete photo.png from news/hello?",
    );
  });

  it("should do nothing when not confirmed, and show errors", async () => {
    const { element, api } = await setup();
    element.confirm = vi.fn(() => false);
    await element.replace(summary(), new File(["x"], "b.png"));
    await element.delete(summary());
    expect(api.replaceFile).not.toHaveBeenCalled();
    expect(api.deleteFile).not.toHaveBeenCalled();

    element.confirm = vi.fn(() => true);
    api.deleteFile.mockRejectedValueOnce(new Error("Busy"));
    await element.delete(summary());
    expect(status(element)).toBe("Busy");
    api.fileReferences.mockRejectedValueOnce(new Error("File not found"));
    await element.replace(summary(), new File(["x"], "b.png"));
    expect(status(element)).toBe("File not found");
  });

  it("should page through the files, clearing an operation's message", async () => {
    const { element, api } = await setup();
    api.queryFiles.mockImplementation(
      async ({ page: number }: { page: number }) =>
        page([summary({ name: `p${number}.png` })], {
          total: 120,
          page: number,
          pages: 3,
        }),
    );
    await element.load();
    await element.updateComplete;
    const results = find(element, ".file-browser-results");
    results.scrollTo = vi.fn();
    element.copy = vi.fn().mockResolvedValue(undefined);
    await element.copyUrl(summary());
    expect(button(element, "Previous").disabled).toBe(true);
    button(element, "Next").click();
    await settle(element);
    expect(status(element)).toBe("120 files found");
    expect(find(element, '[aria-label="Pages"] span').textContent).toBe(
      "Page 2 of 3",
    );
    expect(results.scrollTo).toHaveBeenCalledWith(0, 0);
    button(element, "Next").click();
    await settle(element);
    expect(button(element, "Next").disabled).toBe(true);
    button(element, "Previous").click();
    await settle(element);
    expect(element.page).toBe(2);
  });

  it("should say when nothing is found or loading fails, keeping the last filters, and only show the latest results", async () => {
    const { element, api } = await setup();
    api.queryFiles.mockResolvedValueOnce(page([summary()]));
    await element.load();
    expect(status(element)).toBe("1 file found");
    api.queryFiles.mockResolvedValueOnce(page([]));
    await element.load();
    await element.updateComplete;
    expect(find(element, ".article-browser-empty").textContent).toBe(
      "No files found.",
    );
    api.fileFilters.mockRejectedValueOnce(new Error("No filters"));
    api.queryFiles.mockRejectedValueOnce(new Error("Search failed"));
    await element.show();
    await settle(element);
    expect(status(element)).toBe("Search failed");
    expect(element.filters.types).toEqual(["news", "page"]);

    let answerFirst: (result: FilePage) => void = () => {};
    api.queryFiles.mockImplementationOnce(
      () => new Promise((resolve) => (answerFirst = resolve)),
    );
    const first = element.load();
    await element.load();
    answerFirst(page([summary({ name: "stale.png" })]));
    await first;
    expect(element.result?.files[0]?.name).toBe("photo.png");
    let failFirst: (error: Error) => void = () => {};
    api.queryFiles.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (failFirst = reject)),
    );
    const failing = element.load();
    await element.load();
    failFirst(new Error("Stale error"));
    await failing;
    expect(element.error).toBe("");
  });

  it("should ask with the browser's confirm by default, and copy before it renders", async () => {
    const element = document.createElement(
      "edaha-file-browser",
    ) as EdahaFileBrowser;
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    expect(element.confirm("Sure?")).toBe(true);
    expect(confirm).toHaveBeenCalledWith("Sure?");
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("No")) },
      configurable: true,
    });
    Object.defineProperty(document, "execCommand", {
      value: vi.fn(() => true),
      configurable: true,
    });
    await expect(element.copy("/a.png")).resolves.toBeUndefined();
    delete (document as { execCommand?: unknown }).execCommand;
  });

  it("should close from its close button, cancelling a waiting search", async () => {
    const { element, api } = await setup();
    const calls = api.queryFiles.mock.calls.length;
    element.searchDelay = 50;
    input(find<HTMLInputElement>(element, "#file-browser-search"), "x");
    button(element, "Close").click();
    expect(element.open).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(api.queryFiles).toHaveBeenCalledTimes(calls);
    element.close();
    expect(element.open).toBe(false);
  });

  it("should let a file be chosen, first showing files of a kind, and give it", async () => {
    const { element, api } = await setup();
    // Not picking: no Choose buttons
    expect(find(element, "h2").textContent?.trim()).toBe("Files");
    expect(element.querySelectorAll("tbody .btn").length).toBe(0);

    const chosen = element.pick("image");
    await settle(element);
    expect(element.open).toBe(true);
    expect(find(element, "h2").textContent?.trim()).toBe("Choose a file");
    expect(api.queryFiles).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "image" }),
    );
    const choose = find<HTMLButtonElement>(element, "tbody tr .btn");
    expect(choose.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "Choose photo.png",
    );
    // Replacing and deleting are still offered
    expect(button(element, "Delete photo.png…")).toBeDefined();
    choose.click();
    expect(await chosen).toEqual(summary());
    expect(element.open).toBe(false);
    await settle(element);
    expect(find(element, "h2").textContent?.trim()).toBe("Files");
  });

  it("should give no file when closed or opened again without choosing", async () => {
    const { element, api } = await setup();
    const closed = element.pick();
    await settle(element);
    expect(api.queryFiles).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: undefined }),
    );
    button(element, "Close").click();
    expect(await closed).toBeUndefined();

    const replaced = element.pick();
    await settle(element);
    await element.show();
    expect(await replaced).toBeUndefined();
    await settle(element);
    expect(element.querySelectorAll("tbody .btn").length).toBe(0);

    const picked = element.pick();
    const again = element.pick("document");
    expect(await picked).toBeUndefined();
    await settle(element);
    find<HTMLButtonElement>(element, "tbody tr .btn").click();
    expect(await again).toEqual(summary());
  });
});
