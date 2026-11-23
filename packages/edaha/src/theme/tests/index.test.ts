import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isThemePath,
  packageAuthor,
  parseThemeInfo,
  readThemeInfo,
  resolveTheme,
  THEME_DIR,
  THEME_FILE,
} from "..";

/** A temporary folder */
const tempDir = () => mkdtemp(join(tmpdir(), "edaha-theme-"));

/** Write a file, creating its folders */
const write = async (file: string, contents: string) => {
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, contents);
};

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

describe("isThemePath", () => {
  it("should treat paths starting with a dot, or absolute paths, as folders", () => {
    expect(isThemePath("./theme")).toBe(true);
    expect(isThemePath("../themes/blog")).toBe(true);
    expect(isThemePath("/themes/blog")).toBe(true);
  });

  it("should treat anything else as a package name", () => {
    expect(isThemePath("edaha-theme-blog")).toBe(false);
    expect(isThemePath("@my-org/edaha-theme-blog")).toBe(false);
  });
});

describe("resolveTheme", () => {
  it("should find a folder relative to the site folder, or an absolute one", async () => {
    const root = await tempDir();
    await mkdir(join(root, "themes/blog"), { recursive: true });
    await mkdir(join(root, "site"));
    expect(await resolveTheme("../themes/blog", join(root, "site"))).toBe(
      join(root, "themes/blog"),
    );
    expect(await resolveTheme(join(root, "themes/blog"), "/elsewhere")).toBe(
      join(root, "themes/blog"),
    );
  });

  it("should throw when the folder isn't there", async () => {
    const root = await tempDir();
    await write(join(root, "file"), "not a folder");
    await expect(resolveTheme("./missing", root)).rejects.toThrow(
      `theme folder "./missing" not found at ${join(root, "missing")}`,
    );
    await expect(resolveTheme("./file", root)).rejects.toThrow(
      'theme folder "./file" not found',
    );
  });

  it("should find an installed package from the site folder, or a folder above it", async () => {
    const root = await tempDir();
    await mkdir(join(root, "node_modules/edaha-theme-blog"), {
      recursive: true,
    });
    await mkdir(join(root, "site/node_modules/@my-org/edaha-theme-news"), {
      recursive: true,
    });
    const siteDir = join(root, "site");
    expect(await resolveTheme("edaha-theme-blog", siteDir)).toBe(
      join(root, "node_modules/edaha-theme-blog"),
    );
    expect(await resolveTheme("@my-org/edaha-theme-news", siteDir)).toBe(
      join(siteDir, "node_modules/@my-org/edaha-theme-news"),
    );
  });

  it("should throw when the package isn't installed", async () => {
    await expect(
      resolveTheme("edaha-theme-missing", await tempDir()),
    ).rejects.toThrow(
      'theme package "edaha-theme-missing" not found; is it installed?',
    );
    await expect(resolveTheme("fs", await tempDir())).rejects.toThrow(
      'theme package "fs" not found',
    );
  });
});

describe("parseThemeInfo", () => {
  it("should read a theme's settings", () => {
    expect(
      parseThemeInfo({
        name: " Blog ",
        description: "A theme for blogs",
        version: "1.2.0-beta.1",
        authors: [
          "Matt",
          { name: "Sam", email: "sam@example.com", url: "https://sam.dev" },
        ],
      }),
    ).toEqual({
      name: "Blog",
      description: "A theme for blogs",
      version: "1.2.0-beta.1",
      authors: [
        { name: "Matt" },
        { name: "Sam", email: "sam@example.com", url: "https://sam.dev" },
      ],
      isPackage: false,
    });
  });

  it("should need only a name", () => {
    expect(parseThemeInfo({ name: "Blog", version: null })).toEqual({
      name: "Blog",
      description: undefined,
      version: undefined,
      authors: [],
      isPackage: false,
    });
  });

  it("should reject invalid settings, naming the file", () => {
    const invalid: [unknown, string][] = [
      [null, `${THEME_FILE}: must be a map of settings`],
      [["Blog"], "must be a map of settings"],
      [{ name: "Blog", colour: "red" }, 'unknown theme settings "colour"'],
      [{ description: "No name" }, '"name" must be a non-empty string'],
      [{ name: " " }, '"name" must be a non-empty string'],
      [{ name: "Blog", version: "1.0" }, '"version" must be a version'],
      [{ name: "Blog", version: 1 }, '"version" must be a non-empty string'],
      [{ name: "Blog", authors: "Matt" }, '"authors" must be a list'],
      [{ name: "Blog", authors: [""] }, '"authors[0]" must be a non-empty'],
      [{ name: "Blog", authors: [3] }, '"authors[0]" must be a name, or a map'],
      [
        { name: "Blog", authors: [[]] },
        '"authors[0]" must be a name, or a map',
      ],
      [
        { name: "Blog", authors: [{ email: "a@b.c" }] },
        '"authors[0]" must be a name, or a map',
      ],
      [
        { name: "Blog", authors: [{ name: "Matt", role: "x" }] },
        '"authors[0]" has unknown settings: role',
      ],
      [
        { name: "Blog", authors: [{ name: "Matt", url: 3 }] },
        '"authors[0].url" must be a non-empty string',
      ],
    ];
    for (const [data, message] of invalid)
      expect(() => parseThemeInfo(data)).toThrow(message);
    expect(() => parseThemeInfo(null, "theme.yml")).toThrow(
      "theme.yml: must be a map",
    );
  });
});

