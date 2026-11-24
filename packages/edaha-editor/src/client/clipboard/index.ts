/**
 * Copy text to the clipboard: with the Clipboard API, or where it isn't allowed, by selecting the text in a hidden
 * text box placed in `container` (e.g. an open dialog, as the page behind it can't be focused). Rejects if neither
 * works.
 *
 * @example
 * await copyText("/news/hello/photo.png");
 * await copyText("#intro", dialog); // falls back to a text box inside the dialog
 */
export const copyText = async (
  text: string,
  container: Element = document.body,
): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Try selecting it instead
  }
  const box = document.createElement("textarea");
  box.value = text;
  box.className = "visually-hidden";
  box.setAttribute("aria-hidden", "true");
  container.append(box);
  box.select();
  const copied = document.execCommand("copy");
  box.remove();
  if (!copied) throw new Error("Can't copy");
};
