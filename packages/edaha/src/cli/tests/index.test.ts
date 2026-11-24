import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  EDITOR_PACKAGE,
  USAGE,
  loadEditor,
  parsePort,
  runCli,
  version,
  type CliContext,
} from "..";
import type { BuildResult } from "../../generator/build";

/** A CLI context that records messages, with fake build and editor functions */
const context = (
  overrides: Partial<Pick<CliContext, "cwd" | "env" | "build" | "check">> = {},
) => {
  const build = vi.fn(async (): Promise<BuildResult> => ({
    outputDir: "/site/dist",
    publishDir: "/app/dist",
    articles: [],
    files: ["index.html"],
  }));
  const editor = vi.fn(async () => ({
    url: "http://127.0.0.1:5180",
    close: async () => undefined,
  }));
  const check = vi.fn(async () => []);
  return {
    cwd: "/work",
    env: {},
    log: vi.fn(),
    error: vi.fn(),
    build,
    check,
    editor,
    ...overrides,
  };
};

describe("version", () => {
  it("should read the package's version", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(version()).toBe(pkg.version);
  });
});

describe("parsePort", () => {
  it("should read port numbers and reject anything else", () => {
    expect(parsePort("5180")).toBe(5180);
    for (const value of ["0", "65536", "abc", "51.8", ""])
      expect(() => parsePort(value), value).toThrow(
        "--port must be a number from 1 to 65535",
      );
  });
});

describe("loadEditor", () => {
  it("should load startEditor from the editor package", async () => {
    // The workspace has the editor package; Node.js imports it directly, past Vitest's modules
    const real = await loadEditor();
    expect(real).toBeTypeOf("function");
    expect(real.name).toBe("startEditor");
    const start = vi.fn();
    const importPackage = vi.fn(async () => ({ startEditor: start }));
    expect(await loadEditor(importPackage)).toBe(start);
    expect(importPackage).toHaveBeenCalledWith(EDITOR_PACKAGE);
  });

  it("should say how to install the editor package when it is missing", async () => {
    const missing = (name: string) =>
      Object.assign(
        new Error(`Cannot find package '${name}' imported from /work/cli.js`),
        { code: "ERR_MODULE_NOT_FOUND" },
      );
    await expect(
      loadEditor(async () => {
        throw missing(EDITOR_PACKAGE);
      }),
    ).rejects.toThrow(
      `The article editor isn't installed. Install it next to edaha.md with \`npm add -D ${EDITOR_PACKAGE}\``,
    );
    // A dependency of the editor that is missing, or any other error, is reported as it is
    await expect(
      loadEditor(async () => {
        throw missing("hono");
      }),
    ).rejects.toThrow("Cannot find package 'hono'");
    await expect(
      loadEditor(async () => {
        throw new Error("Broken");
      }),
    ).rejects.toThrow("Broken");
  });
});

