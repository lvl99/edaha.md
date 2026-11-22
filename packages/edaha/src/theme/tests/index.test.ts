import { access } from "node:fs/promises";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_DIR } from "..";

describe("THEME_DIR", () => {
  it("should be the default theme package's folder", () => {
    expect(basename(THEME_DIR)).toBe("edaha-theme-default");
  });

  it("should hold the theme's required templates and stylesheet", async () => {
    for (const file of [
      "templates/layouts/html.njk",
      "templates/layouts/rssfeed.njk",
      "templates/article/single.njk",
      "templates/article/list.njk",
      "static/base.css",
    ])
      await expect(access(join(THEME_DIR, file))).resolves.toBeUndefined();
  });
});
