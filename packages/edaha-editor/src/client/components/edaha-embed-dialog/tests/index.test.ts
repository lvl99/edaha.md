// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "..";
import type { EdahaEmbedDialog } from "..";
import type { EmbedInfo } from "../../../../server/types";
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

const EMBEDS: EmbedInfo[] = [
  {
    key: "youtube",
    name: "YouTube video",
    description: "A YouTube video player",
    icon: '<svg id="yt"></svg>',
  },
  { key: "mermaidjs", name: "MermaidJS diagram" },
];

/** The dialog's radio button for a kind of embed */
const kind = (element: HTMLElement, key: string) =>
  find<HTMLInputElement>(element, `input[name="embed-kind"][value="${key}"]`);

/** The dialog's content text box */
const content = (element: HTMLElement) =>
  find<HTMLTextAreaElement>(element, "#embed-dialog-content");

/** Submit the dialog's form, as its Add or Save button would */
const submit = (element: HTMLElement) =>
  find<HTMLFormElement>(element, "form").dispatchEvent(
    new Event("submit", { cancelable: true }),
  );

describe("edaha-embed-dialog", () => {
  it("should add an embed: choose its kind (with descriptions and icons), then write its content", async () => {
    const element = await mount<EdahaEmbedDialog>("edaha-embed-dialog");
    const result = element.edit(EMBEDS);
    await settle(element);
    const dialog = find<HTMLDialogElement>(element, "dialog");
    expect(dialog.open).toBe(true);
    expect(find(element, "#embed-dialog-title").textContent?.trim()).toBe(
      "Add embed",
    );
    expect(dialog.getAttribute("aria-labelledby")).toBe("embed-dialog-title");
    expect(find(element, "legend").textContent).toBe("Kind of embed");
    const labels = [...element.querySelectorAll(".embed-dialog-kind")];
    expect(
      labels.map((label) => label.textContent?.replace(/\s+/g, " ").trim()),
    ).toEqual(["YouTube video A YouTube video player", "MermaidJS diagram"]);
    expect(labels[0]!.querySelector(".embed-icon svg")!.id).toBe("yt");
    // With several kinds, none is chosen, and choosing one comes first
    expect(document.activeElement).toBe(kind(element, "youtube"));
    expect(find(element, ".embed-dialog-hint").textContent).toContain(
      "Choose a kind of embed",
    );
    // Without a kind and content, it isn't added
    submit(element);
    expect(dialog.open).toBe(true);
    kind(element, "youtube").click();
    await element.updateComplete;
    expect(find(element, ".embed-dialog-hint").textContent?.trim()).toBe(
      "What the YouTube video shows, e.g. a URL or code.",
    );
    input(content(element), "   ");
    submit(element);
    expect(dialog.open).toBe(true);
    input(content(element), "  https://youtu.be/x \n");
    submit(element);
    expect(await result).toEqual({
      key: "youtube",
      content: "https://youtu.be/x",
    });
    expect(dialog.open).toBe(false);
  });

  it("should change an embed, starting with its kind and content", async () => {
    const element = await mount<EdahaEmbedDialog>("edaha-embed-dialog");
    const result = element.edit(EMBEDS, {
      key: "mermaidjs",
      content: "graph TD;",
    });
    await settle(element);
    expect(find(element, "#embed-dialog-title").textContent?.trim()).toBe(
      "Change embed",
    );
    expect(kind(element, "mermaidjs").checked).toBe(true);
    expect(content(element).value).toBe("graph TD;");
    expect(document.activeElement).toBe(content(element));
    expect(button(element, "Save")).toBeTruthy();
    input(content(element), "graph LR;");
    submit(element);
    expect(await result).toEqual({ key: "mermaidjs", content: "graph LR;" });
  });

  it("should start with the only kind of embed there is", async () => {
    const element = await mount<EdahaEmbedDialog>("edaha-embed-dialog");
    void element.edit([EMBEDS[1]!]);
    await settle(element);
    expect(kind(element, "mermaidjs").checked).toBe(true);
    expect(document.activeElement).toBe(content(element));
  });

  it("should give nothing when closed or cancelled, or opened again", async () => {
    const element = await mount<EdahaEmbedDialog>("edaha-embed-dialog");
    const closed = element.edit(EMBEDS);
    await settle(element);
    button(element, "Close").click();
    expect(await closed).toBeUndefined();
    const cancelled = element.edit(EMBEDS);
    await settle(element);
    button(element, "Cancel").click();
    expect(await cancelled).toBeUndefined();
    const replaced = element.edit(EMBEDS);
    void element.edit(EMBEDS);
    expect(await replaced).toBeUndefined();
  });

  it("should check the content before saving it, showing why it isn't valid", async () => {
    const element = await mount<EdahaEmbedDialog>("edaha-embed-dialog");
    let answer: (errors: string[]) => void = () => undefined;
    const validate = vi.fn(
      () => new Promise<string[]>((resolve) => (answer = resolve)),
    );
    const result = element.edit(
      EMBEDS,
      { key: "youtube", content: "bad" },
      validate,
    );
    await settle(element);
    const dialog = find<HTMLDialogElement>(element, "dialog");
    submit(element);
    await element.updateComplete;
    expect(validate).toHaveBeenCalledWith({ key: "youtube", content: "bad" });
    expect(button(element, "Checking…").getAttribute("aria-disabled")).toBe(
      "true",
    );
    // Saving again while it is checked does nothing
    submit(element);
    expect(validate).toHaveBeenCalledOnce();
    answer(["Not a URL", "No video ID"]);
    await settle(element);
    expect(dialog.open).toBe(true);
    expect(
      [...element.querySelectorAll("#embed-dialog-errors li")].map(
        (li) => li.textContent,
      ),
    ).toEqual(["Not a URL", "No video ID"]);
    expect(find(element, "#embed-dialog-errors").getAttribute("role")).toBe(
      "alert",
    );
    expect(content(element).getAttribute("aria-invalid")).toBe("true");
    expect(content(element).getAttribute("aria-describedby")).toBe(
      "embed-dialog-errors embed-dialog-content-hint",
    );
    expect(document.activeElement).toBe(content(element));
    // Changing the content clears the errors, until it is checked again
    input(content(element), "https://youtu.be/x");
    await element.updateComplete;
    expect(element.querySelector("#embed-dialog-errors li")).toBeNull();
    expect(content(element).getAttribute("aria-invalid")).toBe("false");
    submit(element);
    answer([]);
    expect(await result).toEqual({
      key: "youtube",
      content: "https://youtu.be/x",
    });
  });

  it("should check again when the embed changes while it is checked, or say when it can't be checked", async () => {
    const element = await mount<EdahaEmbedDialog>("edaha-embed-dialog");
    let answer: (errors: string[]) => void = () => undefined;
    const validate = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<string[]>((resolve) => (answer = resolve)),
      )
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue([]);
    const result = element.edit(
      EMBEDS,
      { key: "youtube", content: "a" },
      validate,
    );
    await settle(element);
    submit(element);
    // Another kind is chosen while the first is checked
    kind(element, "mermaidjs").click();
    answer(["Old problem"]);
    await settle(element);
    expect(element.querySelector("#embed-dialog-errors li")).toBeNull();
    expect(find<HTMLDialogElement>(element, "dialog").open).toBe(true);
    submit(element);
    await settle(element);
    expect(find(element, "#embed-dialog-errors li").textContent).toBe(
      "The content couldn't be checked: offline",
    );
    // Choosing a kind clears the errors
    kind(element, "youtube").click();
    await element.updateComplete;
    expect(element.querySelector("#embed-dialog-errors li")).toBeNull();
    submit(element);
    expect(await result).toEqual({ key: "youtube", content: "a" });
  });

  it("should explain when the site has no embeds", async () => {
    const element = await mount<EdahaEmbedDialog>("edaha-embed-dialog");
    void element.edit([]);
    await settle(element);
    expect(find(element, "[role=alert]").textContent).toContain(
      "This site has no embed plugins",
    );
    expect(button(element, "Add").disabled).toBe(true);
  });
});
