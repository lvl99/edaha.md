// @vitest-environment jsdom
import { html, render } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextSort, sortHeading } from "..";

afterEach(() => document.body.replaceChildren());

describe("nextSort", () => {
  it("should sort another column ascending, then descending, then go back to the default order", () => {
    expect(nextSort({}, "title")).toEqual({ sort: "title", order: "asc" });
    expect(nextSort({ sort: "date", order: "desc" }, "title")).toEqual({
      sort: "title",
      order: "asc",
    });
    expect(nextSort({ sort: "title", order: "asc" }, "title")).toEqual({
      sort: "title",
      order: "desc",
    });
    expect(nextSort({ sort: "title", order: "desc" }, "title")).toEqual({});
  });
});

describe("sortHeading", () => {
  /** Render a heading in a table row and return its cell */
  const show = (
    current: Parameters<typeof sortHeading<string>>[2],
    onSort = vi.fn(),
  ) => {
    const row = document.createElement("tr");
    document.body.append(row);
    render(html`${sortHeading("size", "Size", current, onSort)}`, row);
    return row.querySelector("th")!;
  };

  it("should be a button that sorts by its column, saying what pressing it does", () => {
    const onSort = vi.fn();
    const th = show({}, onSort);
    expect(th.getAttribute("scope")).toBe("col");
    expect(th.getAttribute("aria-sort")).toBe("none");
    const button = th.querySelector("button")!;
    expect(button.textContent?.trim()).toBe("Size");
    expect(button.title).toBe("Sort by size, ascending");
    button.click();
    expect(onSort).toHaveBeenCalledWith("size");
    // Another column's sort doesn't show here
    expect(show({ sort: "name", order: "asc" }).getAttribute("aria-sort")).toBe(
      "none",
    );
  });

  it("should show which way its column is sorted", () => {
    const ascending = show({ sort: "size", order: "asc" });
    expect(ascending.getAttribute("aria-sort")).toBe("ascending");
    expect(ascending.textContent).toContain("▲");
    expect(ascending.querySelector("button")!.title).toBe(
      "Sort by size, descending",
    );
    const descending = show({ sort: "size", order: "desc" });
    expect(descending.getAttribute("aria-sort")).toBe("descending");
    expect(descending.textContent).toContain("▼");
    expect(descending.querySelector("button")!.title).toBe(
      "Go back to the default order",
    );
  });
});
