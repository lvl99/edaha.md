import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  changeConfigText,
  CONFIG_FILES,
  findConfigFile,
  loadSiteConfig,
  packageDir,
  readConfigFile,
  updateConfigFile,
} from "..";

const SETTINGS = { name: "News", description: "Updates" };

/** The same settings in each config file format */
const FORMATS: Record<string, string> = {
  yml: "name: News\ndescription: Updates\n",
  yaml: "name: News\ndescription: Updates\n",
  json: JSON.stringify(SETTINGS),
  js: `export default ${JSON.stringify(SETTINGS)};`,
  cjs: `module.exports = ${JSON.stringify(SETTINGS)};`,
  mjs: `export default ${JSON.stringify(SETTINGS)};`,
};

/** A temporary project: a package.json in its root, and an empty site folder in it */
const project = async () => {
  const root = await mkdtemp(join(tmpdir(), "edaha-config-"));
  const siteDir = join(root, "site");
  await mkdir(siteDir);
  await writeFile(join(root, "package.json"), '{ "type": "module" }');
  return { root, siteDir };
};

describe("CONFIG_FILES", () => {
  it("should list every name with every extension, in order", () => {
    expect(CONFIG_FILES).toHaveLength(30);
    expect(CONFIG_FILES.slice(0, 7)).toEqual([
      ".edahaconfigrc.yml",
      ".edahaconfigrc.yaml",
      ".edahaconfigrc.json",
      ".edahaconfigrc.js",
      ".edahaconfigrc.cjs",
      ".edahaconfigrc.mjs",
      ".edahaconfig.yml",
    ]);
    expect(CONFIG_FILES.at(-1)).toBe("edaha.config.mjs");
  });
});

describe("readConfigFile", () => {
  it("should read every format", async () => {
    const { siteDir } = await project();
    for (const [extension, contents] of Object.entries(FORMATS)) {
      const file = join(siteDir, `edahaconfig.${extension}`);
      await writeFile(file, contents);
      expect(await readConfigFile(file)).toEqual(SETTINGS);
    }
  });

  it("should import a JavaScript file again once it changed", async () => {
    const { siteDir } = await project();
    const file = join(siteDir, "edaha.config.mjs");
    await writeFile(file, FORMATS.mjs as string);
    expect(await readConfigFile(file)).toEqual(SETTINGS);
    await writeFile(file, 'export default { name: "Changed" };');
    // A different modification time, even when the file system's clock is coarse
    await utimes(file, new Date(), new Date(Date.now() + 5000));
    expect(await readConfigFile(file)).toEqual({ name: "Changed" });
  });

  it("should name the file in errors", async () => {
    const { siteDir } = await project();
    await expect(readConfigFile(join(siteDir, "none.yml"))).rejects.toThrow(
      "none.yml: file not found",
    );
    await writeFile(join(siteDir, "bad.json"), "{");
    await expect(readConfigFile(join(siteDir, "bad.json"))).rejects.toThrow(
      /^bad\.json: /,
    );
    await writeFile(join(siteDir, "config.toml"), "");
    await expect(readConfigFile(join(siteDir, "config.toml"))).rejects.toThrow(
      "config.toml: config files must end in .yml, .yaml, .json, .js, .cjs, .mjs",
    );
  });
});

describe("packageDir", () => {
  it("should find the nearest package.json's folder", async () => {
    const { root, siteDir } = await project();
    expect(await packageDir(siteDir)).toBe(root);
    expect(await packageDir(root)).toBe(root);
  });

  it("should give undefined when there is none", async () => {
    // The file system's root has no package.json
    expect(await packageDir("/")).toBeUndefined();
  });
});

describe("findConfigFile", () => {
  it("should find a config file in the folder first", async () => {
    const { root, siteDir } = await project();
    await writeFile(join(root, "edaha.config.json"), "{}");
    await writeFile(join(siteDir, "edahaconfig.yml"), "");
    expect(await findConfigFile(siteDir)).toBe(
      join(siteDir, "edahaconfig.yml"),
    );
  });

  it("should then look in the nearest package.json's folder", async () => {
    const { root, siteDir } = await project();
    await writeFile(join(root, "edaha.config.json"), "{}");
    expect(await findConfigFile(siteDir)).toBe(join(root, "edaha.config.json"));
  });

  it("should use the first of several config files, with a warning", async () => {
    const { siteDir } = await project();
    await writeFile(join(siteDir, "edaha.config.yml"), "");
    await writeFile(join(siteDir, ".edahaconfigrc.json"), "");
    const logger = { warn: vi.fn() };
    expect(await findConfigFile(siteDir, logger)).toBe(
      join(siteDir, ".edahaconfigrc.json"),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      `${siteDir} has several config files (.edahaconfigrc.json, edaha.config.yml); using .edahaconfigrc.json`,
    );
  });

  it("should ignore folders with config file names", async () => {
    const { root, siteDir } = await project();
    await mkdir(join(siteDir, "edahaconfig.yml"));
    await writeFile(join(root, "edahaconfig.json"), "{}");
    expect(await findConfigFile(siteDir)).toBe(join(root, "edahaconfig.json"));
  });

  it("should throw when there is no config file", async () => {
    const { root, siteDir } = await project();
    await expect(findConfigFile(siteDir)).rejects.toThrow(
      `No config file found in ${siteDir} or ${root}. Add one named .edahaconfigrc, .edahaconfig, edahaconfigrc, edahaconfig, edaha.config ending in .yml, .yaml, .json, .js, .cjs, .mjs, or name it with --config.`,
    );
    // The package.json's folder is only searched once
    await expect(findConfigFile(root)).rejects.toThrow(
      `No config file found in ${root}. `,
    );
  });
});

