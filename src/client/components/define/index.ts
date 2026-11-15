/**
 * Define a custom element once (modules can be loaded more than once, e.g. in tests).
 *
 * @example
 * defineElement("blog-editor", BlogEditor);
 */
export const defineElement = (
  name: string,
  element: CustomElementConstructor,
): void => {
  if (!customElements.get(name)) customElements.define(name, element);
};
