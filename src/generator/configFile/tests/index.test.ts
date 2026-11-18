import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CONFIG_FILES,
  findConfigFile,
  loadSiteConfig,
  packageDir,
  readConfigFile,
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
