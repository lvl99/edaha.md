// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  EditorArticle,
  EditorArticleData,
} from "../../../../server/types";
import type { EditorApi } from "../../../editorApi";
import { ApiError } from "../../../editorApi";
import type { EdahaMetadataField } from "../../edaha-metadata-field";
import { metadataLayout } from "@lvl99dotcom/edaha.md/generator/metadataGroups";
import {
  METADATA_ERRORS,
  applyFieldChange,
  changedFields,
  cleanArticleData,
  nextTabIndex,
  RESET_QUESTION,
  newArticleData,
  type EdahaArticle,
} from "..";
import "..";
import type { EdahaArticleDataField } from "../../edaha-article-data-field";
import type { EdahaArticleDataGroup } from "../../edaha-article-data-group";
import type { EdahaMarkdown } from "../../edaha-markdown";
import type { EdahaRichtext } from "../../edaha-richtext";
import type { EdahaEmbedDialog } from "../../edaha-embed-dialog";
import type { ToastMessage } from "../../edaha-toasts";
import {
  button,
  find,
  input,
  mount,
  settle,
} from "../../../../shared/tests/helpers";

afterEach(() => document.body.replaceChildren());

const DATE = "2026-10-19T09:54:00.000Z";

const ARTICLE: EditorArticle = {
  type: "article",
  slug: "hello",
  status: "published",
  date: DATE,
  title: "Hello",
  author: { name: "Matt" },
  excerpt: undefined,
  thumbnail: "thumb.png",
  tags: ["News"],
  attachments: [{ url: "guide.pdf", name: "Guide" }],
  bodyHtml: "<p>Body</p>",
  files: ["guide.pdf", "thumb.png"],
};

/** A fake editor API */
const fakeApi = () =>
  ({
    create: vi.fn(async (data: EditorArticleData) => ({
      type: data.type,
      slug: data.slug,
    })),
    save: vi.fn(async (_from: unknown, data: EditorArticleData) => ({
      type: data.type,
      slug: data.slug,
    })),
    remove: vi.fn(async () => undefined),
    templates: vi.fn(async (type: string) =>
      type === "page" ? ["home", "single"] : ["single"],
    ),
    upload: vi.fn(async (_location: unknown, file: File) => ({
      name: file.name.toLowerCase(),
      url: `/files/article/hello/${file.name.toLowerCase()}`,
    })),
    toMarkdown: vi.fn(async (html: string) =>
      html.replace(/<\/?p>/g, "").trim(),
    ),
    toHtml: vi.fn(async (markdown: string) => `<p>${markdown}</p>`),
    preview: vi.fn(
      async (data: EditorArticleData) => `/preview/${data.title}/`,
    ),
    embeds: vi.fn(async () => [{ key: "youtube", name: "YouTube video" }]),
    embedFrame: vi.fn(async () => ({
      url: "/embed-frame/x/",
      errors: [],
      warnings: [],
    })),
    validateEmbed: vi.fn(async () => ["Bad"]),
  }) as unknown as EditorApi &
    Record<
      | "create"
      | "save"
      | "remove"
      | "upload"
      | "templates"
      | "toMarkdown"
      | "toHtml"
      | "preview"
      | "embeds"
      | "embedFrame"
      | "validateEmbed",
      ReturnType<typeof vi.fn>
    >;

/** Toasts fired by the form */
let toasts: ToastMessage[] = [];
document.addEventListener("edaha-toast", (event) =>
  toasts.push((event as CustomEvent<ToastMessage>).detail),
);

/** Mount the article form */
const setup = async (...args: [article?: EditorArticle]) => {
  toasts = [];
  const article = args.length ? args[0] : ARTICLE;
  const api = fakeApi();
  const element = await mount<EdahaArticle>("edaha-article", {
    api,
    article,
    typeOptions: [
      { value: "article", label: "Article" },
      { value: "news", label: "News" },
    ],
  });
  return { api, element };
};

/** A data field by name */
const field = (element: HTMLElement, name: string) =>
  find<EdahaArticleDataField>(
    element,
    `edaha-article-data-field[name="${name}"]`,
  );

describe("applyFieldChange", () => {
  const data = newArticleData(new Date(DATE));

  it("should start new articles as drafts dated now", () => {
    expect(data).toMatchObject({
      type: "article",
      status: "draft",
      date: DATE,
      title: "",
      tags: [],
    });
    expect(newArticleData().date).not.toBe("");
  });

  it("should set simple fields", () => {
    expect(applyFieldChange(data, "title", "Hi").title).toBe("Hi");
    expect(applyFieldChange(data, "status", "unlisted").status).toBe(
      "unlisted",
    );
    expect(applyFieldChange(data, "body", "<p>x</p>").bodyHtml).toBe(
      "<p>x</p>",
    );
    expect(applyFieldChange(data, "excerpt", "").excerpt).toBeUndefined();
    expect(applyFieldChange(data, "thumbnail", "t.png").thumbnail).toBe(
      "t.png",
    );
    expect(applyFieldChange(data, "unknown", "x")).toBe(data);
  });

  it("should convert dates and ignore invalid ones", () => {
    expect(applyFieldChange(data, "date", "2026-10-19T11:54").date).toBe(
      new Date(2026, 9, 19, 11, 54).toISOString(),
    );
    expect(applyFieldChange(data, "date", "").date).toBe(DATE);
  });

  it("should set author fields, and drop an empty author", () => {
    const withEmail = applyFieldChange(data, "author[email]", "a@b.c");
    expect(withEmail.author).toEqual({ name: "", email: "a@b.c" });
    const named = applyFieldChange(withEmail, "author[name]", "Ana");
    expect(named.author).toEqual({ name: "Ana", email: "a@b.c" });
    expect(
      applyFieldChange(
        applyFieldChange(named, "author[email]", ""),
        "author[name]",
        "",
      ).author,
    ).toBeUndefined();
    expect(applyFieldChange(data, "author[url]", "https://a.b").author).toEqual(
      { name: "", url: "https://a.b" },
    );
    expect(applyFieldChange(named, "author[name]", "").author).toEqual({
      name: "",
      email: "a@b.c",
    });
  });

  it("should set tags and attachment fields by index", () => {
    expect(
      applyFieldChange({ ...data, tags: ["a", "b"] }, "tags[1]", "c").tags,
    ).toEqual(["a", "c"]);
    const withFile = applyFieldChange(data, "attachments[0][url]", "a.pdf");
    expect(withFile.attachments).toEqual([{ url: "a.pdf" }]);
    expect(
      applyFieldChange(withFile, "attachments[0][name]", "A").attachments,
    ).toEqual([{ url: "a.pdf", name: "A" }]);
    expect(
      applyFieldChange(withFile, "attachments[0][name]", "").attachments,
    ).toEqual([{ url: "a.pdf", name: undefined }]);
    expect(
      applyFieldChange(data, "attachments[0][name]", "A").attachments,
    ).toEqual([{ url: "", name: "A" }]);
  });
});

describe("cleanArticleData", () => {
  it("should fill in the slug, trim and drop empty tags and attachments", () => {
    expect(
      cleanArticleData({
        ...newArticleData(new Date(DATE)),
        title: " Hello World! ",
        tags: [" News ", ""],
        attachments: [{ url: " " }, { url: "a.pdf" }],
      }),
    ).toMatchObject({
      slug: "hello-world",
      title: "Hello World!",
      tags: ["News"],
      attachments: [{ url: "a.pdf" }],
    });
    expect(
      cleanArticleData({ ...newArticleData(), title: "A", slug: "custom" })
        .slug,
    ).toBe("custom");
  });
});

