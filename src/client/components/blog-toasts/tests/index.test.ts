// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "..";
import { showToast, TOAST_EVENT, type BlogToasts, type ToastMessage } from "..";
import { button, mount } from "../../../../shared/tests/helpers";

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

/** The toasts shown, as [role, class, message] */
const shown = (element: BlogToasts) =>
  [...element.querySelectorAll(".toast")].map((toast) => [
    toast.getAttribute("role"),
    toast.className.trim(),
    toast.querySelector("span")?.textContent,
  ]);

describe("blog-toasts", () => {
  it("should show successes for a while and errors until dismissed", async () => {
    vi.useFakeTimers();
    const element = await mount<BlogToasts>("blog-toasts");
    expect(element.duration).toBe(4000);
    element.show({ kind: "success", message: "Saved" });
    element.show({ kind: "error", message: "Not found" });
    await element.updateComplete;
    expect(shown(element)).toEqual([
      ["status", "toast success", "Saved"],
      ["alert", "toast error", "Not found"],
    ]);
    vi.advanceTimersByTime(4000);
    await element.updateComplete;
    expect(shown(element)).toEqual([["alert", "toast error", "Not found"]]);
    button(element, "Dismiss").click();
    await element.updateComplete;
    expect(shown(element)).toEqual([]);
  });

  it("should fire toasts for the editor to show", () => {
    const target = document.createElement("div");
    document.body.append(target);
    const received: ToastMessage[] = [];
    document.body.addEventListener(TOAST_EVENT, (event) =>
      received.push((event as CustomEvent<ToastMessage>).detail),
    );
    showToast(target, { kind: "error", message: "Oops" });
    expect(TOAST_EVENT).toBe("blog-toast");
    expect(received).toEqual([{ kind: "error", message: "Oops" }]);
  });
});
