// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { defineElement } from "..";

describe("defineElement", () => {
  it("should define an element only once", () => {
    class First extends HTMLElement {}
    class Second extends HTMLElement {}
    defineElement("test-define-once", First);
    defineElement("test-define-once", Second);
    expect(customElements.get("test-define-once")).toBe(First);
  });
});