describe("edaha-article", () => {
  it("should show a loaded article's fields", async () => {
    const { element } = await setup();
    expect(field(element, "title").value).toBe("Hello");
    expect(find<EdahaRichtext>(element, "edaha-richtext").value).toBe(
      "<p>Body</p>",
    );
    expect(field(element, "type").options).toEqual([
      { value: "article", label: "Article" },
      { value: "news", label: "News" },
    ]);
    expect(field(element, "status").value).toBe("published");
    expect(field(element, "slug").value).toBe("hello");
    expect(field(element, "slug").placeholder).toBe("hello");
    expect(field(element, "author[name]").value).toBe("Matt");
    expect(field(element, "thumbnail").previewUrl).toBe(
      "/files/article/hello/thumb.png",
    );
    expect(field(element, "tags[0]").value).toBe("News");
    expect(field(element, "attachments[0][name]").value).toBe("Guide");
    expect(
      [...element.querySelectorAll(".files li a")].map((a) =>
        a.getAttribute("href"),
      ),
    ).toEqual([
      "/files/article/hello/guide.pdf",
      "/files/article/hello/thumb.png",
    ]);
    expect(element.querySelector(".hint")).toBeNull();
    expect(element.querySelector(".unsaved-notice")).toBeNull();
    expect(button(element, "Delete…")).toBeDefined();
  });

  it("should start a new article empty, with uploads disabled until saved", async () => {
    const { element } = await setup(undefined);
    expect(field(element, "title").value).toBe("");
    expect(field(element, "status").value).toBe("draft");
    expect(field(element, "slug").placeholder).toBe("title-converted-to-slug");
    expect(field(element, "thumbnail").disabled).toBe(true);
    expect(
      find<EdahaRichtext>(element, "edaha-richtext").uploadImage,
    ).toBeUndefined();
    expect(find(element, ".hint").textContent).toContain(
      "Save the article before uploading files",
    );
    // Below the title, before the body
    const notice = find(element, "main .unsaved-notice");
    expect(notice.previousElementSibling).toBe(
      field(element, "title").parentElement,
    );
    expect(notice.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "⚠️ Uploading images and attachments will require a title and slug to be defined first",
    );
    expect(element.querySelector(".files")).toBeNull();
    // No tag inputs until "Add" is pressed
    expect(element.querySelector('[name^="tags["]')).toBeNull();
    expect(element.querySelector("button.delete")).toBeNull();
  });

  it("should edit fields and create a new article", async () => {
    const { element, api } = await setup(undefined);
    const saved = vi.fn();
    element.addEventListener("article-saved", (e) =>
      saved((e as CustomEvent).detail),
    );
    input(
      find<HTMLInputElement>(field(element, "title"), "input"),
      "My Article",
    );
    await element.updateComplete;
    expect(field(element, "slug").placeholder).toBe("my-article");
    button(element, "Save").click();
    await settle(element);
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "My Article", slug: "my-article" }),
    );
    expect(saved).toHaveBeenCalledWith({ type: "article", slug: "my-article" });
    expect(toasts).toEqual([{ kind: "success", message: "Saved" }]);
    // Now saved, uploads are possible
    expect(field(element, "thumbnail").disabled).toBe(false);
    expect(element.querySelector(".unsaved-notice")).toBeNull();
  });

  it("should save an existing article to its location and show errors", async () => {
    const { element, api } = await setup();
    find<HTMLFormElement>(element, "form").requestSubmit();
    await settle(element);
    expect(api.save).toHaveBeenCalledWith(
      { type: "article", slug: "hello" },
      expect.objectContaining({ title: "Hello" }),
    );

    api.save.mockRejectedValueOnce(
      new Error("Article article/x already exists"),
    );
    await element.save();
    await element.updateComplete;
    expect(toasts.at(-1)).toEqual({
      kind: "error",
      message: "Article article/x already exists",
    });
    expect(element.message).toBe("");
  });

  it("should upload a thumbnail and set the field to its name", async () => {
    const { element, api } = await setup();
    field(element, "thumbnail").dispatchEvent(
      new CustomEvent("field-file", {
        detail: new File(["x"], "New.png"),
        bubbles: true,
      }),
    );
    await settle(element);
    expect(api.upload).toHaveBeenCalledWith(
      { type: "article", slug: "hello" },
      expect.any(File),
    );
    expect(element.data.thumbnail).toBe("new.png");
    expect(element.files).toEqual(["guide.pdf", "new.png", "thumb.png"]);

    // Uploading the same name again doesn't list it twice; a failed upload changes nothing
    await element.updateComplete;
    field(element, "thumbnail").dispatchEvent(
      new CustomEvent("field-file", {
        detail: new File(["x"], "New.png"),
        bubbles: true,
      }),
    );
    await settle(element);
    expect(element.files).toEqual(["guide.pdf", "new.png", "thumb.png"]);
    api.upload.mockRejectedValueOnce(new Error("Disk full"));
    field(element, "thumbnail").dispatchEvent(
      new CustomEvent("field-file", {
        detail: new File(["x"], "Other.png"),
        bubbles: true,
      }),
    );
    await settle(element);
    expect(element.data.thumbnail).toBe("new.png");
    expect(toasts).toContainEqual({ kind: "error", message: "Disk full" });
  });

  it("should upload images for the body and report failures", async () => {
    const { element, api } = await setup();
    const uploadImage = find<EdahaRichtext>(
      element,
      "edaha-richtext",
    ).uploadImage!;
    expect(await uploadImage(new File(["x"], "Pic.png"))).toBe(
      "/files/article/hello/pic.png",
    );
    api.upload.mockRejectedValueOnce(new Error("Disk full"));
    await expect(uploadImage(new File(["x"], "Pic.png"))).rejects.toThrow(
      "Upload failed",
    );
  });

  it("should upload images for the body's Markdown, referring to them by file name", async () => {
    const { element, api } = await setup();
    await element.setMode("markdown");
    await settle(element);
    const uploadImage = find<EdahaMarkdown>(
      element,
      "edaha-markdown",
    ).uploadImage!;
    expect(await uploadImage(new File(["x"], "Pic.png"))).toBe("pic.png");
    api.upload.mockRejectedValueOnce(new Error("Disk full"));
    await expect(uploadImage(new File(["x"], "Pic.png"))).rejects.toThrow(
      "Upload failed",
    );
    // A new article has no folder to upload into until it is saved
    const { element: fresh } = await setup(undefined);
    await fresh.setMode("markdown");
    await settle(fresh);
    expect(find<EdahaMarkdown>(fresh, "edaha-markdown").uploadImage).toBe(
      undefined,
    );
  });

  it("should give the body the site's embeds, the embed dialog and embed frames from the API", async () => {
    const { element, api } = await setup();
    await settle(element);
    const tools = find<EdahaRichtext>(element, "edaha-richtext").embedTools!;
    expect(api.embeds).toHaveBeenCalledOnce();
    expect(tools.embeds).toEqual([{ key: "youtube", name: "YouTube video" }]);
    expect(await tools.loadFrame({ key: "youtube", content: "x" })).toEqual({
      url: "/embed-frame/x/",
      errors: [],
      warnings: [],
    });
    expect(api.embedFrame).toHaveBeenCalledWith("youtube", "x");
    // The dialog is outside the article's form, as it has its own
    const dialog = find<EdahaEmbedDialog>(element, "edaha-embed-dialog");
    expect(element.querySelector("form")!.contains(dialog)).toBe(false);
    const edit = vi.spyOn(dialog, "edit").mockResolvedValue("y");
    expect(await tools.edit({ key: "youtube", content: "x" }, false)).toEqual({
      key: "youtube",
      content: "y",
    });
    expect(edit).toHaveBeenCalledWith(
      tools.embeds[0],
      "x",
      false,
      expect.any(Function),
    );
    // The dialog checks content with the API
    const validate = edit.mock.calls[0]![3]!;
    expect(await validate({ key: "youtube", content: "y" })).toEqual(["Bad"]);
    expect(api.validateEmbed).toHaveBeenCalledWith("youtube", "y");
    // Cancelled, or a kind without a plugin (which has no dialog), gives nothing
    edit.mockResolvedValueOnce(undefined);
    expect(
      await tools.edit({ key: "youtube", content: "x" }, false),
    ).toBeUndefined();
    expect(
      await tools.edit({ key: "vimeo", content: "x" }, false),
    ).toBeUndefined();
    expect(edit).toHaveBeenCalledTimes(2);
    // The Markdown body gets them too
    await element.setMode("markdown");
    await settle(element);
    expect(find<EdahaMarkdown>(element, "edaha-markdown").embedTools).toBe(
      tools,
    );
  });

  it("should leave the body without embed tools when the embeds can't be loaded", async () => {
    const api = fakeApi();
    api.embeds.mockRejectedValue(new Error("offline"));
    const element = await mount<EdahaArticle>("edaha-article", {
      api,
      article: ARTICLE,
      typeOptions: [],
    });
    await settle(element);
    expect(
      find<EdahaRichtext>(element, "edaha-richtext").embedTools,
    ).toBeUndefined();
  });

  it("should not upload before the article is saved", async () => {
    const { element, api } = await setup(undefined);
    field(element, "thumbnail").dispatchEvent(
      new CustomEvent("field-file", {
        detail: new File(["x"], "a.png"),
        bubbles: true,
      }),
    );
    await settle(element);
    expect(api.upload).not.toHaveBeenCalled();
  });

  it("should add and remove tags, attachments and the author", async () => {
    const { element } = await setup();
    const group = (name: string) =>
      find<EdahaArticleDataGroup>(
        element,
        `edaha-article-data-group[name="${name}"]`,
      );
    group("tags").dispatchEvent(
      new CustomEvent("group-add", { bubbles: true }),
    );
    group("attachments").dispatchEvent(
      new CustomEvent("group-add", { bubbles: true }),
    );
    group("author").dispatchEvent(
      new CustomEvent("group-clear", { bubbles: true }),
    );
    await element.updateComplete;
    expect(element.data.tags).toEqual(["News", ""]);
    expect(element.data.attachments).toEqual([
      { url: "guide.pdf", name: "Guide" },
      { url: "" },
    ]);
    expect(element.data.author).toBeUndefined();
    button(element, "Remove tag").click();
    await element.updateComplete;
    // The first tag's button removes it, leaving the empty one
    expect(element.data.tags).toEqual([""]);
    expect(field(element, "tags[0]").value).toBe("");
    button(element, "Remove attachment").click();
    await element.updateComplete;
    expect(element.data.attachments).toEqual([{ url: "" }]);
    expect(field(element, "attachments[0][url]").previewUrl).toBe("");
  });

  it("should reset the form when switching to a new article", async () => {
    const { element } = await setup();
    element.article = undefined;
    await element.updateComplete;
    expect(field(element, "title").value).toBe("");
    expect(element.files).toEqual([]);
    expect(element.location).toBeUndefined();
  });

  it("should offer the article's own type even if it isn't configured", async () => {
    const { element } = await setup({ ...ARTICLE, type: "video" });
    expect(field(element, "type").options.map((o) => o.value)).toEqual([
      "article",
      "news",
      "video",
    ]);
  });

  it("should offer the type's templates and save the chosen one", async () => {
    const { element, api } = await setup({ ...ARTICLE, type: "page" });
    await settle(element);
    expect(api.templates).toHaveBeenCalledWith("page");
    const template = field(element, "template");
    expect(template.options.map((o) => o.value)).toEqual(["single", "home"]);
    expect(template.value).toBe("single");
    input(find<HTMLSelectElement>(template, "select"), "home", "change");
    expect(element.data.template).toBe("home");
    input(find<HTMLSelectElement>(template, "select"), "single", "change");
    expect(element.data.template).toBeUndefined();
  });

  it("should reload templates when the type changes, ignoring stale or failed loads", async () => {
    const { element, api } = await setup({ ...ARTICLE, template: "custom" });
    await settle(element);
    // An article's own template is always offered
    expect(field(element, "template").options.map((o) => o.value)).toEqual([
      "single",
      "custom",
    ]);

    let finish: (templates: string[]) => void = () => undefined;
    api.templates.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve)),
    );
    input(
      find<HTMLSelectElement>(field(element, "type"), "select"),
      "news",
      "change",
    );
    await element.updateComplete;
    api.templates.mockRejectedValueOnce(new Error("offline"));
    input(
      find<HTMLSelectElement>(field(element, "type"), "select"),
      "article",
      "change",
    );
    await settle(element);
    finish(["stale"]);
    await settle(element);
    expect(element.templates).toEqual([]);

    // A failed load for a type that has since changed is ignored too
    let fail: (error: Error) => void = () => undefined;
    api.templates.mockImplementationOnce(
      () => new Promise((_, reject) => (fail = reject)),
    );
    input(
      find<HTMLSelectElement>(field(element, "type"), "select"),
      "news",
      "change",
    );
    await element.updateComplete;
    input(
      find<HTMLSelectElement>(field(element, "type"), "select"),
      "article",
      "change",
    );
    await settle(element);
    fail(new Error("late"));
    await settle(element);
    expect(element.templates).toEqual(["single"]);
  });

  it("should keep absolute file URLs as they are", async () => {
    const { element } = await setup({
      ...ARTICLE,
      thumbnail: "https://example.com/t.png",
    });
    expect(field(element, "thumbnail").previewUrl).toBe(
      "https://example.com/t.png",
    );
  });

  it("should delete the article after confirming", async () => {
    const { element, api } = await setup();
    const deleted = vi.fn();
    element.addEventListener("article-deleted", deleted);
    element.confirm = vi.fn(() => false);
    button(element, "Delete…").click();
    await settle(element);
    expect(api.remove).not.toHaveBeenCalled();

    element.confirm = vi.fn(() => true);
    api.remove.mockRejectedValueOnce(new Error("Busy"));
    button(element, "Delete…").click();
    await settle(element);
    expect(deleted).not.toHaveBeenCalled();
    expect(toasts).toEqual([{ kind: "error", message: "Busy" }]);

    button(element, "Delete…").click();
    await settle(element);
    expect(element.confirm).toHaveBeenCalledWith(
      'Delete "Hello" and all its files?',
    );
    expect(api.remove).toHaveBeenCalledWith({ type: "article", slug: "hello" });
    expect(deleted).toHaveBeenCalledOnce();
    expect(toasts.at(-1)).toEqual({
      kind: "success",
      message: 'Deleted "Hello"',
    });
  });

  it("should not delete an unsaved article", async () => {
    const { element, api } = await setup(undefined);
    await element.deleteArticle();
    expect(api.remove).not.toHaveBeenCalled();
  });

  it("should confirm with window.confirm by default", async () => {
    const { element } = await setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    expect(element.confirm("Sure?")).toBe(true);
    expect(confirm).toHaveBeenCalledWith("Sure?");
    confirm.mockRestore();
  });
});

