import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { PREVIEW_CSP, createEditorApp, previewCsp } from "..";
import { ArticleStore } from "../../store";
import { loadSiteConfig } from "../../../generator/configFile";

const FIXTURE = fileURLToPath(
  new URL("../../../shared/tests/fixtures/site", import.meta.url),
);
const ORIGIN = "http://127.0.0.1:5180";

/** An editor app over a copy of the fixture site */
const setup = async () => {
  const dir = await mkdtemp(join(tmpdir(), "edaha-app-"));
  await cp(FIXTURE, dir, { recursive: true });
  const store = new ArticleStore(await loadSiteConfig({ siteDir: dir }));
  return {
    dir,
    store,
    app: createEditorApp(store, { allowedOrigins: [ORIGIN] }),
  };
};

/** Request options with the editor's origin and a JSON body */
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { Origin: ORIGIN, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const ARTICLE = {
  type: "article",
  slug: "new-one",
  status: "draft",
  date: "2026-10-19T09:54:00.000Z",
  title: "New one",
  tags: [],
  attachments: [],
  bodyHtml: "<p>Body</p>",
};

describe("createEditorApp", () => {
  it("should refuse changes from other origins", async () => {
    const { app } = await setup();
    for (const origin of [undefined, "https://evil.example"]) {
      const response = await app.request("/api/articles", {
        method: "POST",
        headers: origin ? { Origin: origin } : {},
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Forbidden" });
    }
  });

  it("should list and read articles", async () => {
    const { app } = await setup();
    expect(await (await app.request("/api/templates/article")).json()).toEqual([
      "single",
    ]);
    expect(await (await app.request("/api/types")).json()).toEqual({
      article: { labelSingle: "Article", labelPlural: "Articles" },
    });
    const list = (await (await app.request("/api/articles")).json()) as {
      slug: string;
    }[];
    expect(list.map((a) => a.slug)).toContain("first");
    const article = (await (
      await app.request("/api/articles/article/first")
    ).json()) as { title: string };
    expect(article.title).toBe("First article");
  });

  it("should create, save, move and delete articles", async () => {
    const { app } = await setup();
    const created = await app.request("/api/articles", json("POST", ARTICLE));
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ type: "article", slug: "new-one" });

    const moved = await app.request(
      "/api/articles/article/new-one",
      json("PUT", { ...ARTICLE, slug: "renamed" }),
    );
    expect(await moved.json()).toEqual({ type: "article", slug: "renamed" });

    const deleted = await app.request("/api/articles/article/renamed", {
      method: "DELETE",
      headers: { Origin: ORIGIN },
    });
    expect(deleted.status).toBe(204);
  });

  it("should answer editor errors with their status and message", async () => {
    const { app } = await setup();
    const missing = await app.request("/api/articles/article/missing");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      error: "Article article/missing not found",
    });
  });

  it("should answer unexpected errors with 500", async () => {
    const { app, store } = await setup();
    vi.spyOn(store, "list").mockRejectedValue(new Error("disk on fire"));
    const response = await app.request("/api/articles");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "disk on fire" });
  });

  it("should upload files and serve them with their type", async () => {
    const { app } = await setup();
    const body = new FormData();
    body.append("file", new File([new Uint8Array([1, 2, 3])], "Photo.PNG"));
    const uploaded = await app.request("/api/articles/article/first/files", {
      method: "POST",
      headers: { Origin: ORIGIN },
      body,
    });
    expect(uploaded.status).toBe(201);
    expect(await uploaded.json()).toEqual({
      name: "photo.png",
      url: "/files/article/first/photo.png",
    });

    const file = await app.request("/files/article/first/photo.png");
    expect(file.headers.get("content-type")).toBe("image/png");
    expect(file.headers.get("cache-control")).toBe("no-store");
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 2, 3]);

    const unknown = await app.request("/files/article/first/guide.pdf");
    expect(unknown.headers.get("content-type")).toBe("application/pdf");
  });

  it("should serve files without a known type as binary", async () => {
    const { app } = await setup();
    const body = new FormData();
    body.append("file", new File(["x"], "notes"));
    await app.request("/api/articles/article/first/files", {
      method: "POST",
      headers: { Origin: ORIGIN },
      body,
    });
    const file = await app.request("/files/article/first/notes");
    expect(file.headers.get("content-type")).toBe("application/octet-stream");
  });

  it("should render embed previews with their warnings", async () => {
    const { app } = await setup();
    const youtube = await app.request(
      `/api/embed?url=${encodeURIComponent("https://youtu.be/aju_UB5VIf8")}`,
    );
    const preview = (await youtube.json()) as {
      html: string;
      warnings: string[];
    };
    expect(preview.html).toContain("youtube-nocookie.com/embed/aju_UB5VIf8");
    expect(preview.warnings).toEqual([]);

    const unknown = (await (await app.request("/api/embed")).json()) as {
      html: string;
      warnings: string[];
    };
    expect(unknown.warnings).toEqual(['Preview: embed "" is not a valid URL']);
  });

  it("should render embeds and allow their frames in previews with the config file's renderers, then the given ones", async () => {
    const { dir } = await setup();
    await writeFile(
      join(dir, "edaha.config.mjs"),
      `import { readFileSync } from "node:fs";
import { parse } from "yaml";
export default {
  ...parse(readFileSync(new URL("./edahaconfig.yml", import.meta.url), "utf8")),
  embeds: [
    {
      name: "Example",
      frameSources: ["https://media.example.com"],
      match: (url) => url.hostname === "media.example.com",
      render: async (url) => \`<iframe src="\${url.href}"></iframe>\`,
    },
  ],
};
`,
    );
    const store = new ArticleStore(
      await loadSiteConfig({ configFile: join(dir, "edaha.config.mjs") }),
    );
    const app = createEditorApp(store, {
      allowedOrigins: [ORIGIN],
      embedRenderers: [],
    });
    const embed = (await (
      await app.request(
        `/api/embed?url=${encodeURIComponent("https://media.example.com/v/1")}`,
      )
    ).json()) as { html: string };
    expect(embed.html).toContain(
      '<iframe src="https://media.example.com/v/1">',
    );
    // No built-in renderers, so YouTube URLs are plain links
    const youtube = (await (
      await app.request(
        `/api/embed?url=${encodeURIComponent("https://youtu.be/aju_UB5VIf8")}`,
      )
    ).json()) as { html: string };
    expect(youtube.html).toContain('class="embed-link"');

    const created = await app.request(
      "/api/preview",
      json("POST", {
        data: {
          type: "article",
          slug: "embeds",
          status: "draft",
          date: "2026-10-19T09:54:00.000Z",
          title: "Embeds",
          tags: [],
          attachments: [],
          bodyHtml: '<div class="embed">https://media.example.com/v/1</div>',
        },
      }),
    );
    const { url } = (await created.json()) as { url: string };
    const page = await app.request(url);
    expect(await page.text()).toContain(
      '<iframe src="https://media.example.com/v/1">',
    );
    expect(page.headers.get("content-security-policy")).toBe(
      previewCsp(await store.embeds()),
    );
    expect(page.headers.get("content-security-policy")).toContain(
      "frame-src https://media.example.com;",
    );
  });

  it("should fetch embed data with the given fetch, or the global one", async () => {
    const page =
      '<meta property="og:video" content="https://bandcamp.com/EmbeddedPlayer/album=7/">';
    const fetch = vi.fn(
      async () => new Response(page),
    ) as unknown as typeof globalThis.fetch;
    const { store } = await setup();
    const url = encodeURIComponent("https://artist.bandcamp.com/album/name");
    const app = createEditorApp(store, { allowedOrigins: [ORIGIN], fetch });
    const preview = (await (
      await app.request(`/api/embed?url=${url}`)
    ).json()) as { html: string };
    expect(preview.html).toContain("EmbeddedPlayer/album=7/");

    const global = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(page));
    const defaultApp = createEditorApp(store, { allowedOrigins: [ORIGIN] });
    await defaultApp.request(`/api/embed?url=${url}`);
    expect(global).toHaveBeenCalled();
    global.mockRestore();
  });

  it("should convert bodies between editor HTML and Markdown, relative to the saved article", async () => {
    const { app } = await setup();
    const location = { type: "article", slug: "first" };
    const markdown = await app.request(
      "/api/convert/markdown",
      json("POST", {
        html: '<p><img src="/files/article/first/thumb.png" alt="A"></p>',
        location,
      }),
    );
    expect(await markdown.json()).toEqual({ markdown: "![A](thumb.png)" });
    const html = await app.request(
      "/api/convert/html",
      json("POST", { markdown: "![A](thumb.png)", location }),
    );
    expect(await html.json()).toEqual({
      html: '<p><img src="/files/article/first/thumb.png" alt="A"></p>\n',
    });
    // An unsaved article's relative URLs stay relative
    const unsaved = await app.request(
      "/api/convert/html",
      json("POST", { markdown: "![A](a.png)" }),
    );
    expect(await unsaved.json()).toEqual({
      html: '<p><img src="a.png" alt="A"></p>\n',
    });
    const bad = await app.request(
      "/api/convert/markdown",
      json("POST", { html: "", location: { type: "..", slug: "x" } }),
    );
    expect(bad.status).toBe(400);
  });

  it("should render previews of unsaved articles, with embeds", async () => {
    const { app } = await setup();
    const response = await app.request(
      "/api/preview",
      json("POST", {
        data: {
          ...ARTICLE,
          title: "Preview me",
          bodyHtml:
            '<h2>Hello there</h2><div class="embed">https://youtu.be/aju_UB5VIf8</div><div class="embed">not a URL</div>',
        },
      }),
    );
    expect(response.status).toBe(200);
    const { url } = (await response.json()) as { url: string };
    expect(url).toMatch(/^\/preview\/[0-9a-f-]{36}\/$/);
    const page = await app.request(url);
    expect(page.headers.get("content-type")).toMatch(/^text\/html/);
    expect(page.headers.get("content-security-policy")).toBe(PREVIEW_CSP);
    const html = await page.text();
    expect(html).toContain("Preview me");
    expect(html).toContain('<h2 id="hello-there">');
    expect(html).toContain("youtube-nocookie.com/embed/aju_UB5VIf8");
    // Embeds that can't be shown are links, without a warning
    expect(html).toContain("not a URL");

    const missing = await app.request(
      "/api/preview",
      json("POST", { data: { ...ARTICLE, thumbnail: "nope.png" } }),
    );
    expect(missing.status).toBe(400);
  });

  it("should serve the files previews share at the root, with the policy forbidding scripts", async () => {
    const { app, dir } = await setup();
    await mkdir(join(dir, "static"), { recursive: true });
    await writeFile(join(dir, "static/site.css"), "body {}");
    await writeFile(join(dir, "static/notes"), "x");
    await app.request("/api/preview", json("POST", { data: ARTICLE }));
    const css = await app.request("/site.css");
    expect(css.headers.get("content-type")).toMatch(/^text\/css/);
    expect(css.headers.get("content-security-policy")).toBe(PREVIEW_CSP);
    expect(await css.text()).toBe("body {}");
    expect((await app.request("/notes")).headers.get("content-type")).toBe(
      "application/octet-stream",
    );
    expect((await app.request("/missing.css")).status).toBe(404);
    expect((await app.request("/preview/nope/")).status).toBe(404);
  });

  it("should forbid scripts, requests and forms in previews, but allow the embeds", () => {
    expect(PREVIEW_CSP).toContain("script-src 'none'");
    expect(PREVIEW_CSP).toContain("connect-src 'none'");
    expect(PREVIEW_CSP).toContain("form-action 'none'");
    expect(PREVIEW_CSP).toContain(
      "frame-src https://www.youtube-nocookie.com https://bandcamp.com",
    );
    // No frames without renderers that declare them, and each origin once
    expect(previewCsp([])).toContain("frame-src 'none';");
    const renderer = {
      name: "A",
      frameSources: ["https://a.example.com"],
      match: () => false,
      render: async () => "",
    };
    const frameless = { ...renderer, frameSources: undefined };
    expect(previewCsp([frameless])).toContain("frame-src 'none';");
    expect(previewCsp([renderer, { ...renderer, name: "B" }])).toContain(
      "frame-src https://a.example.com;",
    );
  });

  it("should require a file when uploading", async () => {
    const { app } = await setup();
    const body = new FormData();
    body.append("file", "not a file");
    const response = await app.request("/api/articles/article/first/files", {
      method: "POST",
      headers: { Origin: ORIGIN },
      body,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Expected a file in the "file" field',
    });
  });
});
