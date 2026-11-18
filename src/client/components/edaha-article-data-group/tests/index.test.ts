// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "..";
import type { EdahaArticleDataGroup } from "..";
import { button, mount } from "../../../../shared/tests/helpers";

afterEach(() => document.body.replaceChildren());

describe("edaha-article-data-group", () => {
  it("should show its label and children in a fieldset", async () => {
    const group = await mount<EdahaArticleDataGroup>(
      "edaha-article-data-group",
      {
        label: "Author",
      },
    );
    const root = group.shadowRoot!;
    expect(root.querySelector("legend")?.textContent?.trim()).toBe("Author");
    expect(root.querySelector(".changed")).toBeNull();
    group.changed = true;
    await group.updateComplete;
    expect(root.querySelector("legend .changed")?.textContent?.trim()).toBe(
      "*",
    );
    expect(root.querySelector("fieldset slot")).not.toBeNull();
    expect(root.querySelectorAll("button")).toHaveLength(0);
  });

  it("should fire add and clear events", async () => {
    const group = await mount<EdahaArticleDataGroup>(
      "edaha-article-data-group",
      {
        name: "tags",
        multiple: true,
        allowclear: true,
      },
    );
    const events: string[] = [];
    const record = (event: Event) =>
      events.push(`${event.type}:${(event as CustomEvent<string>).detail}`);
    document.body.addEventListener("group-add", record);
    document.body.addEventListener("group-clear", record);
    button(group.shadowRoot!, "Add").click();
    button(group.shadowRoot!, "Clear").click();
    expect(events).toEqual(["group-add:tags", "group-clear:tags"]);
    expect(group.shadowRoot!.querySelector("legend")).toBeNull();
    document.body.removeEventListener("group-add", record);
    document.body.removeEventListener("group-clear", record);
  });

  it("should disable its fieldset", async () => {
    const group = await mount<EdahaArticleDataGroup>(
      "edaha-article-data-group",
      {
        disabled: true,
      },
    );
    expect(group.shadowRoot!.querySelector("fieldset")!.disabled).toBe(true);
    vi.restoreAllMocks();
  });
});