describe("packageAuthor", () => {
  it("should read a package.json author string", () => {
    expect(
      packageAuthor("Matt Smith <matt@example.com> (https://example.com)"),
    ).toEqual({
      name: "Matt Smith",
      email: "matt@example.com",
      url: "https://example.com",
    });
    expect(packageAuthor("Matt")).toEqual({
      name: "Matt",
      email: undefined,
      url: undefined,
    });
    expect(packageAuthor("Matt (https://example.com)")).toEqual({
      name: "Matt",
      email: undefined,
      url: "https://example.com",
    });
  });

  it("should read a package.json author map", () => {
    expect(packageAuthor({ name: " Matt ", email: "m@example.com" })).toEqual({
      name: "Matt",
      email: "m@example.com",
      url: undefined,
    });
    expect(
      packageAuthor({ name: "Matt", email: "", url: "https://x.dev" }),
    ).toEqual({ name: "Matt", email: undefined, url: "https://x.dev" });
  });

  it("should give undefined for anything else", () => {
    for (const value of [undefined, null, 3, "", "<m@example.com>", {}, []])
      expect(packageAuthor(value)).toBeUndefined();
    expect(packageAuthor({ name: " " })).toBeUndefined();
  });
});

describe("readThemeInfo", () => {
  it("should read a package's info from its package.json", async () => {
    const dir = await tempDir();
    await write(
      join(dir, "package.json"),
      JSON.stringify({
        name: "edaha-theme-blog",
        description: "Blog",
        version: "2.0.0",
        author: "Matt <matt@example.com>",
        contributors: [{ name: "Sam" }, 3],
      }),
    );
    expect(await readThemeInfo(dir)).toEqual({
      name: "edaha-theme-blog",
      description: "Blog",
      version: "2.0.0",
      authors: [
        { name: "Matt", email: "matt@example.com", url: undefined },
        { name: "Sam", email: undefined, url: undefined },
      ],
      isPackage: true,
    });
  });

  it("should read the default theme as a package, named by its settings file", async () => {
    const info = await readThemeInfo(THEME_DIR);
    expect(info).toMatchObject({
      name: "edaha.md",
      description:
        "edaha.md's default theme, with neutral templates and a stylesheet.",
      authors: [{ name: "Matt Scheurich" }],
      isPackage: true,
    });
    expect(info.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("should name a package without a name after its folder", async () => {
    const dir = await tempDir();
    await write(join(dir, "package.json"), "null");
    expect(await readThemeInfo(dir)).toEqual({
      name: basename(dir),
      description: undefined,
      version: undefined,
      authors: [],
      isPackage: true,
    });
  });

  it("should prefer the settings file in a package, with package.json filling in what it leaves out", async () => {
    const dir = await tempDir();
    await write(
      join(dir, "package.json"),
      JSON.stringify({
        name: "from-package",
        description: "Package",
        version: "2.0.0",
        author: "Matt",
      }),
    );
    await write(join(dir, THEME_FILE), "name: From settings\n");
    expect(await readThemeInfo(dir)).toEqual({
      name: "From settings",
      description: "Package",
      version: "2.0.0",
      authors: [{ name: "Matt", email: undefined, url: undefined }],
      isPackage: true,
    });
    await write(
      join(dir, THEME_FILE),
      "name: From settings\ndescription: Settings\nversion: 1.0.0\nauthors:\n  - Sam\n",
    );
    expect(await readThemeInfo(dir)).toEqual({
      name: "From settings",
      description: "Settings",
      version: "1.0.0",
      authors: [{ name: "Sam" }],
      isPackage: true,
    });
  });

  it("should name an invalid package.json in errors", async () => {
    const dir = await tempDir();
    await write(join(dir, "package.json"), "{");
    await expect(readThemeInfo(dir)).rejects.toThrow("package.json: ");
  });

  it("should read a theme's settings file", async () => {
    const dir = await tempDir();
    await write(
      join(dir, THEME_FILE),
      "name: Blog\nversion: 1.0.0\nauthors:\n  - Matt\n",
    );
    expect(await readThemeInfo(dir)).toEqual({
      name: "Blog",
      description: undefined,
      version: "1.0.0",
      authors: [{ name: "Matt" }],
      isPackage: false,
    });
  });

  it("should name the settings file in errors", async () => {
    const dir = await tempDir();
    await write(join(dir, THEME_FILE), "name: [\n");
    await expect(readThemeInfo(dir)).rejects.toThrow(`${THEME_FILE}: `);
    await write(join(dir, THEME_FILE), "version: 1.0.0\n");
    await expect(readThemeInfo(dir)).rejects.toThrow(
      `${THEME_FILE}: "name" must be a non-empty string`,
    );
  });

  it("should name a theme without either file after its folder", async () => {
    const dir = await tempDir();
    expect(await readThemeInfo(dir)).toEqual({
      name: basename(dir),
      authors: [],
      isPackage: false,
    });
  });
});
