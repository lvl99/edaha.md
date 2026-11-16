// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  EditorArticle,
  EditorArticleData,
} from "../../../../server/types";
import type { EditorApi } from "../../../editorApi";
import {
  applyFieldChange,
  changedFields,
  cleanArticleData,
  RESET_QUESTION,
  newArticleData,
  type EdahaArticle,
} from "..";
import "..";
import type { EdahaArticleDataField } from "../../edaha-article-data-field";
import type { EdahaArticleDataGroup } from "../../edaha-article-data-group";
import type { EdahaRichtext } from "../../edaha-richtext";
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
  }) as unknown as EditorApi &
    Record<
      | "create"
      | "save"
      | "remove"
      | "upload"
      | "templates"
      | "toMarkdown"
      | "toHtml"
      | "preview",
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

  it("should preview embeds in the body through the API", async () => {
    const { element, api } = await setup();
    const preview = { html: "<p>embed</p>", warnings: [] };
    (api as unknown as { embedPreview: unknown }).embedPreview = vi.fn(
      async () => preview,
    );
    const loadEmbedPreview = find<EdahaRichtext>(
      element,
      "edaha-richtext",
    ).loadEmbedPreview!;
    expect(await loadEmbedPreview("https://youtu.be/x")).toBe(preview);
    expect(api.embedPreview).toHaveBeenCalledWith("https://youtu.be/x");
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
    find<HTMLButtonElement>(element, `.body-modes [data-mode="${mode}"]`);

  /** Switch the body's mode and wait for it */
  const switchTo = async (element: EdahaArticle, mode: string) => {
    modeButton(element, mode).click();
    await settle(element);
  };

  it("should edit the body as Markdown and switch back to rich text", async () => {
    const { api, element } = await setup();
    expect(modeButton(element, "wysiwyg").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(
      [...element.querySelectorAll(".body-modes button")].map((b) =>
        b.textContent?.trim(),
      ),
    ).toEqual(["WYSIWYG", "Markdown", "Preview"]);
    await switchTo(element, "markdown");
    expect(api.toMarkdown).toHaveBeenCalledWith("<p>Body</p>", {
      type: "article",
      slug: "hello",
    });
    expect(modeButton(element, "markdown").getAttribute("aria-pressed")).toBe(
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

    input(find<HTMLInputElement>(field(element, "title"), "input"), "Changed");
    input(find<HTMLInputElement>(field(element, "tags[0]"), "input"), "Other");
    await editBody(element, "<p>Body</p>");
    await settle(element);
    expect(marked(element)).toEqual(["Title", "Tags"]);
    await editBody(element, "<p>New body</p>");
    expect(marked(element)).toEqual(["Title", "Body", "Tags"]);
    expect(button(element, "Reset…").disabled).toBe(false);

    await element.save();
    await settle(element);
    expect(marked(element)).toEqual([]);
    expect(element.dirty).toBe(false);
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
      [...element.querySelectorAll(".edaha-article-controls button")].map((b) =>
        b.textContent?.trim(),
      ),
    ).toEqual(["Save", "Reset…", "Delete…"]);
  });
});
