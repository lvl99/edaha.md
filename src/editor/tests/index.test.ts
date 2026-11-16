import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CLIENT_DIR,
  EDITOR_BASE,
  EDITOR_PORT,
  createEditorServer,
  editorPort,
  editorUrl,
  startEditor,
} from "..";

const FIXTURE = fileURLToPath(
  new URL("../../shared/tests/fixtures/site", import.meta.url),
);

/** A copy of the fixture site and a folder of built editor files */
const setup = async () => {
  const root = await mkdtemp(join(tmpdir(), "edaha-editor-"));
  const siteDir = join(root, "site");
  const clientDir = join(root, "client");
  await cp(FIXTURE, siteDir, { recursive: true });
  await mkdir(join(clientDir, "assets"), { recursive: true });
  await writeFile(join(clientDir, "index.html"), "<blog-editor></blog-editor>");
  await writeFile(join(clientDir, "assets/main.js"), "console.log(1)");
  await writeFile(join(clientDir, "assets/data.unknownext"), "data");
  await writeFile(join(clientDir, ".hidden"), "secret");
  return { root, siteDir, clientDir };
};

describe("editorUrl and CLIENT_DIR", () => {
  it("should give the editor's local address, and the built page's folder", () => {
    expect(editorUrl(5180)).toBe("http://127.0.0.1:5180");
    expect(CLIENT_DIR).toMatch(/[/\\]client$/);
  });
});

describe("createEditorServer", () => {
  it("should serve the editor page and its files", async () => {
    const { siteDir, clientDir } = await setup();
    const app = await createEditorServer({ siteDir, clientDir });
    const page = await app.request("/");
    expect(page.status).toBe(200);
    expect(page.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await page.text()).toBe("<blog-editor></blog-editor>");
    const script = await app.request(`${EDITOR_BASE}assets/main.js`);
    expect(script.headers.get("Content-Type")).toBe("text/javascript");
    expect(await script.text()).toBe("console.log(1)");
    expect(
      (await app.request(`${EDITOR_BASE}assets/data.unknownext`)).headers.get(
        "Content-Type",
      ),
    ).toBe("application/octet-stream");
    for (const path of ["missing.js", ".hidden", "assets//main.js", "assets"])
      expect((await app.request(`${EDITOR_BASE}${path}`)).status, path).toBe(
        404,
      );
  });

  it("should serve the built editor page from CLIENT_DIR by default", async () => {
    const { siteDir } = await setup();
    const page = await (await createEditorServer({ siteDir })).request("/");
    // dist/client exists once the package is built
    expect(page.status).toBe(
      existsSync(join(CLIENT_DIR, "index.html")) ? 200 : 500,
    );
  });

  it("should explain when the editor page hasn't been built", async () => {
    const { root, siteDir } = await setup();
    const app = await createEditorServer({
      siteDir,
      clientDir: join(root, "none"),
    });
    const page = await app.request("/");
    expect(page.status).toBe(500);
    expect(await page.text()).toContain("build edaha.md");
  });

  it("should serve the API, the site's static files and the theme's, allowing changes only from its own address", async () => {
    const { siteDir, clientDir } = await setup();
    const app = await createEditorServer({
      siteDir,
      clientDir,
      port: 5555,
      fetch: (async () => new Response("")) as unknown as typeof fetch,
    });
    expect(await (await app.request("/api/types")).json()).toEqual({
      article: { labelSingle: "Article", labelPlural: "Articles" },
    });
    expect((await app.request("/site.css")).status).toBe(200);
    const remove = (origin: string) =>
      app.request("/api/articles/article/first", {
        method: "DELETE",
        headers: { Origin: origin },
      });
    expect((await remove(editorUrl(EDITOR_PORT))).status).toBe(403);
    expect((await remove(editorUrl(5555))).status).toBe(204);
  });

  it("should allow changes from the default port's address when no port is given", async () => {
    const { siteDir, clientDir } = await setup();
    const app = await createEditorServer({ siteDir, clientDir });
    const response = await app.request("/api/articles/article/first", {
      method: "DELETE",
      headers: { Origin: editorUrl(EDITOR_PORT) },
    });
    expect(response.status).toBe(204);
    expect(editorPort({})).toBe(EDITOR_PORT);
  });
});

describe("startEditor", () => {
  it("should listen on this computer only until closed", async () => {
    const { siteDir, clientDir } = await setup();
    const editor = await startEditor({ siteDir, clientDir, port: 51802 });
    expect(editor.url).toBe("http://127.0.0.1:51802");
    expect(await (await fetch(`${editor.url}/api/types`)).json()).toEqual({
      article: { labelSingle: "Article", labelPlural: "Articles" },
    });
    await editor.close();
    await expect(fetch(`${editor.url}/api/types`)).rejects.toThrow();
    // Closing again fails, as it isn't running
    await expect(editor.close()).rejects.toThrow("not running");
  });

  it("should fail when the port is taken", async () => {
    const { siteDir, clientDir } = await setup();
    const first = await startEditor({ siteDir, clientDir, port: 51801 });
    try {
      await expect(
        startEditor({ siteDir, clientDir, port: 51801 }),
      ).rejects.toThrow("EADDRINUSE");
    } finally {
      await first.close();
    }
  });
});