describe("loadSiteConfig", () => {
  it("should find, read and validate the config file", async () => {
    const { root, siteDir } = await project();
    await writeFile(join(root, "edaha.config.mjs"), FORMATS.mjs as string);
    const site = await loadSiteConfig({ siteDir });
    expect(site.configFile).toBe(join(root, "edaha.config.mjs"));
    expect(site.siteDir).toBe(root);
    expect(site.config.name).toBe("News");
  });

  it("should use the given config file", async () => {
    const { siteDir } = await project();
    await writeFile(join(siteDir, "my-config.json"), FORMATS.json as string);
    const site = await loadSiteConfig({
      configFile: join(siteDir, "my-config.json"),
    });
    expect(site.siteDir).toBe(siteDir);
    expect(site.config.description).toBe("Updates");
  });

  it("should name the config file in validation errors", async () => {
    const { siteDir } = await project();
    await writeFile(join(siteDir, "edahaconfig.json"), "[]");
    await expect(loadSiteConfig({ siteDir })).rejects.toThrow(
      "edahaconfig.json: the config file must be a map of settings",
    );
  });

  it("should load embed plugin packages named in the config file, from its folder", async () => {
    const { siteDir } = await project();
    const pkg = join(siteDir, "node_modules", "edaha-plugin-quote");
    await mkdir(pkg, { recursive: true });
    await writeFile(
      join(pkg, "package.json"),
      '{ "name": "edaha-plugin-quote", "type": "module", "exports": "./index.js" }',
    );
    await writeFile(
      join(pkg, "index.js"),
      'export default { key: "quote", name: "Quote", build: { render: async (text) => text } };',
    );
    await writeFile(
      join(siteDir, "edahaconfig.yml"),
      `${FORMATS.yml}plugins:\n  - edaha-plugin-quote\n`,
    );
    const { config } = await loadSiteConfig({ siteDir });
    expect(config.plugins.map((plugin) => plugin.key)).toEqual(["quote"]);
    await writeFile(
      join(siteDir, "edahaconfig.yml"),
      `${FORMATS.yml}plugins:\n  - edaha-plugin-missing\n`,
    );
    await expect(loadSiteConfig({ siteDir })).rejects.toThrow(
      'edahaconfig.yml: plugin "edaha-plugin-missing" couldn\'t be loaded',
    );
  });

  it("should find the theme named in the config file, from its folder", async () => {
    const { root, siteDir } = await project();
    await writeFile(join(siteDir, "edahaconfig.yml"), FORMATS.yml as string);
    expect((await loadSiteConfig({ siteDir })).themeDir).toBeUndefined();
    await mkdir(join(root, "themes/blog"), { recursive: true });
    await writeFile(
      join(siteDir, "edahaconfig.yml"),
      `${FORMATS.yml}theme: ../themes/blog\n`,
    );
    expect((await loadSiteConfig({ siteDir })).themeDir).toBe(
      join(root, "themes/blog"),
    );
    await writeFile(
      join(siteDir, "edahaconfig.yml"),
      `${FORMATS.yml}theme: edaha-theme-missing\n`,
    );
    await expect(loadSiteConfig({ siteDir })).rejects.toThrow(
      'edahaconfig.yml: theme package "edaha-theme-missing" not found',
    );
  });

  it("should look in the current folder by default", async () => {
    const { siteDir } = await project();
    await writeFile(join(siteDir, "edahaconfig.yml"), FORMATS.yml as string);
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(siteDir);
    try {
      expect((await loadSiteConfig()).siteDir).toBe(siteDir);
    } finally {
      cwd.mockRestore();
    }
  });
});

