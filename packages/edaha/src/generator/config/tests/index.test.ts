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
      templatesDir: "templates",
      staticDir: "static",
      publishDir: "../app/dist",
      siteUrl: undefined,
      reservedPaths: [],
      types: {},
      plugins: [],
      metadata: {},
      metadataGroups: {},
    });
    expect(parseYaml(`${VALID}path: docs\n`).path).toBe("docs");
  });

  it("should read the optional theme", () => {
    expect(parseYaml(VALID).theme).toBeUndefined();
    expect(parseYaml(`${VALID}theme: ../themes/blog\n`).theme).toBe(
      "../themes/blog",
    );
    expect(() => parseYaml(`${VALID}theme: ""\n`)).toThrow(
      '"theme" must be a non-empty string',
    );
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

  it("should default outputDir to build, and leave publishDir and siteUrl unset", () => {
    const config = parseYaml("name: News\ndescription: Updates\n");
    expect(config.outputDir).toBe("build");
    expect(config.publishDir).toBeUndefined();
    expect(config.siteUrl).toBeUndefined();
  });

  it("should read the articles, templates and static folders inside the site folder", () => {
    for (const field of ["articlesDir", "templatesDir", "staticDir"] as const) {
      for (const [value, folder] of [
        ["content", "content"],
        ["./site/content/", "site/content"],
        ["a/../posts", "posts"],
      ])
        expect(parseYaml(`${VALID}${field}: ${value}\n`)[field], field).toBe(
          folder,
        );
      for (const value of [".", "..", "../content", "/content"])
        expect(() => parseYaml(`${VALID}${field}: ${value}\n`), value).toThrow(
          `edahaconfig.yml: "${field}" must be a folder inside the site folder, got "${value}"`,
        );
    }
    const site = parseYaml(
      `${VALID}articlesDir: site/content\ntemplatesDir: site/templates\nstaticDir: site/static\n`,
    );
    expect([site.articlesDir, site.templatesDir, site.staticDir]).toEqual([
      "site/content",
      "site/templates",
      "site/static",
    ]);
  });

  it("should keep the articles, templates and static folders apart from each other", () => {
    for (const [settings, message] of [
      [
        "articlesDir: templates",
        '"articlesDir" and "templatesDir" must be apart from each other, got "templates" and "templates"',
      ],
      [
        "articlesDir: static/articles",
        '"articlesDir" and "staticDir" must be apart from each other, got "static/articles" and "static"',
      ],
      [
        "templatesDir: site\nstaticDir: site/static",
        '"templatesDir" and "staticDir" must be apart from each other, got "site" and "site/static"',
      ],
    ])
      expect(() => parseYaml(`${VALID}${settings}\n`), settings).toThrow(
        `edahaconfig.yml: ${message}`,
      );
  });

  it("should read embed plugins and reject anything else", () => {
    const quote = {
      key: "quote",
      name: "Quote",
      sources: { script: ["https://cdn.example.com"] },
      build: { render: async (content: string) => content },
    };
    expect(parseConfig({ ...parse(VALID), plugins: [quote] }).plugins).toEqual([
      quote,
    ]);
    expect(parseConfig({ ...parse(VALID), plugins: null }).plugins).toEqual([]);
    expect(() =>
      parseConfig({ ...parse(VALID), plugins: quote }, "edaha.config.mjs"),
    ).toThrow(
      'edaha.config.mjs: "plugins" must be a list of embed plugin package names (or, in a JavaScript config file, embed plugins)',
    );
    expect(() =>
      parseConfig(
        { ...parse(VALID), plugins: ["@lvl99dotcom/edaha-plugin-youtube"] },
        "edahaconfig.yml",
      ),
    ).toThrow(
      'edahaconfig.yml: "plugins" package names are loaded by loadSiteConfig; pass embed plugins to parseConfig',
    );
    expect(() =>
      parseConfig({ ...parse(VALID), plugins: [{ ...quote, key: "Quote" }] }),
    ).toThrow('"plugins" must be embed plugins');
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
    expect(() => parseYaml(`${VALID}path: My Docs\n`)).toThrow(
      'edahaconfig.yml: "path" must be lowercase kebab-case, or "" for the root',
    );
    expect(() => parseYaml(`${VALID}slug: news\n`)).toThrow(
      'edahaconfig.yml: unknown site setting "slug"',
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

describe("custom metadata", () => {
  /** Parse a config with settings added */
  const withSettings = (settings: Record<string, unknown>) =>
    parseConfig({ name: "News", description: "Updates", ...settings });
  const featured = {
    type: "string",
    format: "uri",
    $edahaField: { file: { accept: "image/*" } },
  };

  it("should read metadata definitions and the types' metadata settings", () => {
    const config = withSettings({
      metadata: {
        featured,
        rating: { type: "number", $edahaField: { number: true } },
      },
      types: {
        news: { metadata: ["featured"] },
        docs: { metadata: false },
        page: {},
      },
    });
    expect(config.metadata).toEqual({
      featured,
      rating: { type: "number", $edahaField: { number: true } },
    });
    expect(config.types.news?.metadata).toEqual(["featured"]);
    expect(config.types.docs?.metadata).toBe(false);
    expect(config.types.page?.metadata).toBeUndefined();
    expect(withSettings({}).metadata).toEqual({});
  });

  it("should reject types using metadata that isn't defined, or settings that aren't lists or false", () => {
    expect(() =>
      withSettings({
        metadata: { featured },
        types: { news: { metadata: ["featured", "missing"] } },
      }),
    ).toThrow(
      'config: "types.news.metadata" lists "missing", which isn\'t defined in "metadata"',
    );
    expect(() =>
      withSettings({ types: { news: { metadata: "all" } } }),
    ).toThrow(
      '"types.news.metadata" must be a list of metadata keys, or false for none',
    );
    expect(() => withSettings({ metadata: [] })).toThrow(
      '"metadata" must be a map of settings',
    );
  });
});

describe("default author", () => {
  /** Parse a config with an author setting */
  const withAuthor = (author: unknown) =>
    parseConfig({ name: "News", description: "Updates", author }).author;

  it("should read a name, or a name with an email address and homepage", () => {
    expect(withAuthor(undefined)).toBeUndefined();
    expect(withAuthor(" Matt ")).toEqual({ name: "Matt" });
    expect(
      withAuthor({
        name: "Matt",
        email: "matt@example.com",
        url: "https://x.com",
      }),
    ).toEqual({
      name: "Matt",
      email: "matt@example.com",
      url: "https://x.com",
    });
    expect(withAuthor({ name: "Matt" })).toEqual({
      name: "Matt",
      email: undefined,
      url: undefined,
    });
  });

  it("should read false as no author, for the site and for a type", () => {
    expect(withAuthor(false)).toBe(false);
    const config = parseConfig({
      name: "News",
      description: "Updates",
      types: {
        docs: { author: { name: "Docs team" } },
        notes: { author: false },
        news: {},
      },
    });
    expect(config.types.docs?.author).toEqual({
      name: "Docs team",
      email: undefined,
      url: undefined,
    });
    expect(config.types.notes?.author).toBe(false);
    expect(config.types.news?.author).toBeUndefined();
    expect(() =>
      parseConfig({
        name: "News",
        description: "Updates",
        types: { docs: { author: "!!" } },
      }),
    ).toThrow('"types.docs.author" needs a name with letters or numbers');
  });

  it("should need a name with letters or numbers, and no other settings", () => {
    for (const author of ["!!", {}, { name: "--" }])
      expect(() => withAuthor(author)).toThrow(
        '"author" needs a name with letters or numbers, or false for no author',
      );
    expect(() => withAuthor({ name: "Matt", twitter: "@m" })).toThrow(
      'unknown "author" setting "twitter"',
    );
    expect(() => withAuthor(["Matt"])).toThrow(
      '"author" must be a map of settings',
    );
  });
});