describe("edaha-article body modes", () => {
  /** A body mode's button */
  const modeButton = (element: HTMLElement, mode: string) =>
    find<HTMLButtonElement>(element, `.body-tabs [data-mode="${mode}"]`);

  /** Switch the body's mode and wait for it */
  const switchTo = async (element: EdahaArticle, mode: string) => {
    modeButton(element, mode).click();
    await settle(element);
  };

  it("should edit the body as Markdown and switch back to rich text", async () => {
    const { api, element } = await setup();
    expect(modeButton(element, "wysiwyg").getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(
      [...element.querySelectorAll(".body-tabs button")].map((b) =>
        b.textContent?.trim(),
      ),
    ).toEqual(["WYSIWYG", "Markdown", "Preview"]);
    await switchTo(element, "markdown");
    expect(api.toMarkdown).toHaveBeenCalledWith("<p>Body</p>", {
      type: "article",
      slug: "hello",
    });
    expect(modeButton(element, "markdown").getAttribute("aria-selected")).toBe(
      "true",
    );
    const textarea = find<HTMLTextAreaElement>(
      field(element, "bodyMarkdown"),
      "textarea",
    );
    expect(textarea.value).toBe("Body");
    expect(element.querySelector("edaha-richtext")).toBeNull();
    input(textarea, "**New** body");
    await switchTo(element, "wysiwyg");
    expect(api.toHtml).toHaveBeenCalledWith("**New** body", {
      type: "article",
      slug: "hello",
    });
    expect(element.data.bodyHtml).toBe("<p>**New** body</p>");
    expect(find(element, "edaha-richtext")).toBeDefined();
    // Choosing the current mode does nothing
    const calls = api.toHtml.mock.calls.length;
    await switchTo(element, "wysiwyg");
    expect(api.toHtml).toHaveBeenCalledTimes(calls);
  });

  it("should show the modes as tabs controlling the body's panel", async () => {
    const { element } = await setup();
    const tablist = find(element, '[role="tablist"]');
    expect(tablist.getAttribute("aria-label")).toBe("Body");
    const panel = find(element, '[role="tabpanel"]');
    expect(panel.id).toBe("body-panel");
    expect(panel.getAttribute("aria-labelledby")).toBe("body-tab-wysiwyg");
    expect(modeButton(element, "wysiwyg").tabIndex).toBe(0);
    expect(modeButton(element, "markdown").tabIndex).toBe(-1);
    expect(modeButton(element, "markdown").getAttribute("aria-controls")).toBe(
      "body-panel",
    );
    await switchTo(element, "markdown");
    expect(panel.getAttribute("aria-labelledby")).toBe("body-tab-markdown");
    expect(panel.classList.contains("body-panel-markdown")).toBe(true);
    expect(modeButton(element, "markdown").tabIndex).toBe(0);
  });

  it("should move focus between tabs with the arrow keys, Home and End, without switching", async () => {
    const { element } = await setup();
    const press = (key: string) => {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      (document.activeElement as HTMLElement).dispatchEvent(event);
      return event;
    };
    modeButton(element, "wysiwyg").focus();
    expect(press("ArrowRight").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(modeButton(element, "markdown"));
    press("End");
    expect(document.activeElement).toBe(modeButton(element, "preview"));
    press("Home");
    expect(document.activeElement).toBe(modeButton(element, "wysiwyg"));
    press("ArrowLeft");
    expect(document.activeElement).toBe(modeButton(element, "preview"));
    expect(press("a").defaultPrevented).toBe(false);
    expect(element.mode).toBe("wysiwyg");
  });

  it("should save the Markdown as the body", async () => {
    const { api, element } = await setup();
    await switchTo(element, "markdown");
    input(
      find<HTMLTextAreaElement>(field(element, "bodyMarkdown"), "textarea"),
      "Saved",
    );
    await element.save();
    expect(api.save.mock.calls[0]![1]).toMatchObject({
      bodyHtml: "<p>Saved</p>",
    });
    expect(element.mode).toBe("markdown");
  });

  it("should preview the unsaved article, from rich text or Markdown", async () => {
    const { api, element } = await setup();
    input(
      find<HTMLInputElement>(field(element, "title"), "input"),
      " Changed ",
    );
    await switchTo(element, "preview");
    expect(api.preview).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Changed", bodyHtml: "<p>Body</p>" }),
      { type: "article", slug: "hello" },
    );
    const frame = find<HTMLIFrameElement>(element, "iframe.preview");
    expect(frame.getAttribute("src")).toBe("/preview/Changed/");

    await switchTo(element, "markdown");
    input(
      find<HTMLTextAreaElement>(field(element, "bodyMarkdown"), "textarea"),
      "From Markdown",
    );
    await switchTo(element, "preview");
    expect(api.preview).toHaveBeenLastCalledWith(
      expect.objectContaining({ bodyHtml: "<p>From Markdown</p>" }),
      { type: "article", slug: "hello" },
    );
  });

  it("should change the preview's width without rendering it again", async () => {
    const { api, element } = await setup();
    await switchTo(element, "preview");
    const frame = () => find<HTMLIFrameElement>(element, "iframe.preview");
    const select = find<HTMLSelectElement>(element, "select#preview-width");
    expect(find(element, 'label[for="preview-width"]').textContent).toBe(
      "Width",
    );
    expect([...select.options].map((o) => [o.value, o.text.trim()])).toEqual([
      ["full", "Full"],
      ["900", "900px"],
      ["600", "600px"],
      ["320", "320px"],
    ]);
    expect(frame().style.width).toBe("100%");
    for (const [value, width] of [
      ["320", "320px"],
      ["600", "600px"],
      ["900", "900px"],
      ["full", "100%"],
    ]) {
      input(select, value as string, "change");
      await settle(element);
      expect(frame().style.width).toBe(width);
    }
    expect(api.preview).toHaveBeenCalledOnce();
    // The width stays when the preview is shown again
    input(select, "320", "change");
    await switchTo(element, "wysiwyg");
    await switchTo(element, "preview");
    expect(frame().style.width).toBe("320px");
    expect(find<HTMLSelectElement>(element, "select#preview-width").value).toBe(
      "320",
    );
  });

  it("should stay in the current mode, showing the error, when converting or rendering fails", async () => {
    const { api, element } = await setup();
    api.toMarkdown.mockRejectedValueOnce(new Error("No markdown"));
    await switchTo(element, "markdown");
    expect(element.mode).toBe("wysiwyg");
    expect(element.error).toBe("No markdown");
    api.preview.mockRejectedValueOnce(new Error("No preview"));
    await switchTo(element, "preview");
    expect(element.mode).toBe("wysiwyg");
    expect(element.error).toBe("No preview");

    await switchTo(element, "markdown");
    api.toHtml.mockRejectedValue(new Error("No HTML"));
    await switchTo(element, "wysiwyg");
    expect(element.mode).toBe("markdown");
    await element.save();
    expect(api.save).not.toHaveBeenCalled();
    expect(element.error).toBe("No HTML");
  });

  it("should go back to rich text when another article is loaded", async () => {
    const { element } = await setup();
    await switchTo(element, "markdown");
    element.article = { ...ARTICLE, slug: "other" };
    await settle(element);
    expect(element.mode).toBe("wysiwyg");
  });
});

describe("edaha-article settings in the compact layout", () => {
  it("should open the settings full screen from the bar, and close them with the button or Escape", async () => {
    const { element } = await setup();
    const toggle = find<HTMLButtonElement>(element, ".btn-metadata-toggle");
    const aside = find(element, "aside");
    const main = find(element, "main");
    const fields = find(element, "#article-metadata-fields");
    expect(fields.contains(field(element, "type"))).toBe(true);
    expect(toggle.getAttribute("aria-controls")).toBe(fields.id);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "︽ Article settings",
    );
    expect(toggle.title).toBe("Show article settings");

    toggle.click();
    await settle(element);
    expect(aside.classList.contains("open")).toBe(true);
    expect(main.hasAttribute("inert")).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.title).toBe("Hide article settings");
    expect(toggle.textContent).toContain("︾");
    toggle.click();
    await settle(element);
    expect(element.metadataOpen).toBe(false);
    expect(main.hasAttribute("inert")).toBe(false);

    toggle.click();
    await settle(element);
    find(element, "#field-slug").dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", bubbles: true }),
    );
    expect(element.metadataOpen).toBe(true);
    find(element, "#field-slug").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await settle(element);
    expect(element.metadataOpen).toBe(false);
  });

  it("should close the settings when the layout stops being compact, but not when it becomes compact", async () => {
    const { element } = await setup();
    element.metadataOpen = true;
    element.compact = true;
    await settle(element);
    expect(element.metadataOpen).toBe(true);
    element.compact = false;
    await settle(element);
    expect(element.metadataOpen).toBe(false);
  });
});

