import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  checkSite,
  checkTemplate,
  checkTemplates,
  formatProblem,
  templateExists,
} from "..";
import { REQUIRED_TEMPLATES } from "../../templates";
import { THEME_DIR } from "../../../theme";

const FIXTURE = fileURLToPath(
  new URL("../../../shared/tests/fixtures/site", import.meta.url),
);

const THEME_TEMPLATES = join(THEME_DIR, "templates");

/** A templates folder containing the given files */
const templatesDir = async (files: Record<string, string>) => {
  const dir = await mkdtemp(join(tmpdir(), "edaha-check-"));
  for (const [file, contents] of Object.entries(files)) {
    await mkdir(join(dir, file, ".."), { recursive: true });
    await writeFile(join(dir, file), contents);
  }
  return dir;
};

const REQUIRED = Object.fromEntries(
  REQUIRED_TEMPLATES.map((file) => [file, ""]),
);

describe("checkTemplate", () => {
  it("should report syntax errors and unknown tags where they are", () => {
    expect(
      checkTemplate([], "a\n{% if x %}\n{% endfor %}", "a.njk", "/t/a.njk"),
    ).toEqual([
      {
        file: "/t/a.njk",
        line: 3,
        column: 4,
        message: "unknown block tag: endfor",
      },
    ]);
    expect(checkTemplate([], "{{ a.b( }}", "a.njk", "/t/a.njk")).toEqual([
      {
        file: "/t/a.njk",
        line: 1,
        column: 9,
        message: "unexpected token: }}",
      },
    ]);
  });

  it("should know edaha.md's tags and filters, and Nunjucks' own, and report other filters", () => {
    expect(
      checkTemplate(
        [],
        "{% embedHead %}{% embedFoot() %}{{ a | upper | date | rfc822 | json(true) | safe }}{% filter title %}x{% endfilter %}",
        "a.njk",
        "/t/a.njk",
      ),
    ).toEqual([]);
    expect(
      checkTemplate(
        [],
        "x\n  {{ a | upper | dat }}{% filter nope %}{% endfilter %}",
        "a.njk",
        "/t/a.njk",
      ),
    ).toEqual([
      {
        file: "/t/a.njk",
        line: 2,
        column: 18,
        message: 'Unknown filter "dat"',
      },
      {
        file: "/t/a.njk",
        line: 2,
        column: 34,
        message: 'Unknown filter "nope"',
      },
    ]);
  });

  it("should report templates named in extends, include and import that don't exist", async () => {
    const theme = await templatesDir({
      "layouts/rssfeed.xml.njk": "",
      "partials/a.njk": "",
      "partials/b.njk": "",
    });
    const site = await templatesDir({ "partials/c.njk": "" });
    const dirs = [site, theme];
    expect(
      checkTemplate(
        dirs,
        [
          '{% extends "@theme/layouts/rssfeed.njk" %}',
          '{% include "partials/a.njk" %}',
          '{% include "./b.njk" %}',
          '{% include "../partials/c.njk" %}',
          '{% include "missing.njk" ignore missing %}',
          "{% include name %}",
        ].join("\n"),
        "partials/x.njk",
        "/t/x.njk",
      ),
    ).toEqual([]);
    expect(
      checkTemplate(
        dirs,
        [
          '{% extends "missing.njk" %}',
          '{% include "@theme/partials/c.njk" %}',
          '{% import "macros.njk" as macros %}',
          '{% from "./forms.njk" import field %}',
        ].join("\n"),
        "partials/x.njk",
        "/t/x.njk",
      ).map(({ line, column, message }) => [line, column, message]),
    ).toEqual([
      [1, 4, 'Template "missing.njk" not found'],
      [2, 4, 'Template "@theme/partials/c.njk" not found'],
      [3, 4, 'Template "macros.njk" not found'],
      [4, 4, 'Template "./forms.njk" not found'],
    ]);
  });

  it("should report templates in one folder that output the same file type, when named", async () => {
    const dir = await templatesDir({ "a.njk": "", "a.html.njk": "" });
    expect(
      checkTemplate([dir], '{% include "a.njk" %}', "b.njk", "/t/b.njk"),
    ).toEqual([
      {
        file: "/t/b.njk",
        line: 1,
        column: 4,
        message: `a.html.njk and a.njk in ${dir} both output a's .html file; rename or remove one of them`,
      },
    ]);
  });
});

