// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "..";

/** Give the page a Clipboard API whose writeText does as given */
const clipboard = (writeText: () => Promise<void>) =>
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn(writeText) },
    configurable: true,
  });

/** Give the page an execCommand that copies or not, recording the selected text and where its box was */
const execCommand = (copied: boolean) => {
  const seen: { text: string; parent: Element | null }[] = [];
  Object.defineProperty(document, "execCommand", {
    value: vi.fn(() => {
      const box = document.querySelector("textarea") as HTMLTextAreaElement;
      seen.push({ text: box.value, parent: box.parentElement });
      return copied;
    }),
    configurable: true,
  });
  return seen;
};

afterEach(() => {
  delete (document as { execCommand?: unknown }).execCommand;
  document.body.replaceChildren();
});

describe("copyText", () => {
  it("should copy with the Clipboard API", async () => {
    clipboard(() => Promise.resolve());
    await copyText("#intro");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("#intro");
  });

  it("should select the text in a hidden box in the container where the Clipboard API isn't allowed", async () => {
    clipboard(() => Promise.reject(new Error("Not allowed")));
    const dialog = document.createElement("dialog");
    document.body.append(dialog);
    const seen = execCommand(true);
    await copyText("/a.png", dialog);
    await copyText("#intro");
    expect(seen).toEqual([
      { text: "/a.png", parent: dialog },
      { text: "#intro", parent: document.body },
    ]);
    // The box is removed afterwards
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("should reject when neither way copies", async () => {
    clipboard(() => Promise.reject(new Error("Not allowed")));
    execCommand(false);
    await expect(copyText("#intro")).rejects.toThrow("Can't copy");
    expect(document.querySelector("textarea")).toBeNull();
  });
});