describe("runCli", () => {
  it("should show help and the version", async () => {
    const help = context();
    expect(await runCli(["--help"], help)).toBe(0);
    expect(help.log).toHaveBeenCalledWith(USAGE);
    const none = context();
    expect(await runCli([], none)).toBe(1);
    expect(none.log).toHaveBeenCalledWith(USAGE);
    const ver = context();
    expect(await runCli(["-v"], ver)).toBe(0);
    expect(ver.log).toHaveBeenCalledWith(version());
  });

  it("should refuse unknown commands, options and extra arguments", async () => {
    for (const args of [["publish"], ["build", "--nope"], ["build", "extra"]]) {
      const ctx = context();
      expect(await runCli(args, ctx), args.join(" ")).toBe(1);
      expect(ctx.error.mock.calls[0]?.[0]).toContain(USAGE);
    }
  });

  it("should build the site in the current folder, with SITE_URL", async () => {
    const ctx = context({ env: { SITE_URL: "https://example.com" } });
    expect(await runCli(["build"], ctx)).toBe(0);
    expect(ctx.build).toHaveBeenCalledWith({
      siteDir: "/work",
      configFile: undefined,
      siteUrl: "https://example.com",
      logger: { warn: ctx.error },
    });
    expect(ctx.log).toHaveBeenCalledWith(
      "Built 0 articles (1 files) into /site/dist and copied them into /app/dist",
    );
  });

  it("should build another folder with --dir and --site-url, without a publish folder", async () => {
    const ctx = context({
      env: { SITE_URL: "https://ignored.com" },
      build: vi.fn(async () => ({
        outputDir: "/work/site/dist",
        publishDir: undefined,
        articles: [],
        files: [],
      })),
    });
    expect(
      await runCli(
        [
          "build",
          "--dir",
          "site",
          "-c",
          "site/edaha.config.json",
          "--site-url",
          "https://example.com",
        ],
        ctx,
      ),
    ).toBe(0);
    expect(ctx.build).toHaveBeenCalledWith(
      expect.objectContaining({
        siteDir: "/work/site",
        configFile: "/work/site/edaha.config.json",
        siteUrl: "https://example.com",
      }),
    );
    expect(ctx.log).toHaveBeenCalledWith(
      "Built 0 articles (0 files) into /work/site/dist",
    );
  });

  it("should report build errors", async () => {
    const ctx = context({
      build: vi.fn(async () => {
        throw new Error(
          "edahaconfig.yml: the config file must be a map of settings",
        );
      }),
    });
    expect(await runCli(["build"], ctx)).toBe(1);
    expect(ctx.error).toHaveBeenCalledWith(
      "edahaconfig.yml: the config file must be a map of settings",
    );
  });

  it("should start the editor on the default port or --port", async () => {
    const ctx = context();
    expect(await runCli(["editor"], ctx)).toBe(0);
    expect(ctx.editor).toHaveBeenCalledWith({
      siteDir: "/work",
      configFile: undefined,
      port: 5180,
    });
    expect(ctx.log).toHaveBeenCalledWith(
      "Article editor running at http://127.0.0.1:5180 (press Ctrl+C to stop)",
    );
    const other = context();
    expect(
      await runCli(
        ["editor", "--port", "6000", "--config", "/sites/edaha.config.mjs"],
        other,
      ),
    ).toBe(0);
    expect(other.editor).toHaveBeenCalledWith({
      siteDir: "/work",
      configFile: "/sites/edaha.config.mjs",
      port: 6000,
    });
    const bad = context();
    expect(await runCli(["editor", "--port", "x"], bad)).toBe(1);
    expect(bad.error).toHaveBeenCalledWith(
      '--port must be a number from 1 to 65535, got "x"',
    );
  });

  it("should check the templates, listing each problem by file and line", async () => {
    const fine = context();
    expect(await runCli(["check", "--dir", "site"], fine)).toBe(0);
    expect(fine.check).toHaveBeenCalledWith({
      siteDir: "/work/site",
      configFile: undefined,
      logger: { warn: fine.error },
    });
    expect(fine.log).toHaveBeenCalledWith("No problems found in the templates");

    const bad = context({
      check: vi.fn(async () => [
        {
          file: "/work/templates/a.njk",
          line: 2,
          column: 5,
          message: 'Unknown filter "nope"',
        },
      ]),
    });
    expect(await runCli(["check"], bad)).toBe(1);
    expect(bad.error.mock.calls).toEqual([
      ['templates/a.njk:2:5 Unknown filter "nope"'],
      ["Found 1 problem in the templates"],
    ]);
    const two = context({
      check: vi.fn(async () => [
        { file: "/work/templates", message: "Missing" },
        { file: "/work/templates", message: "Missing" },
      ]),
    });
    expect(await runCli(["check"], two)).toBe(1);
    expect(two.error).toHaveBeenLastCalledWith(
      "Found 2 problems in the templates",
    );
  });

  it("should use the real check when none is given", async () => {
    const ctx = context({ cwd: "/nonexistent-edaha-site" });
    delete (ctx as Partial<CliContext>).check;
    expect(await runCli(["check"], ctx)).toBe(1);
    expect(ctx.error.mock.calls[0]?.[0]).toContain(
      "No config file found in /nonexistent-edaha-site.",
    );
  });

  it("should use the real build when none is given", async () => {
    const ctx = context({ cwd: "/nonexistent-edaha-site" });
    delete (ctx as Partial<CliContext>).build;
    expect(await runCli(["build"], ctx)).toBe(1);
    expect(ctx.error.mock.calls[0]?.[0]).toContain(
      "No config file found in /nonexistent-edaha-site.",
    );
  });

  it("should use the real editor when none is given", async () => {
    const ctx = context({ cwd: "/nonexistent-edaha-site" });
    delete (ctx as Partial<CliContext>).editor;
    expect(await runCli(["editor", "--port", "6001"], ctx)).toBe(1);
    expect(ctx.error.mock.calls[0]?.[0]).toContain(
      "No config file found in /nonexistent-edaha-site.",
    );
  });
});
