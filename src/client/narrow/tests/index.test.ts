// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { isNarrow, NARROW_QUERY, onNarrowChange } from "..";

afterEach(() => {
  // @ts-expect-error -- jsdom has no matchMedia
  delete window.matchMedia;
});

/** A fake matchMedia, matching or not */
const fakeMatchMedia = (matches: boolean) => {
  const query = {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  window.matchMedia = vi.fn(() => query) as unknown as typeof window.matchMedia;
  return query;
};

describe("narrow screens", () => {
  it("should tell whether the screen is narrow", () => {
    expect(isNarrow()).toBe(false);
    fakeMatchMedia(true);
    expect(isNarrow()).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith(NARROW_QUERY);
    fakeMatchMedia(false);
    expect(isNarrow()).toBe(false);
  });

  it("should call a function when the screen becomes narrow or wide, until stopped", () => {
    const query = fakeMatchMedia(false);
    const listener = vi.fn();
    const stop = onNarrowChange(listener);
    expect(query.addEventListener).toHaveBeenCalledWith("change", listener);
    stop();
    expect(query.removeEventListener).toHaveBeenCalledWith("change", listener);
  });

  it("should do nothing where the browser can't tell", () => {
    expect(() => onNarrowChange(vi.fn())()).not.toThrow();
  });
});