describe("templateExists", () => {
  it("should find templates as the build loads them", async () => {
    const theme = await templatesDir({ "layouts/rssfeed.xml.njk": "" });
    const site = await templatesDir({ "article/single.html.njk": "" });
    const dirs = [site, theme];
    expect(templateExists(dirs, "layouts/rssfeed.njk", "a.njk")).toBe(true);
    expect(templateExists(dirs, "@theme/layouts/rssfeed.njk", "a.njk")).toBe(
      true,
    );
    expect(templateExists(dirs, "article/single.njk", "a.njk")).toBe(true);
    expect(templateExists(dirs, "@theme/article/single.njk", "a.njk")).toBe(
      false,
    );
    expect(templateExists(dirs, "../single.njk", "article/x/a.njk")).toBe(true);
  });
});

describe("checkTemplates", () => {
  it("should find no problems in the default theme", () => {
    expect(checkTemplates([THEME_TEMPLATES])).toEqual([]);
  });

  it("should check every template in every folder, skipping missing folders and other files", async () => {
    const site = await templatesDir({
      "article/single.njk": "{{ a | nope }}",
      "article/single.html.njk": "",
      "article/single.json.njk": "{{ a | json }}",
      "notes.txt": "{{ a | nope }}",
    });
    const theme = await templatesDir({
      ...REQUIRED,
      "partials/deep/x.njk": '{% include "missing.njk" %}',
    });
    expect(
      checkTemplates([join(site, "missing"), site, theme]).map(
        ({ file, line, message }) => [
          file.replace(site, "site").replace(theme, "theme"),
          line,
          message,
        ],
      ),
    ).toEqual([
      // Reported once, for the first of the two templates
      [
        "site/article/single.html.njk",
        undefined,
        `article/single.html.njk and article/single.njk in ${site} both output single's .html file; rename or remove one of them`,
      ],
      ["site/article/single.njk", 1, 'Unknown filter "nope"'],
      ["theme/partials/deep/x.njk", 1, 'Template "missing.njk" not found'],
    ]);
  });

  it("should report missing required templates, which can have any output extension", async () => {
    const dir = await templatesDir({
      "layouts/rssfeed.xml.njk": "",
      "article/list.json.njk": "",
    });
    expect(checkTemplates([dir])).toEqual([
      {
        file: dir,
        message:
          "Missing required template layouts/html.njk (or with an output extension, e.g. layouts/html.html.njk)",
      },
      {
        file: dir,
        message:
          "Missing required template article/single.njk (or with an output extension, e.g. article/single.html.njk)",
      },
    ]);
  });
});

describe("checkSite", () => {
  it("should check a site's templates over its theme's, found from its config file", async () => {
    expect(await checkSite({ siteDir: FIXTURE })).toEqual([]);
    const theme = await templatesDir({
      ...Object.fromEntries(
        Object.keys(REQUIRED).map((file) => [`templates/${file}`, ""]),
      ),
      "templates/a.njk": "{{ a | nope }}",
    });
    expect(
      await checkSite({
        siteDir: FIXTURE,
        themeDir: theme,
        logger: { warn: vi.fn() },
      }),
    ).toEqual([
      {
        file: join(theme, "templates", "a.njk"),
        line: 1,
        column: 8,
        message: 'Unknown filter "nope"',
      },
    ]);
  });
});

describe("formatProblem", () => {
  it("should write a problem as one line, its file relative to a folder", () => {
    expect(
      formatProblem(
        { file: "/site/templates/a.njk", line: 2, column: 5, message: "Bad" },
        "/site",
      ),
    ).toBe("templates/a.njk:2:5 Bad");
    expect(
      formatProblem(
        { file: "/site/templates/a.njk", line: 2, message: "Bad" },
        "/",
      ),
    ).toBe("site/templates/a.njk:2 Bad");
    expect(
      formatProblem(
        { file: "/site/templates", message: "Missing" },
        "/site/templates",
      ),
    ).toBe(". Missing");
  });
});
