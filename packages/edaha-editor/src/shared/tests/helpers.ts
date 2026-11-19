import type { LitElement } from "lit";

// jsdom has no layout; ProseMirror measures text when scrolling the selection into view
const noRects = () =>
  Object.assign([], { item: () => null }) as unknown as DOMRectList;
const emptyRect = () => new DOMRect();
Range.prototype.getClientRects ??= noRects;
Range.prototype.getBoundingClientRect ??= emptyRect;
Element.prototype.getClientRects ??= noRects;
document.elementFromPoint ??= () => null;

/**
 * Create an element, set its properties, add it to the page and wait for it to render.
 */
export const mount = async <T extends LitElement>(
  tag: string,
  properties: Partial<T> = {},
): Promise<T> => {
  const element = document.createElement(tag) as T;
  Object.assign(element, properties);
  document.body.append(element);
  await element.updateComplete;
  return element;
};

/** Wait for pending promises and renders */
export const settle = async (element?: LitElement): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await element?.updateComplete;
  }
};

/** Find an element, failing the test if it is missing */
export const find = <T extends Element = HTMLElement>(
  root: ParentNode,
  selector: string,
): T => {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`No element matches ${selector}`);
  return element;
};

/** Set an input's value and fire an event on it */
export const input = (
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
  type = "input",
) => {
  element.value = value;
  element.dispatchEvent(new Event(type, { bubbles: true }));
};

/** Choose a file in a file input (or none) and fire change */
export const chooseFile = (element: HTMLInputElement, file?: File) => {
  Object.defineProperty(element, "files", {
    value: file ? [file] : [],
    configurable: true,
  });
  element.dispatchEvent(new Event("change", { bubbles: true }));
};

/** Find a button by its text */
export const button = (root: ParentNode, text: string): HTMLButtonElement => {
  const match = [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text,
  );
  if (!match) throw new Error(`No button "${text}"`);
  return match;
};
