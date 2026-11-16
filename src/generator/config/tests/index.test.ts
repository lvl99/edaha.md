import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { defaultTypeConfig, parseConfig } from "..";

/** Parse YAML settings and validate them */
const parseYaml = (text: string) => parseConfig(parse(text), "edahaconfig.yml");

const VALID =
  "name: News\ndescription: Updates\noutputDir: dist\npublishDir: ../app/dist\n";

/** Parse a config with the given `types` YAML */
const withTypes = (types: string) => parseYaml(`${VALID}types:\n${types}`);

const ALL = { article: true, list: true, feed: true, author: true, tag: true };
const NONE = {
  article: false,
  list: false,
  feed: false,
  author: false,
  tag: false,
};

describe("parseConfig", () => {
  it("should parse a valid config", () => {
    expect(parseYaml(VALID)).toEqual({
      name: "News",
      description: "Updates",
      path: "",
      outputDir: "dist",
      articlesDir: "articles",
      publishDir: "../app/dist",
      siteUrl: undefined,
      reservedPaths: [],
      types: {},
    });
    expect(parseYaml(`${VALID}path: blog\n`).path).toBe("blog");
  });

  it("should reject anything but a map", () => {
    expect(() => parseYaml("- a")).toThrow(
      "edahaconfig.yml: the config file must be a map of settings",
    );
    expect(() => parseYaml("")).toThrow("must be a map of settings");
    expect(() => parseConfig(null)).toThrow(
      "config: the config file must be a map of settings",
    );
  });

  it("should require non-empty string fields", () => {
    expect(() => parseYaml(VALID.replace("name: News", "name: ''"))).toThrow(
      '"name" must be a non-empty string',
    );
    expect(() =>
      parseYaml(VALID.replace("outputDir: dist", "outputDir: 3")),
    ).toThrow('"outputDir" must be a non-empty string');
    expect(() =>
      parseYaml(VALID.replace("publishDir: ../app/dist", "publishDir: ''")),
    ).toThrow('"publishDir" must be a non-empty string');
  });

  it("should default outputDir to dist, and leave publishDir and siteUrl unset", () => {
    const config = parseYaml("name: News\ndescription: Updates\n");
    expect(config.outputDir).toBe("dist");
    expect(config.publishDir).toBeUndefined();
    expect(config.siteUrl).toBeUndefined();
  });

  it("should read the articles folder inside the site folder, apart from templates and static", () => {
    for (const [value, folder] of [
      ["content", "content"],
      ["./site/content/", "site/content"],
      ["a/../posts", "posts"],
    ])
      expect(parseYaml(`${VALID}articlesDir: ${value}\n`).articlesDir).toBe(
        folder,
      );
    for (const value of [
      ".",
      "..",
      "../content",
      "/content",
      "templates",
      "static/articles",
    ])
      expect(() => parseYaml(`${VALID}articlesDir: ${value}\n`), value).toThrow(
        `edahaconfig.yml: "articlesDir" must be a folder inside the site folder, apart from templates and static, got "${value}"`,
      );
  });

  it("should read reserved paths and reject anything but a list of paths", () => {
    expect(
      parseYaml(`${VALID}reservedPaths: [app, jwks.json]\n`).reservedPaths,
    ).toEqual(["app", "jwks.json"]);
    for (const value of ["app", "[App]", "['/app']", "[1]"])
      expect(() => parseYaml(`${VALID}reservedPaths: ${value}\n`)).toThrow(
        '"reservedPaths" must be a list of lowercase paths',
      );
  });

  it("should read an absolute siteUrl and reject anything else", () => {
    expect(parseYaml(`${VALID}siteUrl: http://127.0.0.1:5002\n`).siteUrl).toBe(
      "http://127.0.0.1:5002",
    );
    expect(() => parseYaml(`${VALID}siteUrl: /news\n`)).toThrow(
      '"siteUrl" must be an absolute http(s) URL',
    );
  });

  it("should require a kebab-case path, and reject unknown settings", () => {
    expect(() => parseYaml(`${VALID}path: My Blog\n`)).toThrow(
      'edahaconfig.yml: "path" must be lowercase kebab-case, or "" for the root',
    );
    expect(() => parseYaml(`${VALID}slug: news\n`)).toThrow(
      'edahaconfig.yml: unknown blog setting "slug"',
    );
  });
});

describe("article types", () => {
  it("should default the path and labels from the type name and generate everything", () => {
    expect(defaultTypeConfig("video")).toEqual({
      path: "video",
      labelSingle: "Video",
      labelPlural: "Videos",
      generate: ALL,
    });
    expect(withTypes("  video:\n").types).toEqual({
      video: defaultTypeConfig("video"),
    });
    expect(parseYaml(`${VALID}types:\n`).types).toEqual({});
  });

  it("should read paths, labels and generate settings", () => {
    expect(
      withTypes(
        "  article:\n    labelSingle: ' Article '\n    labelPlural: Articles\n    generate: true\n  page:\n    path: ''\n    generate:\n      list: false\n      tag: false\n",
      ).types,
    ).toEqual({
      article: {
        path: "article",
        labelSingle: "Article",
        labelPlural: "Articles",
        generate: ALL,
      },
      page: {
        path: "",
        labelSingle: "Page",
        labelPlural: "Pages",
        generate: { ...ALL, list: false, tag: false },
      },
    });
  });

  it("should turn everything off with generate: false or article: false", () => {
    expect(
      withTypes("  page:\n    generate: false\n").types.page!.generate,
    ).toEqual(NONE);
    expect(
      withTypes(
        "  page:\n    generate:\n      article: false\n      list: true\n",
      ).types.page!.generate,
    ).toEqual(NONE);
  });

  it("should reject invalid type settings", () => {
    const cases: [string, string][] = [
      ["  - article\n", '"types" must be a map'],
      [
        "  Bad Type:\n",
        'type "Bad Type" must be lowercase kebab-case and not tags or authors',
      ],
      ["  tags:\n", 'type "tags" must be lowercase kebab-case'],
      ["  page: yes\n", '"types.page" must be a map'],
      ["  page:\n    single: Page\n", 'unknown "types.page" setting "single"'],
      [
        "  page:\n    labelSingle: ''\n",
        '"types.page.labelSingle" must be a non-empty string',
      ],
      [
        "  page:\n    labelPlural: 3\n",
        '"types.page.labelPlural" must be a non-empty string',
      ],
      [
        "  page:\n    path: Pages\n",
        '"types.page.path" must be lowercase kebab-case, or "" for the root',
      ],
      [
        "  page:\n    generate: [list]\n",
        '"types.page.generate" must be a map',
      ],
      [
        "  page:\n    generate:\n      feeds: false\n      lists: false\n",
        'unknown "types.page.generate" settings "feeds", "lists"',
      ],
      [
        "  page:\n    generate:\n      feed: no\n",
        '"types.page.generate.feed" must be true or false',
      ],
    ];
    for (const [types, message] of cases)
      expect(() => withTypes(types), types).toThrow(
        `edahaconfig.yml: ${message}`,
      );
  });
});