describe("changeConfigText", () => {
  it("should change a YAML file's settings, keeping its comments and layout", () => {
    const text = [
      "# My site",
      "name: News # shown in the title",
      "description: Updates",
      "siteUrl: https://example.com",
      "",
      "# Article types",
      "types:",
      "  news:",
      "    path: news",
      "",
    ].join("\n");
    expect(
      changeConfigText("edahaconfig.yml", text, {
        name: "Notes",
        siteUrl: undefined,
        theme: "../themes/plain",
      }),
    ).toBe(
      [
        "# My site",
        "name: Notes # shown in the title",
        "description: Updates",
        "",
        "# Article types",
        "types:",
        "  news:",
        "    path: news",
        "theme: ../themes/plain",
        "",
      ].join("\n"),
    );
  });

  it("should change a JSON file's settings, keeping its indentation", () => {
    expect(
      changeConfigText(
        "edahaconfig.json",
        '{\n    "name": "News",\n    "siteUrl": "https://example.com"\n}',
        { name: "Notes", siteUrl: undefined, description: "Updates" },
      ),
    ).toBe('{\n    "name": "Notes",\n    "description": "Updates"\n}\n');
    expect(
      changeConfigText("edahaconfig.json", '{"name":"News"}', {
        name: "Notes",
      }),
    ).toBe('{\n  "name": "Notes"\n}\n');
  });

  it("should refuse JavaScript files and YAML it can't read", () => {
    expect(() => changeConfigText("edaha.config.mjs", "", {})).toThrow(
      "only YAML and JSON config files can be changed; change a JavaScript config file yourself",
    );
    expect(() =>
      changeConfigText("edahaconfig.yml", "name: [News", { name: "Notes" }),
    ).toThrow();
  });
});

describe("updateConfigFile", () => {
  it("should change the config file and give the site's new config", async () => {
    const { siteDir } = await project();
    const file = join(siteDir, "edahaconfig.yml");
    await writeFile(file, "# My site\nname: News\ndescription: Updates\n");
    const site = await updateConfigFile(file, {
      name: "Notes",
      siteUrl: "https://example.com",
    });
    expect(site.config).toMatchObject({
      name: "Notes",
      siteUrl: "https://example.com",
    });
    expect(site.siteDir).toBe(siteDir);
    expect(await readFile(file, "utf8")).toBe(
      "# My site\nname: Notes\ndescription: Updates\nsiteUrl: https://example.com\n",
    );
    expect(await readdir(siteDir)).toEqual(["edahaconfig.yml"]);
  });

  it("should leave the file as it was when the changed settings can't be used", async () => {
    const { siteDir } = await project();
    const file = join(siteDir, "edahaconfig.yml");
    const text = "name: News\ndescription: Updates\n";
    await writeFile(file, text);
    await expect(updateConfigFile(file, { name: "" })).rejects.toThrow(
      'edahaconfig.yml: "name" must be a non-empty string',
    );
    await expect(
      updateConfigFile(file, { theme: "./missing-theme" }),
    ).rejects.toThrow("edahaconfig.yml: ");
    expect(await readFile(file, "utf8")).toBe(text);
  });

  it("should name the file when it can't be read or changed", async () => {
    const { siteDir } = await project();
    await expect(
      updateConfigFile(join(siteDir, "edahaconfig.yml"), { name: "Notes" }),
    ).rejects.toThrow("edahaconfig.yml: ENOENT");
    const js = join(siteDir, "edaha.config.mjs");
    await writeFile(js, FORMATS.mjs as string);
    await expect(updateConfigFile(js, { name: "Notes" })).rejects.toThrow(
      "edaha.config.mjs: only YAML and JSON config files can be changed",
    );
  });

  it("should change a JSON file, and load the plugins it names", async () => {
    const { siteDir } = await project();
    const file = join(siteDir, "edahaconfig.json");
    await writeFile(file, JSON.stringify({ ...SETTINGS, plugins: [] }));
    const site = await updateConfigFile(file, { name: "Notes" });
    expect(site.config.name).toBe("Notes");
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      ...SETTINGS,
      plugins: [],
      name: "Notes",
    });
  });

  it("should name the file when its temporary file can't be written", async () => {
    const { siteDir } = await project();
    const file = join(siteDir, "edahaconfig.yml");
    await writeFile(file, "name: News\ndescription: Updates\n");
    // A folder where the temporary file would go can't be written as a file
    await mkdir(`${file}.${process.pid}.tmp`);
    await expect(updateConfigFile(file, { name: "Notes" })).rejects.toThrow(
      "edahaconfig.yml: EISDIR",
    );
    expect(await readFile(file, "utf8")).toBe(
      "name: News\ndescription: Updates\n",
    );
  });
});
