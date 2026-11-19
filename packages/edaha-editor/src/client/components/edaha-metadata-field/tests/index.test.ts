// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "..";
import type { EdahaMetadataField } from "..";
import type { MetadataSchema } from "@lvl99dotcom/edaha.md/generator/metadata";
import {
  button,
  chooseFile,
  find,
  input,
  mount,
  settle,
} from "../../../../shared/tests/helpers";

afterEach(() => document.body.replaceChildren());

/** A field for a schema and value, with its changes and blurs recorded */
const setup = async (
  path: string,
  schema: MetadataSchema,
  value?: unknown,
  properties: Partial<EdahaMetadataField> = {},
) => {
  const element = await mount<EdahaMetadataField>("edaha-metadata-field", {
    path,
    schema,
    value,
    ...properties,
  });
  const changes: { path: string; value: unknown }[] = [];
  const blurs: string[] = [];
  element.addEventListener("metadata-change", (event) =>
    changes.push((event as CustomEvent).detail),
  );
  element.addEventListener("metadata-blur", (event) =>
    blurs.push((event as CustomEvent).detail),
  );
  return { element, changes, blurs };
};

describe("edaha-metadata-field", () => {
  it("should show a labelled input with its description, information and problems above it", async () => {
    const { element, changes } = await setup(
      "rating",
      {
        title: "Rating",
        description: "Out of 10",
        type: "number",
        minimum: 0,
        maximum: 10,
        $edahaField: { info: "Whole numbers", number: { step: 1 } },
      },
      12,
      {
        required: true,
        problems: [
          { path: "rating", message: "must be at most 10", level: "error" },
          { path: "other", message: "is wrong", level: "error" },
        ],
      },
    );
    const field = find<HTMLInputElement>(element, "input");
    expect(field.type).toBe("number");
    expect(field.id).toBe("meta-rating");
    expect(field.value).toBe("12");
    expect(
      [...field.attributes]
        .filter(({ name }) => ["min", "max", "step"].includes(name))
        .map(({ name, value }) => `${name}=${value}`),
    ).toEqual(["min=0", "max=10", "step=1"]);
    expect(field.required).toBe(true);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")).toBe(
      "meta-rating-description meta-rating-info meta-rating-problems",
    );
    expect(find(element, 'label[for="meta-rating"]').textContent).toBe(
      "Rating *",
    );
    expect(find(element, "#meta-rating-description").textContent?.trim()).toBe(
      "Out of 10",
    );
    expect(find(element, "#meta-rating-info").textContent).toBe(
      "Whole numbers",
    );
    // Only its own problems show, above the input
    const problems = find(element, "#meta-rating-problems");
    expect(problems.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "Rating must be at most 10",
    );
    expect(
      problems.compareDocumentPosition(field) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    input(field, "7");
    input(field, "");
    expect(changes).toEqual([
      { path: "rating", value: 7 },
      { path: "rating", value: undefined },
    ]);
  });

  it("should show text kinds as inputs of that type, and textareas", async () => {
    for (const kind of ["email", "url", "tel", "color", "date", "time"]) {
      const { element } = await setup("a", { $edahaField: { [kind]: true } });
      expect(find<HTMLInputElement>(element, "input").type, kind).toBe(kind);
      expect(
        find<HTMLInputElement>(element, "input").hasAttribute(
          "aria-describedby",
        ),
      ).toBe(false);
      element.remove();
    }
    const { element, changes } = await setup(
      "notes",
      { maxLength: 300, $edahaField: { textarea: { rows: 5 } } },
      "Hello",
    );
    const box = find<HTMLTextAreaElement>(element, "textarea");
    expect(box.rows).toBe(5);
    expect(box.maxLength).toBe(300);
    expect(box.value).toBe("Hello");
    input(box, "Bye");
    expect(changes).toEqual([{ path: "notes", value: "Bye" }]);
    // Without rows, three
    const { element: plain } = await setup("b", {
      $edahaField: { textarea: true },
    });
    expect(find<HTMLTextAreaElement>(plain, "textarea").rows).toBe(3);
  });

  it("should show checkboxes", async () => {
    const { element, changes } = await setup(
      "featured",
      { type: "boolean", $edahaField: { checkbox: true } },
      true,
    );
    const box = find<HTMLInputElement>(element, "input");
    expect(box.checked).toBe(true);
    box.checked = false;
    box.dispatchEvent(new Event("change"));
    expect(changes).toEqual([{ path: "featured", value: false }]);
  });

  it("should show selects as dropdowns or lists, choosing one or several", async () => {
    const choices = { enum: ["a", "b"], type: "string" };
    const { element, changes } = await setup(
      "letter",
      {
        ...choices,
        $edahaField: {
          select: { options: [{ value: "a", title: "A" }, { value: "b" }] },
        },
      },
      "b",
    );
    const select = find<HTMLSelectElement>(element, "select");
    expect([...select.options].map((o) => o.textContent?.trim())).toEqual([
      "—",
      "A",
      "b",
    ]);
    expect(select.value).toBe("b");
    expect(select.hasAttribute("size")).toBe(false);
    input(select, "a", "change");
    input(select, "", "change");
    expect(changes).toEqual([
      { path: "letter", value: "a" },
      { path: "letter", value: undefined },
    ]);

    const { element: list } = await setup("letter", {
      ...choices,
      $edahaField: { select: { list: true } },
    });
    expect(find<HTMLSelectElement>(list, "select").size).toBe(3);

    const several = await setup(
      "letters",
      {
        type: "array",
        items: { enum: [1, 2, 3] },
        $edahaField: { select: { multiple: true, list: true } },
      },
      [2],
    );
    const multiple = find<HTMLSelectElement>(several.element, "select");
    expect(multiple.multiple).toBe(true);
    expect(multiple.size).toBe(3);
    expect([...multiple.selectedOptions].map((o) => o.value)).toEqual(["2"]);
    multiple.options[0]!.selected = true;
    multiple.dispatchEvent(new Event("change"));
    expect(several.changes).toEqual([{ path: "letters", value: [1, 2] }]);
    const { element: none } = await setup("letters", {
      type: "array",
      items: { enum: [1] },
      $edahaField: { select: { multiple: true } },
    });
    expect([
      ...find<HTMLSelectElement>(none, "select").selectedOptions,
    ]).toEqual([]);
  });

  it("should mark selects and file fields with problems as invalid", async () => {
    const problems = [
      { path: "a", message: "is wrong", level: "error" as const },
    ];
    const { element: select } = await setup(
      "a",
      { enum: ["x"], $edahaField: { select: true } },
      "y",
      { problems },
    );
    expect(find(select, "select").getAttribute("aria-invalid")).toBe("true");
    const { element: file } = await setup(
      "a",
      { $edahaField: { file: true } },
      undefined,
      { problems },
    );
    expect(find(file, "input").getAttribute("aria-invalid")).toBe("true");
  });

  it("should show radio buttons with their descriptions", async () => {
    const { element, changes } = await setup(
      "mood",
      {
        enum: ["calm", "loud"],
        $edahaField: {
          radio: {
            options: [
              { value: "calm", title: "Calm", description: "Quiet" },
              { value: "loud" },
            ],
          },
        },
      },
      "calm",
      { required: true },
    );
    expect(find(element, "legend").textContent).toBe("mood");
    const radios = [...element.querySelectorAll<HTMLInputElement>("input")];
    expect(radios.map((r) => [r.checked, r.required])).toEqual([
      [true, true],
      [false, true],
    ]);
    expect(radios[0]!.getAttribute("aria-describedby")).toBe("meta-mood-0");
    expect(find(element, "#meta-mood-0").textContent).toBe("Quiet");
    expect(radios[1]!.hasAttribute("aria-describedby")).toBe(false);
    radios[1]!.dispatchEvent(new Event("change"));
    expect(changes).toEqual([{ path: "mood", value: "loud" }]);
  });

  it("should upload a chosen file, show and clear the current one", async () => {
    const uploadFile = vi
      .fn()
      .mockResolvedValueOnce("hero.png")
      .mockRejectedValueOnce(new Error("Upload failed"));
    const { element, changes } = await setup(
      "featured",
      {
        title: "Featured",
        $edahaField: { file: { accept: "image/*" } },
      },
      "old.png",
      {
        uploadFile,
        fileUrl: (name: string) => `/files/news/hi/${name}`,
        required: true,
      },
    );
    expect(find(element, ".metadata-file a").getAttribute("href")).toBe(
      "/files/news/hi/old.png",
    );
    const chooser = find<HTMLInputElement>(element, 'input[type="file"]');
    expect(chooser.accept).toBe("image/*");
    // A file is set, so choosing another isn't required
    expect(chooser.required).toBe(false);
    chooseFile(chooser, new File(["x"], "Hero.png"));
    await settle(element);
    chooseFile(chooser, new File(["x"], "bad.png"));
    await settle(element);
    chooseFile(chooser);
    button(element, "Clear Featured").click();
    expect(changes).toEqual([
      { path: "featured", value: "hero.png" },
      { path: "featured", value: undefined },
    ]);
    expect(uploadFile).toHaveBeenCalledTimes(2);

    // Without an uploader (an unsaved article), files can't be chosen; names without a URL aren't linked
    const { element: unsaved } = await setup(
      "featured",
      { $edahaField: { file: true } },
      "x.png",
    );
    expect(find<HTMLInputElement>(unsaved, 'input[type="file"]').disabled).toBe(
      true,
    );
    expect(unsaved.querySelector(".metadata-file a")).toBeNull();
    chooseFile(
      find<HTMLInputElement>(unsaved, 'input[type="file"]'),
      new File(["x"], "y.png"),
    );
    const { element: empty } = await setup("featured", {
      $edahaField: { file: true },
    });
    expect(empty.querySelector(".metadata-file")).toBeNull();
  });

  it("should set a file field to a chosen existing file, of the kind it accepts", async () => {
    const chooseFile = vi
      .fn()
      .mockResolvedValueOnce({
        url: "/news/a/hero.png",
        name: "hero.png",
        kind: "image",
      })
      .mockResolvedValueOnce(undefined);
    const { element, changes } = await setup(
      "featured",
      { title: "Featured", $edahaField: { file: { accept: "image/*" } } },
      undefined,
      { chooseFile },
    );
    const choose = button(element, "Choose existing file… for Featured");
    choose.click();
    await vi.waitFor(() =>
      expect(changes).toEqual([
        { path: "featured", value: "/news/a/hero.png" },
      ]),
    );
    expect(chooseFile).toHaveBeenCalledWith("image");
    choose.click();
    await new Promise((resolve) => setTimeout(resolve));
    expect(changes).toHaveLength(1);

    // Without a chooser, there's no button
    const { element: without } = await setup("featured", {
      $edahaField: { file: true },
    });
    expect(without.querySelector(".btn-choose-file")).toBeNull();
  });

  it("should show a map's fields in a group, marking the required ones", async () => {
    const { element, changes } = await setup(
      "credit",
      {
        title: "Credit",
        type: "object",
        description: "Who made it",
        properties: {
          name: { type: "string", $edahaField: { text: true } },
          email: { type: "string", $edahaField: { email: true } },
        },
        required: ["name"],
      },
      { name: "Matt" },
      {
        problems: [
          {
            path: "credit/email",
            message: 'must match format "email"',
            level: "error",
          },
        ],
      },
    );
    const group = find(element, "fieldset");
    expect(find(group, "legend").textContent).toBe("Credit");
    expect(group.getAttribute("aria-describedby")).toBe(
      "meta-credit-description",
    );
    const name = find<HTMLInputElement>(element, "#meta-credit-name");
    expect(name.value).toBe("Matt");
    expect(name.required).toBe(true);
    const email = find<HTMLInputElement>(element, "#meta-credit-email");
    expect(email.required).toBe(false);
    expect(email.getAttribute("aria-invalid")).toBe("true");
    input(email, "a@b.c");
    expect(changes).toEqual([{ path: "credit/email", value: "a@b.c" }]);
    // Without a value, its fields are empty, and without problems it isn't described
    const { element: empty } = await setup("credit", {
      type: "object",
      properties: { name: { $edahaField: { text: true } } },
    });
    expect(find<HTMLInputElement>(empty, "input").value).toBe("");
    expect(find(empty, "fieldset").hasAttribute("aria-describedby")).toBe(
      false,
    );
  });

  it("should show a list's items with Delete buttons, and an Add button up to its most", async () => {
    const schema: MetadataSchema = {
      title: "Images",
      type: "array",
      items: { type: "string", $edahaField: { text: true } },
      maxItems: 3,
    };
    const { element, changes } = await setup("images", schema, ["a", "b"]);
    expect(
      [...element.querySelectorAll(".metadata-item label")].map((l) =>
        l.textContent?.trim(),
      ),
    ).toEqual(["Images 1", "Images 2"]);
    input(find<HTMLInputElement>(element, "#meta-images-1"), "c");
    button(element, "Delete Images 1").click();
    button(element, "Add to Images").click();
    expect(changes).toEqual([
      { path: "images/1", value: "c" },
      { path: "images", value: ["b"] },
      { path: "images", value: ["a", "b", undefined] },
    ]);
    element.value = ["a", "b", "c"];
    await element.updateComplete;
    expect(button(element, "Add to Images").disabled).toBe(true);
    // Without a value, or without a most, it can always be added to
    const { element: empty } = await setup("images", {
      ...schema,
      maxItems: undefined,
    });
    expect(empty.querySelectorAll(".metadata-item")).toHaveLength(0);
    expect(button(empty, "Add to Images").disabled).toBe(false);
  });

  it("should fire metadata-blur when focus leaves the field, not when it moves inside it", async () => {
    const { element, blurs } = await setup("credit", {
      type: "object",
      properties: {
        name: { $edahaField: { text: true } },
        email: { $edahaField: { email: true } },
      },
    });
    const outside = document.createElement("button");
    document.body.append(outside);
    const name = find<HTMLInputElement>(element, "#meta-credit-name");
    const email = find<HTMLInputElement>(element, "#meta-credit-email");
    name.focus();
    email.focus();
    // Moving from name to email leaves the name field, but not the group
    expect(blurs).toEqual(["credit/name"]);
    outside.focus();
    expect(blurs).toEqual(["credit/name", "credit/email", "credit"]);
    const list = await setup(
      "tags",
      {
        type: "array",
        items: { $edahaField: { text: true } },
      },
      ["a"],
    );
    find<HTMLInputElement>(list.element, "input").focus();
    outside.focus();
    expect(list.blurs).toEqual(["tags/0", "tags"]);
    const radio = await setup("mood", {
      enum: ["a"],
      $edahaField: { radio: true },
    });
    find<HTMLInputElement>(radio.element, "input").focus();
    outside.focus();
    expect(radio.blurs).toEqual(["mood"]);
  });
});