describe("edaha-article focus mode button", () => {
  it("should be a toggle button at the top right of the title, asking to turn focus mode on and off", async () => {
    const { element } = await setup();
    const toggle = find<HTMLButtonElement>(element, ".btn-focus-mode");
    expect(toggle.parentElement).toBe(field(element, "title").parentElement);
    expect(toggle.title).toBe("Focus mode");
    expect(toggle.textContent?.trim()).toBe("Focus mode");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.querySelector(".icon-fullscreen")).not.toBeNull();

    const requests: boolean[] = [];
    document.addEventListener("focus-mode-change", (event) =>
      requests.push((event as CustomEvent<boolean>).detail),
    );
    toggle.click();
    expect(requests).toEqual([true]);
    // The editor turns it on
    element.focusMode = true;
    await settle(element);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.querySelector(".icon-fullscreen_exit")).not.toBeNull();
    toggle.click();
    expect(requests).toEqual([true, false]);
  });
});

describe("edaha-article choosing existing files", () => {
  /** A file the file browser lists */
  const listed = (type: string, slug: string, name: string) => ({
    type,
    slug,
    name,
    kind: name.endsWith(".png") ? ("image" as const) : ("document" as const),
    size: 1,
    updated: DATE,
    url: `/${type}/${slug}/${name}`,
  });

  it("should offer no choosers without a file picker", async () => {
    const { element } = await setup();
    expect(field(element, "body").chooseFile).toBeUndefined();
    expect(field(element, "thumbnail").chooseFile).toBeUndefined();
    expect(element.querySelector(".btn-choose-file")).toBeNull();
  });

  it("should refer to the article's own files by name, and others by their path on the website", async () => {
    const { element } = await setup();
    element.pickFile = vi
      .fn()
      .mockResolvedValueOnce(listed("article", "hello", "cat.png"))
      .mockResolvedValueOnce(listed("page", "about", "guide.pdf"))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(listed("article", "hello", "cat.png"))
      .mockResolvedValueOnce(listed("page", "about", "team.png"));
    await settle(element);
    const choose = field(element, "thumbnail").chooseFile!;
    expect(await choose("image")).toEqual({
      url: "cat.png",
      name: "cat.png",
      kind: "image",
    });
    expect(element.pickFile).toHaveBeenCalledWith("image");
    expect(await choose()).toEqual({
      url: "/page/about/guide.pdf",
      name: "guide.pdf",
      kind: "document",
    });
    expect(await choose()).toBeUndefined();
    // The rich text body shows the article's own files from the editor's file URL
    const chooseBody = field(element, "body").chooseFile!;
    expect((await chooseBody())?.url).toBe("/files/article/hello/cat.png");
    expect((await chooseBody())?.url).toBe("/page/about/team.png");
    // Attachments get the same chooser
    expect(field(element, "attachments[0][url]").chooseFile).toBe(choose);
  });

  it("should give the Markdown body the chooser, and choose for unsaved articles", async () => {
    const { element } = await setup(undefined);
    element.pickFile = vi.fn(async () => listed("article", "hello", "a.pdf"));
    element.mode = "markdown";
    await settle(element);
    const choose = field(element, "bodyMarkdown").chooseFile!;
    // Not saved yet, so it has no own files
    expect((await choose())?.url).toBe("/article/hello/a.pdf");
    expect(field(element, "thumbnail").chooseFile).toBe(choose);
  });

  it("should show files chosen from other articles at their paths on the website", async () => {
    const { element } = await setup({
      ...ARTICLE,
      attachments: [{ url: "/page/about/team.png" }],
    });
    expect(
      find<HTMLImageElement>(
        field(element, "attachments[0][url]"),
        ".file-current img",
      ).getAttribute("src"),
    ).toBe("/page/about/team.png");
  });
});

