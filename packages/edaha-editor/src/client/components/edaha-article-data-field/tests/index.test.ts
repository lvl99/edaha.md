// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "..";
import type { EdahaArticleDataField, FieldChange } from "..";
import type { EdahaRichtext } from "../../edaha-richtext";
import type { EdahaMarkdown } from "../../edaha-markdown";
import { button, find, input, mount } from "../../../../shared/tests/helpers";

afterEach(() => document.body.replaceChildren());

/** Record field-change events */
const record = (element: HTMLElement) => {
  const changes: FieldChange[] = [];
  element.addEventListener("field-change", (e) =>
    changes.push((e as CustomEvent<FieldChange>).detail),
  );
  return { changes };
};

describe("edaha-article-data-field", () => {
  it("should render a labelled text input and report changes", async () => {
    const field = await mount<EdahaArticleDataField>(
      "edaha-article-data-field",
      {
        name: "author[name]",
        label: "Name",
        placeholder: "John",
        value: "Matt",
      },
    );
    const { changes } = record(field);
    const control = find<HTMLInputElement>(field, "input");
    expect(find(field, "label").getAttribute("for")).toBe("field-author-name-");
    expect(control.id).toBe("field-author-name-");
    expect(control.type).toBe("text");
    expect(control.placeholder).toBe("John");
    expect(control.value).toBe("Matt");
    input(control, "Ana");
    expect(changes).toEqual([{ name: "author[name]", value: "Ana" }]);
    expect(field.value).toBe("Ana");
  });

  it("should mark a changed field's label with an asterisk", async () => {
    const field = await mount<EdahaArticleDataField>(
      "edaha-article-data-field",
      {
        name: "title",
        label: "Title",
      },
    );
    expect(field.querySelector(".changed")).toBeNull();
    field.changed = true;
    await field.updateComplete;
    expect(find(field, "label").textContent?.replace(/\s+/g, " ").trim()).toBe(
      "Title *",
    );
    expect(find(field, "label .changed").title).toBe(
      "Changed since it was saved",
    );
  });

  it("should render other input types without a label", async () => {
    const field = await mount<EdahaArticleDataField>(
      "edaha-article-data-field",
      {
        name: "date",
        type: "datetime-local",
        disabled: true,
      },
    );
    expect(field.querySelector("label")).toBeNull();
    const control = find<HTMLInputElement>(field, "input");
    expect(control.type).toBe("datetime-local");
    expect(control.disabled).toBe(true);
  });

  it("should render textareas", async () => {
    const field = await mount<EdahaArticleDataField>(
      "edaha-article-data-field",
      {
        name: "excerpt",
        type: "textarea",
        rows: 5,
        value: "Short",
      },
    );
    const { changes } = record(field);
    const control = find<HTMLTextAreaElement>(field, "textarea");
    expect(control.rows).toBe(5);
    input(control, "Longer");
    expect(changes).toEqual([{ name: "excerpt", value: "Longer" }]);
  });

  it("should render selects with the current option selected", async () => {
    const field = await mount<EdahaArticleDataField>(
      "edaha-article-data-field",
      {
        name: "status",
        type: "select",
        options: [
          { value: "published", label: "Published" },
          { value: "draft", label: "Draft" },
        ],
        value: "draft",
      },
    );
    const { changes } = record(field);
    const control = find<HTMLSelectElement>(field, "select");
    expect(control.value).toBe("draft");
    input(control, "published", "change");
    expect(changes).toEqual([{ name: "status", value: "published" }]);
  });

  it("should render rich text and report its HTML", async () => {
    const uploadImage = vi.fn();
    const embedTools = { embeds: [], edit: vi.fn(), loadFrame: vi.fn() };
    const field = await mount<EdahaArticleDataField>(
      "edaha-article-data-field",
      {
        name: "body",
        type: "richtext",
        value: "<p>Hi</p>",
        uploadImage,
        embedTools,
      },
    );
    const { changes } = record(field);
    const outer = vi.fn();
    document.body.addEventListener("richtext-change", outer);
    const richtext = find<EdahaRichtext>(field, "edaha-richtext");
    expect(richtext.uploadImage).toBe(uploadImage);
    expect(richtext.embedTools).toBe(embedTools);
    richtext.value = "<p>Changed</p>";
    // Typing fires the browser's own input events, which aren't changes of the field
    find(richtext, ".ProseMirror").dispatchEvent(
      new Event("input", { bubbles: true }),
    );
    expect(changes).toEqual([]);
    richtext.dispatchEvent(new Event("richtext-change", { bubbles: true }));
    expect(changes).toEqual([{ name: "body", value: "<p>Changed</p>" }]);
    // The rich text's change event doesn't escape the field
    expect(outer).not.toHaveBeenCalled();
    document.body.removeEventListener("richtext-change", outer);
  });

  it("should offer a button choosing or uploading a file, and no file input, for empty file fields", async () => {
    const field = await mount<EdahaArticleDataField>(
      "edaha-article-data-field",
      {
        name: "thumbnail",
        type: "file",
        label: "Thumbnail",
        accept: "image/png",
        chooseFile: vi.fn(),
        disabled: true,
      },
    );
    expect(field.querySelector("input")).toBeNull();
    expect(field.querySelector(".file-current")).toBeNull();
    const choose = find<HTMLButtonElement>(field, "button.btn.btn-choose-file");
    expect(choose.id).not.toBe("");
    expect(choose.disabled).toBe(true);
    // The label isn't tied to the button, which its own text names
    expect(find<HTMLLabelElement>(field, "label").htmlFor).toBe("");
  });

  it("should give rich text and Markdown fields the file chooser and embed tools", async () => {
    const chooseFile = vi.fn();
    const embedTools = { embeds: [], edit: vi.fn(), loadFrame: vi.fn() };
    const richtext = await mount<EdahaArticleDataField>(
      "edaha-article-data-field",
      { name: "body", type: "richtext", chooseFile },
    );
    expect(find<EdahaRichtext>(richtext, "edaha-richtext").chooseFile).toBe(
      chooseFile,
    );
    const markdown = await mount<EdahaArticleDataField>(
      "edaha-article-data-field",
      { name: "bodyMarkdown", type: "markdown", chooseFile, embedTools },
    );
    expect(find<EdahaMarkdown>(markdown, "edaha-markdown").chooseFile).toBe(
      chooseFile,
    );
    expect(find<EdahaMarkdown>(markdown, "edaha-markdown").embedTools).toBe(
      embedTools,
    );
  });

  it("should set a file field to a chosen existing file, of the kind it accepts", async () => {
    const field = await mount<EdahaArticleDataField>(
      "edaha-article-data-field",
      {
        name: "thumbnail",
        type: "file",
        label: "Thumbnail",
        accept: "image/png",
        allowchange: true,
      },
    );
    expect(field.querySelector(".btn-choose-file")).toBeNull();
    const chooseFile = vi
      .fn()
      .mockResolvedValueOnce({
        url: "/news/a/cat.png",
        name: "cat.png",
        kind: "image",
      })
      .mockResolvedValueOnce(undefined);
    field.chooseFile = chooseFile;
    await field.updateComplete;
    const { changes } = record(field);
    const choose = find<HTMLButtonElement>(field, ".btn-choose-file");
    expect(choose.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "Choose or upload file for Thumbnail",
    );
    // With the file browser's icon
    expect(choose.firstElementChild!.classList).toContain("icon-folder_open");
    choose.click();
    await vi.waitFor(() =>
      expect(changes).toEqual([
        { name: "thumbnail", value: "/news/a/cat.png" },
      ]),
    );
    expect(chooseFile).toHaveBeenCalledWith("image");
    await field.updateComplete;
    find<HTMLButtonElement>(field, ".btn-choose-file").click();
    await new Promise((resolve) => setTimeout(resolve));
    expect(changes).toHaveLength(1);

    // Fields taking other files show any kind first
    field.accept = "image/png, application/pdf";
    await field.updateComplete;
    find<HTMLButtonElement>(field, ".btn-choose-file").click();
    expect(chooseFile).toHaveBeenLastCalledWith(undefined);
  });

  it("should show the current file with an image preview", async () => {
    const field = await mount<EdahaArticleDataField>(
      "edaha-article-data-field",
      {
        name: "thumbnail",
        type: "file",
        value: "thumb.png",
        preview: true,
        previewUrl: "/files/article/a/thumb.png",
      },
    );
    expect(find(field, ".file-current span").textContent).toBe("thumb.png");
    expect(
      find<HTMLImageElement>(field, ".file-current img").getAttribute("src"),
    ).toBe("/files/article/a/thumb.png");
    // On a checkerboard, so transparent parts show
    expect(
      find(field, ".file-current img").classList.contains("checkerboard"),
    ).toBe(true);
    // Without allowchange, a set file can't be replaced
    field.chooseFile = vi.fn();
    await field.updateComplete;
    expect(field.querySelector(".btn-choose-file")).toBeNull();
  });

  it("should only preview images, and allow changing files", async () => {
    const field = await mount<EdahaArticleDataField>(
      "edaha-article-data-field",
      {
        name: "attachments[0][url]",
        type: "file",
        value: "guide.pdf",
        preview: true,
        previewUrl: "/files/article/a/guide.pdf",
        allowchange: true,
        chooseFile: vi.fn(),
      },
    );
    expect(field.querySelector("img")).toBeNull();
    expect(field.querySelector(".btn-choose-file")).not.toBeNull();
  });

  it("should clear the value", async () => {
    const field = await mount<EdahaArticleDataField>(
      "edaha-article-data-field",
      {
        name: "excerpt",
        value: "Text",
        allowclear: true,
      },
    );
    const { changes } = record(field);
    button(field, "Clear").click();
    await field.updateComplete;
    expect(changes).toEqual([{ name: "excerpt", value: "" }]);
    expect(field.querySelector("button.btn-clear")).toBeNull();
  });
});
