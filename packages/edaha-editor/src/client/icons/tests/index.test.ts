// @vitest-environment jsdom
import { html, render } from "lit";
import { afterEach, describe, expect, it } from "vitest";
import { icon, ICONS, TOOLBAR_ICONS, toolbarButtonContent } from "..";

afterEach(() => document.body.replaceChildren());

/** Render a template into the page and return its container */
const show = (template: unknown) => {
  const container = document.createElement("div");
  document.body.append(container);
  render(html`${template}`, container);
  return container;
};

describe("icons", () => {
  it("should bundle each icon as an SVG", () => {
    for (const svg of Object.values(ICONS))
      expect(svg).toMatch(/^<svg [^>]*viewBox="0 -960 960 960"/);
  });

  it("should give every toolbar button a bundled icon", () => {
    for (const name of Object.values(TOOLBAR_ICONS))
      expect(ICONS[name]).toBeDefined();
  });

  it("should render an icon hidden from screen readers", () => {
    const element = show(icon("menu")).querySelector(".icon")!;
    expect(element.getAttribute("aria-hidden")).toBe("true");
    expect(element.classList.contains("icon-menu")).toBe(true);
    expect(element.querySelector("svg")).not.toBeNull();
  });

  it("should render a toolbar button's icon and label, or its label alone without an icon", () => {
    const container = show(toolbarButtonContent("Bold"));
    expect(container.querySelector(".icon-format_bold")).not.toBeNull();
    expect(container.querySelector(".visually-hidden")?.textContent).toBe(
      "Bold",
    );
    expect(show(toolbarButtonContent("Other")).textContent).toBe("Other");
  });
});