describe("edaha-article title focus", () => {
  it("should focus the title of a new article, but not of an opened one", async () => {
    const { element: opened } = await setup();
    const openedTitle = find<HTMLInputElement>(field(opened, "title"), "input");
    expect(document.activeElement).not.toBe(openedTitle);
    opened.remove();

    const { element } = await setup(undefined);
    await settle(element);
    expect(document.activeElement).toBe(
      find<HTMLInputElement>(field(element, "title"), "input"),
    );
  });
});

describe("nextTabIndex", () => {
  it("should move to the previous or next tab, wrapping around, or the first or last", () => {
    expect(nextTabIndex("ArrowRight", 0, 3)).toBe(1);
    expect(nextTabIndex("ArrowRight", 2, 3)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(nextTabIndex("ArrowLeft", 2, 3)).toBe(1);
    expect(nextTabIndex("Home", 2, 3)).toBe(0);
    expect(nextTabIndex("End", 0, 3)).toBe(2);
    expect(nextTabIndex("Enter", 0, 3)).toBeUndefined();
  });
});

describe("changedFields", () => {
  const saved = {
    ...ARTICLE,
    files: undefined,
  } as unknown as EditorArticleData;

  it("should find changed fields and groups, ignoring the body, key order and undefined values", () => {
    expect(changedFields(saved, saved)).toEqual(new Set());
    expect(
      changedFields(
        {
          ...saved,
          title: "New",
          tags: ["News", "More"],
          author: { email: undefined, name: "Matt" },
          bodyHtml: "<p>Other</p>",
        },
        saved,
      ),
    ).toEqual(new Set(["title", "tags"]));
    expect(
      changedFields({ ...saved, author: undefined, excerpt: "E" }, saved),
    ).toEqual(new Set(["author", "excerpt"]));
  });
});

describe("edaha-article changes", () => {
  /** Mount the form with body checks that don't wait */
  const changesSetup = async (...args: [article?: EditorArticle]) => {
    const result = await setup(...args);
    result.element.bodyCheckDelay = 0;
    await settle(result.element);
    return result;
  };

  /** The labels of the fields and groups marked as changed */
  const marked = (element: HTMLElement) =>
    [
      ...element.querySelectorAll<
        EdahaArticleDataField | EdahaArticleDataGroup
      >("edaha-article-data-field, edaha-article-data-group"),
    ]
      .filter((item) => item.changed)
      .map((item) => item.label);

  /** Change the body as the rich text editor would */
  const editBody = async (element: EdahaArticle, html: string) => {
    field(element, "body").dispatchEvent(
      new CustomEvent("field-change", {
        detail: { name: "body", value: html },
        bubbles: true,
      }),
    );
    await settle(element);
  };

  it("should mark changed fields, groups and the body until saved", async () => {
    const { api, element } = await changesSetup();
    expect(api.toMarkdown).toHaveBeenCalledWith("<p>Body</p>", {
      type: "article",
      slug: "hello",
    });
    expect(marked(element)).toEqual([]);
    expect(element.dirty).toBe(false);
    expect(button(element, "Reset…").disabled).toBe(true);
    expect(button(element, "Save").classList).not.toContain("btn-save-dirty");

    input(find<HTMLInputElement>(field(element, "title"), "input"), "Changed");
    input(find<HTMLInputElement>(field(element, "tags[0]"), "input"), "Other");
    await editBody(element, "<p>Body</p>");
    await settle(element);
    expect(marked(element)).toEqual(["Title", "Tags"]);
    await editBody(element, "<p>New body</p>");
    expect(marked(element)).toEqual(["Title", "Body", "Tags"]);
    expect(button(element, "Reset…").disabled).toBe(false);
    // The save button shows there are changes to save
    expect(button(element, "Save").classList).toContain("btn-save-dirty");

    await element.save();
    await settle(element);
    expect(marked(element)).toEqual([]);
    expect(element.dirty).toBe(false);
    expect(button(element, "Save").classList).not.toContain("btn-save-dirty");
    expect(api.toMarkdown).toHaveBeenLastCalledWith("<p>New body</p>", {
      type: "article",
      slug: "hello",
    });
  });

  it("should compare the body as typed in Markdown mode, and remember it when saved", async () => {
    const { api, element } = await changesSetup();
    await element.setMode("markdown");
    await settle(element);
    const textarea = () =>
      find<HTMLTextAreaElement>(field(element, "bodyMarkdown"), "textarea");
    input(textarea(), "Body!");
    await settle(element);
    expect(marked(element)).toEqual(["Body"]);
    input(textarea(), "Body");
    await settle(element);
    expect(marked(element)).toEqual([]);
    input(textarea(), "Saved in Markdown");
    await element.save();
    await settle(element);
    expect(marked(element)).toEqual([]);
    const conversions = api.toMarkdown.mock.calls.length;
    input(textarea(), "Saved in Markdown");
    await settle(element);
    expect(api.toMarkdown).toHaveBeenCalledTimes(conversions);
    expect(element.dirty).toBe(false);
  });

  it("should not mark a new article as changed when the clock moves while it is made", () => {
    // Each new Date is a millisecond later
    let tick = 0;
    const RealDate = Date;
    vi.stubGlobal(
      "Date",
      class extends RealDate {
        constructor(...args: []) {
          super(
            ...((args.length ? args : [Date.UTC(2026, 9, 28) + tick++]) as []),
          );
        }
      },
    );
    const element = document.createElement("edaha-article") as EdahaArticle;
    vi.unstubAllGlobals();
    expect(element.savedData).toEqual(element.data);
    expect(element.dirty).toBe(false);
  });

  it("should compare a new article against an empty one", async () => {
    const { api, element } = await changesSetup(undefined);
    expect(api.toMarkdown).not.toHaveBeenCalled();
    expect(element.dirty).toBe(false);
    await editBody(element, "<p></p>");
    expect(element.dirty).toBe(false);
    await editBody(element, "<p>Text</p>");
    expect(element.dirty).toBe(true);
  });

  it("should check the body straight away when asked whether there are changes", async () => {
    const { element } = await setup();
    element.bodyCheckDelay = 60_000;
    await settle(element);
    field(element, "body").dispatchEvent(
      new CustomEvent("field-change", {
        detail: { name: "body", value: "<p>Edited</p>" },
        bubbles: true,
      }),
    );
    expect(element.dirty).toBe(false);
    expect(await element.hasChanges()).toBe(true);
  });

  it("should not mark the body when it can't be converted, and use only the latest check", async () => {
    const { api, element } = await changesSetup();
    api.toMarkdown.mockRejectedValueOnce(new Error("offline"));
    await editBody(element, "<p>Unknown</p>");
    expect(element.bodyChanged).toBe(false);

    // A slow check is overtaken by a later one
    let finishSlow: (markdown: string) => void = () => undefined;
    api.toMarkdown.mockImplementationOnce(
      () => new Promise<string>((resolve) => (finishSlow = resolve)),
    );
    await editBody(element, "<p>Slow</p>");
    await editBody(element, "<p>Body</p>");
    finishSlow("Slow");
    await settle(element);
    expect(element.bodyChanged).toBe(false);

    // The saved body can't be converted, so the body isn't compared
    const failing = await setup();
    failing.api.toMarkdown.mockRejectedValue(new Error("offline"));
    failing.element.article = { ...ARTICLE, slug: "other" };
    failing.element.bodyCheckDelay = 0;
    await settle(failing.element);
    await editBody(failing.element, "<p>Changed</p>");
    expect(failing.element.bodyChanged).toBe(false);
  });

  it("should use only the latest saved body", async () => {
    const { api, element } = await changesSetup();
    let finishFirst: (markdown: string) => void = () => undefined;
    api.toMarkdown.mockImplementationOnce(
      () => new Promise<string>((resolve) => (finishFirst = resolve)),
    );
    element.article = { ...ARTICLE, slug: "first", bodyHtml: "<p>First</p>" };
    await element.updateComplete;
    element.article = { ...ARTICLE, slug: "second", bodyHtml: "<p>Second</p>" };
    await settle(element);
    finishFirst("First");
    await settle(element);
    await editBody(element, "<p>Second</p>");
    expect(element.bodyChanged).toBe(false);
  });

  it("should reset to the saved article after confirming", async () => {
    const { element } = await changesSetup();
    input(find<HTMLInputElement>(field(element, "title"), "input"), "Changed");
    await editBody(element, "<p>New body</p>");
    await element.setMode("markdown");
    await settle(element);
    element.confirm = vi.fn(() => false);
    button(element, "Reset…").click();
    expect(element.confirm).toHaveBeenCalledWith(RESET_QUESTION);
    expect(element.data.title).toBe("Changed");

    element.confirm = vi.fn(() => true);
    button(element, "Reset…").click();
    await settle(element);
    expect(element.data.title).toBe("Hello");
    expect(element.data.bodyHtml).toBe("<p>Body</p>");
    expect(element.mode).toBe("wysiwyg");
    expect(marked(element)).toEqual([]);
    expect(button(element, "Reset…").disabled).toBe(true);
    expect(toasts.at(-1)).toEqual({
      kind: "success",
      message: "Reset to the last saved version",
    });
    // Reset sits between Save and Delete…
    expect(
      [...element.querySelectorAll(".edaha-article-controls .btn")].map((b) =>
        b.textContent?.replace(/\s+/g, " ").trim(),
      ),
    ).toEqual(["Save", "Reset…", "Delete…", "︽ Article settings"]);
  });
});

describe("edaha-article custom settings", () => {
  /** Custom fields: articles use "rating" and "credit"; news uses none */
  const DEFINITIONS = {
    rating: {
      type: "number",
      maximum: 10,
      $edahaField: { number: true },
    },
    credit: {
      type: "object",
      properties: {
        name: { type: "string", $edahaField: { text: true } },
      },
      required: ["name"],
    },
    hero: {
      type: "string",
      $edahaField: { file: true, group: { key: "files", after: "thumbnail" } },
    },
  } as const;
  const METADATA = {
    definitions: DEFINITIONS,
    types: { article: ["rating", "credit", "hero"], news: false },
    groups: metadataLayout(DEFINITIONS as never, {}),
  };

  /** An article with custom settings, its form showing them */
  const setupMetadata = async (
    meta: Record<string, unknown> = { rating: 3, oops: true },
    problems: EditorArticle["problems"] = [],
  ) => {
    const result = await setup({ ...ARTICLE, meta, problems });
    result.element.metadata = structuredClone(METADATA) as never;
    await settle(result.element);
    return result;
  };

  /** The warnings about other settings, without their Remove buttons */
  const warnings = (element: HTMLElement) =>
    [...element.querySelectorAll(".metadata-warnings li > span")].map((span) =>
      span.textContent?.replace(/\s+/g, " ").trim(),
    );

  /** A settings group */
  const group = (element: HTMLElement, key = "custom") =>
    find<HTMLDetailsElement>(element, `.settings-group[data-group="${key}"]`);

  /** Leave a custom field, as moving focus out of it does */
  const blur = (element: HTMLElement, path: string) =>
    find(element, `edaha-metadata-field[path="${path}"]`).dispatchEvent(
      new CustomEvent("metadata-blur", { detail: path, bubbles: true }),
    );

  it("should show the type's custom fields, and warn about other settings", async () => {
    const { element } = await setupMetadata();
    expect(
      [...group(element).querySelectorAll(":scope > edaha-metadata-field")].map(
        (f) => (f as EdahaMetadataField).path,
      ),
    ).toEqual(["rating", "credit"]);
    // "hero" is in Files, after the thumbnail
    expect(
      [
        ...group(element, "files").querySelectorAll(
          ":scope > edaha-article-data-field, :scope > edaha-metadata-field",
        ),
      ].map((f) => f.getAttribute("name") ?? (f as EdahaMetadataField).path),
    ).toEqual(["thumbnail", "hero"]);
    expect(find<HTMLInputElement>(element, "#meta-rating").value).toBe("3");
    expect(warnings(element)).toEqual([
      '"oops" isn\'t a known setting; it is kept unless you remove it.',
    ]);
    // The Custom group says it has warnings, even closed
    expect(
      find(group(element), "summary").textContent?.replace(/\s+/g, " ").trim(),
    ).toBe("Custom ⚠️ has warnings");
    // News articles use no custom fields, so "rating" is kept with a warning
    input(
      find<HTMLSelectElement>(field(element, "type"), "select"),
      "news",
      "change",
    );
    await settle(element);
    expect(
      group(element).querySelectorAll(":scope > edaha-metadata-field"),
    ).toHaveLength(0);
    expect(element.querySelector("edaha-metadata-field")).toBeNull();
    expect(warnings(element)).toEqual([
      "\"rating\" isn't used by this article's type; it is kept unless you remove it.",
      '"oops" isn\'t a known setting; it is kept unless you remove it.',
    ]);
  });

  it("should show fields' defaults, hide fields by their conditions, and save every shown value", async () => {
    const definitions = {
      layout: {
        type: "string",
        enum: ["slim", "large"],
        $edahaField: { select: true, defaultValue: "large" },
      },
      tracklist: {
        type: "boolean",
        $edahaField: {
          checkbox: true,
          defaultValue: false,
          hideWhen: ["layout", "=", "slim"],
        },
      },
    } as const;
    const result = await setup({
      ...ARTICLE,
      meta: { tracklist: true, oops: 1 },
      problems: [],
    });
    const { element, api } = result;
    element.metadata = {
      definitions,
      types: {},
      groups: metadataLayout(definitions as never, {}),
    } as never;
    await settle(element);
    // The default shows, without changing the article
    expect(find<HTMLSelectElement>(element, "#meta-layout").value).toBe(
      "large",
    );
    expect(find<HTMLInputElement>(element, "#meta-tracklist").checked).toBe(
      true,
    );
    expect(element.dirty).toBe(false);
    // Choosing "slim" hides the tracklist, keeping its value until it is saved
    input(find<HTMLSelectElement>(element, "#meta-layout"), "slim", "change");
    await settle(element);
    expect(element.querySelector("#meta-tracklist")).toBeNull();
    expect(element.data.meta).toEqual({
      tracklist: true,
      oops: 1,
      layout: "slim",
    });
    input(find<HTMLSelectElement>(element, "#meta-layout"), "large", "change");
    await settle(element);
    expect(find<HTMLInputElement>(element, "#meta-tracklist").checked).toBe(
      true,
    );
    input(find<HTMLSelectElement>(element, "#meta-layout"), "slim", "change");
    await settle(element);
    await element.save();
    expect(api.save.mock.calls[0]![1].meta).toEqual({
      oops: 1,
      layout: "slim",
    });
  });

  it("should remove other settings with their Remove buttons, once saved", async () => {
    const { element, api } = await setupMetadata({ rating: 3, oops: true });
    button(element, 'Remove "oops"').click();
    await settle(element);
    expect(element.data.meta).toEqual({ rating: 3 });
    expect(element.querySelector(".metadata-warnings")).toBeNull();
    expect(element.dirty).toBe(true);
    await element.save();
    expect(api.save.mock.calls[0]![1].meta).toEqual({ rating: 3 });
  });

  it("should leave out the Custom group without custom fields or other settings", async () => {
    const { element } = await setup();
    expect(element.querySelector('[data-group="custom"]')).toBeNull();
    element.metadata = {
      definitions: {},
      types: {},
      groups: metadataLayout({}, {}),
    };
    await settle(element);
    expect(element.querySelector('[data-group="custom"]')).toBeNull();
  });

  it("should change values, checking a field when it is left and saying when errors are found", async () => {
    const { element } = await setupMetadata();
    input(find<HTMLInputElement>(element, "#meta-rating"), "20");
    await settle(element);
    expect(element.data.meta).toEqual({ rating: 20, oops: true });
    expect(element.dirty).toBe(true);
    expect(find(group(element), "summary .changed").textContent).toBe("*");
    blur(element, "rating");
    await settle(element);
    expect(find(element, "#meta-rating-problems").textContent).toContain(
      "must be at most 10",
    );
    expect(toasts).toEqual([{ kind: "error", message: METADATA_ERRORS }]);
    // Still wrong: no more toasts
    blur(element, "rating");
    expect(toasts).toHaveLength(1);
    input(find<HTMLInputElement>(element, "#meta-rating"), "");
    blur(element, "rating");
    await settle(element);
    expect(element.metaProblems).toEqual([]);
    expect(element.data.meta).toEqual({ oops: true });
    // A value inside another is checked with it
    input(find<HTMLInputElement>(element, "#meta-credit-name"), "Matt");
    blur(element, "credit/name");
    await settle(element);
    expect(element.data.meta).toEqual({ oops: true, credit: { name: "Matt" } });
    expect(element.metaProblems).toEqual([]);
  });

  it("should not save while values are invalid, showing where", async () => {
    const { element, api } = await setupMetadata({ rating: 20, credit: {} });
    expect(await element.save()).toBe(false);
    expect(api.save).not.toHaveBeenCalled();
    expect(element.metaProblems.map(({ path }) => path)).toEqual([
      "rating",
      "credit/name",
    ]);
    expect(toasts.at(-1)).toEqual({ kind: "error", message: METADATA_ERRORS });
  });

  it("should save valid values, and show problems the server refused them for", async () => {
    const { element, api } = await setupMetadata({ rating: 3 });
    expect(await element.save()).toBe(true);
    expect(api.save.mock.calls[0]![1]).toMatchObject({ meta: { rating: 3 } });
    const problems = [
      { path: "rating", message: "is wrong", level: "error" as const },
    ];
    api.save.mockRejectedValueOnce(new ApiError("Not valid", problems));
    expect(await element.save()).toBe(false);
    expect(element.metaProblems).toEqual(problems);
  });

  it("should show the errors it was loaded with, and show them again on reset", async () => {
    const problems = [
      {
        path: "rating",
        message: "must be at most 10",
        level: "error" as const,
      },
      {
        path: "oops",
        message: "isn't a known setting",
        level: "warning" as const,
      },
    ];
    const { element } = await setupMetadata({ rating: 20, oops: 1 }, problems);
    expect(element.metaProblems).toEqual([problems[0]]);
    element.confirm = () => true;
    input(find<HTMLInputElement>(element, "#meta-rating"), "5");
    blur(element, "rating");
    await settle(element);
    expect(element.metaProblems).toEqual([]);
    element.reset();
    expect(element.metaProblems).toEqual([problems[0]]);
    // A new article starts without problems
    element.article = undefined;
    await settle(element);
    expect(element.metaProblems).toEqual([]);
  });

  it("should upload files for file fields once saved, showing them from the article's folder", async () => {
    const { element } = await setupMetadata({ hero: "a.png" });
    const hero = find<EdahaMetadataField>(
      element,
      'edaha-metadata-field[path="hero"]',
    );
    expect(await hero.uploadFile!(new File(["x"], "B.png"))).toBe("b.png");
    expect(hero.fileUrl!("a.png")).toBe("/files/article/hello/a.png");
    const { element: unsaved } = await setup(undefined);
    unsaved.metadata = structuredClone(METADATA) as never;
    await settle(unsaved);
    expect(
      find<EdahaMetadataField>(unsaved, 'edaha-metadata-field[path="hero"]')
        .uploadFile,
    ).toBeUndefined();
  });
});

describe("edaha-article settings groups", () => {
  /** A form with a custom group "seo" (open, with a description) holding a "rating" field */
  const setupGroups = async () => {
    const definitions = {
      rating: {
        type: "number",
        maximum: 10,
        $edahaField: { number: true, group: "seo" },
      },
    };
    const result = await setup({ ...ARTICLE, meta: { rating: 3 } });
    result.element.metadata = {
      definitions,
      types: {},
      groups: metadataLayout(definitions as never, {
        seo: {
          title: "SEO",
          description: "For search engines",
          after: "info",
          openedByDefault: true,
        },
      }),
    };
    await settle(result.element);
    return result;
  };

  /** The settings groups as [key, title, open] */
  const groups = (element: HTMLElement) =>
    [...element.querySelectorAll<HTMLDetailsElement>(".settings-group")].map(
      (group) => [
        group.dataset.group,
        group
          .querySelector("summary")
          ?.textContent?.replace(/\s+/g, " ")
          .trim(),
        group.open,
      ],
    );

  it("should show the built-in groups with their settings, Info, Customise and Files open", async () => {
    const { element } = await setup();
    expect(groups(element)).toEqual([
      ["info", "Info", true],
      ["categorise", "Categorise", false],
      ["customise", "Customise", true],
      ["files", "Files", true],
    ]);
    const settings = (key: string) =>
      [
        ...element.querySelectorAll(
          `[data-group="${key}"] > edaha-article-data-field, [data-group="${key}"] > edaha-article-data-group`,
        ),
      ].map((field) => field.getAttribute("name"));
    expect(settings("info")).toEqual([
      "type",
      "status",
      "slug",
      "date",
      "author",
    ]);
    expect(settings("categorise")).toEqual(["tags"]);
    expect(settings("customise")).toEqual(["excerpt", "template"]);
    expect(settings("files")).toEqual(["thumbnail", "attachments"]);
    expect(
      find(element, '[data-group="files"] .files-title').textContent?.trim(),
    ).toBe("Files in this article's folder (2)");
  });

  it("should show custom groups where the config puts them, open as it says, with their description", async () => {
    const { element } = await setupGroups();
    expect(groups(element).slice(0, 2)).toEqual([
      ["info", "Info", true],
      ["seo", "SEO", true],
    ]);
    expect(
      find(
        element,
        '[data-group="seo"] .settings-group-description',
      ).textContent?.trim(),
    ).toBe("For search engines");
    expect(
      find(element, '[data-group="seo"] edaha-metadata-field').getAttribute(
        "path",
      ),
    ).toBe("rating");
  });

  it("should keep groups as they were left, even when the config is read again", async () => {
    const { element } = await setupGroups();
    const info = find<HTMLDetailsElement>(element, '[data-group="info"]');
    info.open = false;
    info.dispatchEvent(new Event("toggle"));
    const categorise = find<HTMLDetailsElement>(
      element,
      '[data-group="categorise"]',
    );
    categorise.open = true;
    categorise.dispatchEvent(new Event("toggle"));
    await settle(element);
    element.metadata = structuredClone(element.metadata);
    await settle(element);
    expect(element.openGroups).toEqual(
      new Set(["seo", "categorise", "customise", "files"]),
    );
  });

  it("should open and mark a group with errors, and mark changed groups", async () => {
    const { element } = await setupGroups();
    const seo = find<HTMLDetailsElement>(element, '[data-group="seo"]');
    seo.open = false;
    seo.dispatchEvent(new Event("toggle"));
    await settle(element);
    expect(element.openGroups.has("seo")).toBe(false);
    input(find<HTMLInputElement>(element, "#meta-rating"), "20");
    await element.save();
    await settle(element);
    expect(element.openGroups.has("seo")).toBe(true);
    expect(seo.classList.contains("has-errors")).toBe(true);
    expect(find(seo, "summary").textContent?.replace(/\s+/g, " ").trim()).toBe(
      "SEO* ⚠️ has errors",
    );
    // Errors in an open group leave the groups as they are
    const before = element.openGroups;
    element.metaProblems = [...element.metaProblems];
    await settle(element);
    expect(element.openGroups).toBe(before);
    // A changed core setting marks its group
    input(find<HTMLInputElement>(field(element, "slug"), "input"), "new-slug");
    await settle(element);
    expect(find(element, '[data-group="info"] summary .changed')).toBeDefined();
  });
});

describe("edaha-article default author", () => {
  /** The author fields' placeholders */
  const placeholders = (element: HTMLElement) =>
    ["name", "email", "url"].map(
      (name) =>
        find<HTMLInputElement>(field(element, `author[${name}]`), "input")
          .placeholder,
    );

  /** A form for an article without an author, knowing the site's default authors */
  const setupAuthors = async () => {
    const result = await setup({ ...ARTICLE, author: undefined });
    result.element.site = {
      name: "Test News",
      author: {
        name: "Matt",
        email: "matt@example.com",
        url: "https://matt.example",
      },
      types: { news: { name: "News desk" }, notes: false },
    };
    await settle(result.element);
    return result;
  };

  it("should show the site's default author as placeholders, when the article has no author", async () => {
    const { element: unknown } = await setup({ ...ARTICLE, author: undefined });
    expect(placeholders(unknown)).toEqual([
      "Defaults to the site name",
      "",
      "https://example.com",
    ]);
    const { element } = await setupAuthors();
    expect(element.defaultAuthor()).toEqual(element.site?.author);
    expect(placeholders(element)).toEqual([
      "Defaults to Matt",
      "matt@example.com",
      "https://matt.example",
    ]);
    // With its own author, the default's details don't apply
    input(
      find<HTMLInputElement>(field(element, "author[name]"), "input"),
      "Zoë",
    );
    await settle(element);
    expect(placeholders(element)).toEqual([
      "Defaults to Matt",
      "",
      "https://example.com",
    ]);
  });

  it("should show the type's default author, or none", async () => {
    const { element } = await setupAuthors();
    element.data = { ...element.data, type: "news" };
    await settle(element);
    expect(element.defaultAuthor()).toEqual({ name: "News desk" });
    expect(placeholders(element)[0]).toBe("Defaults to News desk");
    element.data = { ...element.data, type: "notes" };
    await settle(element);
    expect(element.defaultAuthor()).toBeUndefined();
    expect(placeholders(element)[0]).toBe("No author unless you name one");
  });

  it("should choose no author, disabling the author's fields, and type one to have an author again", async () => {
    const { element, api } = await setupAuthors();
    const noAuthor = find<HTMLInputElement>(element, ".no-author input");
    expect(noAuthor.checked).toBe(false);
    noAuthor.checked = true;
    noAuthor.dispatchEvent(new Event("change"));
    await settle(element);
    expect(element.data.author).toBe(false);
    expect(placeholders(element)).toEqual(["", "", "https://example.com"]);
    expect(field(element, "author[name]").disabled).toBe(true);
    await element.save();
    expect(api.save.mock.calls[0]![1]).toMatchObject({ author: false });
    noAuthor.checked = false;
    noAuthor.dispatchEvent(new Event("change"));
    await settle(element);
    expect(element.data.author).toBeUndefined();
    // Typing an author after "no author" starts a new one
    element.data = { ...element.data, author: false };
    input(
      find<HTMLInputElement>(field(element, "author[email]"), "input"),
      "a@b.c",
    );
    expect(element.data.author).toEqual({ name: "", email: "a@b.c" });
  });
});
