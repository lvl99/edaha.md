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

const YOUTUBE: EmbedInfo = {
  key: "youtube",
  name: "YouTube video",
  description: "A YouTube video player",
  icon: '<svg id="yt"></svg>',
};

const MERMAID: EmbedInfo = { key: "mermaidjs", name: "MermaidJS diagram" };

/** The dialog's content text box */
const content = (element: HTMLElement) =>
  find<HTMLTextAreaElement>(element, "#embed-dialog-content");

/** The dialog's title */
const title = (element: HTMLElement) =>
  find(element, "#embed-dialog-title").textContent?.replace(/\s+/g, " ").trim();

/** Submit the dialog's form, as its Add or Save button would */
const submit = (element: HTMLElement) =>
  find<HTMLFormElement>(element, "form").dispatchEvent(
    new Event("submit", { cancelable: true }),
  );

describe("edaha-embed-dialog", () => {
  it("should add an embed of a kind, asking only for its content", async () => {
    const element = await mount<EdahaEmbedDialog>("edaha-embed-dialog");
    const result = element.edit(YOUTUBE, "", true);
    await settle(element);
    const dialog = find<HTMLDialogElement>(element, "dialog");
    expect(dialog.open).toBe(true);
    expect(title(element)).toBe("Add YouTube video");
    expect(dialog.getAttribute("aria-labelledby")).toBe("embed-dialog-title");
    // What it embeds, with its icon; its kind can't be changed
    expect(find(element, ".embed-dialog-about").textContent?.trim()).toBe(
      "A YouTube video player",
    );
    expect(find(element, ".embed-dialog-about .embed-icon svg").id).toBe("yt");
    expect(element.querySelector("input, select, fieldset")).toBeNull();
    expect(document.activeElement).toBe(content(element));
    expect(find(element, ".embed-dialog-hint").textContent?.trim()).toBe(
      "What the YouTube video shows, e.g. a URL or code.",
    );
    // Without content, it isn't added
    input(content(element), "   ");
    submit(element);
    expect(dialog.open).toBe(true);
    input(content(element), "  https://youtu.be/x \n");
    submit(element);
    expect(await result).toBe("https://youtu.be/x");
    expect(dialog.open).toBe(false);
  });

  it("should change an embed block's content", async () => {
    const element = await mount<EdahaEmbedDialog>("edaha-embed-dialog");
    const result = element.edit(MERMAID, "graph TD;", false);
    await settle(element);
    expect(title(element)).toBe("Change MermaidJS diagram");
    // Without a description or icon, the line is empty
    expect(find(element, ".embed-dialog-about").textContent?.trim()).toBe("");
    expect(content(element).value).toBe("graph TD;");
    expect(button(element, "Save")).toBeTruthy();
    input(content(element), "graph LR;");
    submit(element);
    expect(await result).toBe("graph LR;");
  });

  it("should give nothing when closed or cancelled, or opened again", async () => {
    const element = await mount<EdahaEmbedDialog>("edaha-embed-dialog");
    // Before it is opened, it names no kind
    expect(title(element)).toBe("Add embed");
    submit(element);
    const closed = element.edit(YOUTUBE, "", true);
    await settle(element);
    button(element, "Close").click();
    expect(await closed).toBeUndefined();
    const cancelled = element.edit(YOUTUBE, "", true);
    await settle(element);
    button(element, "Cancel").click();
    expect(await cancelled).toBeUndefined();
    const replaced = element.edit(YOUTUBE, "", true);
    void element.edit(YOUTUBE, "", true);
    expect(await replaced).toBeUndefined();
  });

  it("should check the content before saving it, showing why it isn't valid", async () => {
    const element = await mount<EdahaEmbedDialog>("edaha-embed-dialog");
    let answer: (errors: string[]) => void = () => undefined;
    const validate = vi.fn(
      () => new Promise<string[]>((resolve) => (answer = resolve)),
    );
    const result = element.edit(YOUTUBE, "bad", false, validate);
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
    expect(await result).toBe("https://youtu.be/x");
  });

  it("should check again when the content changes while it is checked, or say when it can't be checked", async () => {
    const element = await mount<EdahaEmbedDialog>("edaha-embed-dialog");
    let answer: (errors: string[]) => void = () => undefined;
    const validate = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<string[]>((resolve) => (answer = resolve)),
      )
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue([]);
    const result = element.edit(YOUTUBE, "a", false, validate);
    await settle(element);
    submit(element);
    // The content changes while it is checked
    input(content(element), "b");
    answer(["Old problem"]);
    await settle(element);
    expect(element.querySelector("#embed-dialog-errors li")).toBeNull();
    expect(find<HTMLDialogElement>(element, "dialog").open).toBe(true);
    submit(element);
    await settle(element);
    expect(find(element, "#embed-dialog-errors li").textContent).toBe(
      "The content couldn't be checked: offline",
    );
    submit(element);
    expect(await result).toBe("b");
  });
});
