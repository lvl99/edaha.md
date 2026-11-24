import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import type { EmbedPlugin } from "@lvl99dotcom/edaha.md/embeds";
import {
  articleQuery,
  createEditorApp,
  fileQuery,
  previewCsp,
  previewOriginOf,
  sharedFile,
} from "..";
import { ArticleStore, EditorError } from "../../store";
import { loadSiteConfig } from "@lvl99dotcom/edaha.md/generator/configFile";

const FIXTURE = fileURLToPath(
  new URL(
    "../../../../../edaha/src/shared/tests/fixtures/site",
    import.meta.url,
  ),
);
const ORIGIN = "http://127.0.0.1:5180";

/** An embed plugin for tests: a frame, with a stylesheet and a script once per page, and its own look in the editor */
const MEDIA = {
  key: "media",
  name: "Media",
  description: "A media player",
  info: "Paste the media's URL",
  contentOptional: true,
  options: {
    size: {
      title: "Size",
      type: "string",
      enum: ["small", "large"],
      $edahaField: { select: true, defaultValue: "small" },
    },
  },
  sources: {
    frame: ["https://media.example.com"],
    script: ["https://cdn.example.com"],
    style: ["https://cdn.example.com"],
  },
  build: {
    render: async (content: string) => `<iframe src="${content}"></iframe>`,
    renderHead: async () =>
      '<link rel="stylesheet" href="https://cdn.example.com/media.css">',
    renderFoot: async () => "<script>/* media */</script>",
  },
  editor: {
    icon: "<svg></svg>",
    render: async (content: string, { options }) =>
      `<p>Editing ${content} (${options.size as string})</p>`,
  },
} satisfies EmbedPlugin;

/** An editor app over a copy of the fixture site */
const setup = async (options: { plugins?: EmbedPlugin[] } = {}) => {
  const dir = await mkdtemp(join(tmpdir(), "edaha-app-"));
  await cp(FIXTURE, dir, { recursive: true });
  const store = new ArticleStore(
    await loadSiteConfig({ siteDir: dir }),
    undefined,
    { watch: false },
  );
  return {
    dir,
    store,
    app: createEditorApp(store, { allowedOrigins: [ORIGIN], ...options }),
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
    expect(await (await app.request("/api/site")).json()).toEqual({
      name: "Test News",
      uploadTo: "article",
      author: { name: "Test News" },
      types: {},
    });
    expect(await (await app.request("/api/types")).json()).toEqual({
      article: { labelSingle: "Article", labelPlural: "Articles" },
    });
    const page = (await (await app.request("/api/articles")).json()) as {
      articles: { slug: string }[];
      total: number;
    };
    expect(page.articles.map((a) => a.slug)).toContain("first");
    expect(page.total).toBe(5);
    const article = (await (
      await app.request("/api/articles/article/first")
    ).json()) as { title: string };
    expect(article.title).toBe("First article");
  });

  it("should search articles, and give each type's recent articles and the filters' choices", async () => {
    const { app } = await setup();
    const found = (await (
      await app.request(
        "/api/articles?search=article&tag=news&sort=title&perPage=1&page=2",
      )
    ).json()) as { articles: { slug: string }[]; total: number; page: number };
    expect(found).toMatchObject({ total: 2, page: 2 });
    expect(found.articles.map((a) => a.slug)).toEqual(["second"]);
    const recent = (await (
      await app.request("/api/articles/recent")
    ).json()) as { type: string; total: number }[];
    expect(recent.map(({ type, total }) => [type, total])).toEqual([
      ["article", 4],
      ["page", 1],
    ]);
    expect(await (await app.request("/api/articles/filters")).json()).toEqual({
      types: ["article", "page"],
      authors: ["Matt Scheurich", "Zoë Ångström"],
      tags: ["News", "Release Notes"],
    });
  });

  it("should find, replace and delete files, refusing changes from other origins", async () => {
    const { app } = await setup();
    const found = (await (
      await app.request("/api/files?kind=image&sort=name")
    ).json()) as { files: { name: string; url: string }[]; total: number };
    expect(found.files).toEqual([
      expect.objectContaining({
        name: "thumb.png",
        url: "/news/first/thumb.png",
      }),
    ]);
    expect(await (await app.request("/api/files/filters")).json()).toEqual({
      kinds: ["document", "image"],
      types: ["article"],
    });
    expect(
      await (
        await app.request("/api/files/article/first/guide.pdf/references")
      ).json(),
    ).toEqual([{ type: "article", slug: "first" }]);

    const upload = (name: string) => {
      const body = new FormData();
      body.append("file", new File([new Uint8Array([1])], name));
      return body;
    };
    expect(
      (
        await app.request("/api/files/article/first/thumb.png", {
          method: "PUT",
          body: upload("thumb.png"),
        })
      ).status,
    ).toBe(403);
    const replaced = await app.request("/api/files/article/first/thumb.png", {
      method: "PUT",
      headers: { Origin: ORIGIN },
      body: upload("Cover.png"),
    });
    expect(await replaced.json()).toEqual({
      name: "cover.png",
      articles: [{ type: "article", slug: "first" }],
    });
    const noFile = await app.request("/api/files/article/first/cover.png", {
      method: "PUT",
      headers: { Origin: ORIGIN },
      body: new FormData(),
    });
    expect(noFile.status).toBe(400);
    const deleted = await app.request("/api/files/article/first/cover.png", {
      method: "DELETE",
      headers: { Origin: ORIGIN },
    });
    expect(await deleted.json()).toEqual({
      articles: [{ type: "article", slug: "first" }],
    });
    expect(
      (await app.request("/api/files/article/first/cover.png/references"))
        .status,
    ).toBe(404);
  });

  it("should find, replace and delete shared files by their path, and serve them at their path on the website", async () => {
    const { app, dir } = await setup();
    await mkdir(join(dir, "files/2026/11"), { recursive: true });
    await writeFile(join(dir, "files/2026/11/photo.jpg"), "photo");
    await writeFile(join(dir, "files/logo.png"), "logo");
    await writeFile(
      join(dir, "articles/article/first/article.md"),
      `${await readFile(join(dir, "articles/article/first/article.md"), "utf8")}\n![](/files/2026/11/photo.jpg)\n`,
    );

    const found = (await (
      await app.request("/api/files?type=%40shared")
    ).json()) as { files: { slug: string; name: string; url: string }[] };
    expect(found.files.map(({ url }) => url)).toEqual([
      "/files/logo.png",
      "/files/2026/11/photo.jpg",
    ]);
    expect(
      await (
        await app.request("/api/shared-files/references?path=2026/11/photo.jpg")
      ).json(),
    ).toEqual([{ type: "article", slug: "first" }]);

    const served = await app.request("/files/2026/11/photo.jpg");
    expect(served.headers.get("content-type")).toBe("image/jpeg");
    expect(await served.text()).toBe("photo");
    expect(await (await app.request("/files/logo.png")).text()).toBe("logo");

    const body = new FormData();
    body.append("file", new File([new Uint8Array([1])], "Photo 2.jpg"));
    expect(
      (
        await app.request("/api/shared-files?path=2026/11/photo.jpg", {
          method: "PUT",
          body,
        })
      ).status,
    ).toBe(403);
    const replaced = await app.request(
      "/api/shared-files?path=2026/11/photo.jpg",
      { method: "PUT", headers: { Origin: ORIGIN }, body },
    );
    expect(await replaced.json()).toEqual({
      name: "photo-2.jpg",
      articles: [{ type: "article", slug: "first" }],
    });
    const deleted = await app.request("/api/shared-files?path=logo.png", {
      method: "DELETE",
      headers: { Origin: ORIGIN },
    });
    expect(await deleted.json()).toEqual({ articles: [] });
    for (const path of ["", "../edahaconfig.yml", "logo.png"])
      expect(
        (
          await app.request(`/api/shared-files?path=${path}`, {
            method: "DELETE",
            headers: { Origin: ORIGIN },
          })
        ).status,
      ).toBe(404);
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

  it("should give the custom metadata fields, and the problems when saving is refused", async () => {
    const { app, store } = await setup();
    expect(await (await app.request("/api/metadata")).json()).toMatchObject({
      definitions: {},
      types: {},
      groups: [
        { key: "info" },
        { key: "categorise" },
        { key: "customise" },
        { key: "files" },
        { key: "custom" },
      ],
    });
    const problems = [{ path: "a", message: "is wrong", level: "error" }];
    vi.spyOn(store, "save").mockRejectedValue(
      new EditorError(400, "Some values aren't valid", problems as never),
    );
    const refused = await app.request(
      "/api/articles/article/first",
      json("PUT", ARTICLE),
    );
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({
      error: "Some values aren't valid",
      problems,
    });
  });

  it("should answer unexpected errors with 500", async () => {
    const { app, store } = await setup();
    vi.spyOn(store, "query").mockRejectedValue(new Error("disk on fire"));
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
      type: "article",
      slug: "first",
      name: "photo.png",
      url: "/files/article/first/photo.png",
      reference: "photo.png",
    });

    const file = await app.request("/files/article/first/photo.png");
    expect(file.headers.get("content-type")).toBe("image/png");
    expect(file.headers.get("cache-control")).toBe("no-store");
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 2, 3]);

    const unknown = await app.request("/files/article/first/guide.pdf");
    expect(unknown.headers.get("content-type")).toBe("application/pdf");
  });

  it("should answer an upload with a file's name with the conflict, and upload it renamed or overwriting it", async () => {
    const { app, dir } = await setup();
    const upload = (fields: Record<string, string> = {}) => {
      const body = new FormData();
      body.append("file", new File([new Uint8Array([1, 2])], "thumb.png"));
      for (const [name, value] of Object.entries(fields))
        body.append(name, value);
      return app.request("/api/articles/article/first/files", {
        method: "POST",
        headers: { Origin: ORIGIN },
        body,
      });
    };
    const conflict = await upload();
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({
      error: "A file called thumb.png is already in article/first",
      conflict: {
        incoming: { name: "thumb.png", kind: "image", size: 2 },
        existing: { name: "thumb.png", url: "/news/first/thumb.png" },
      },
    });
    expect(await (await upload({ name: "Thumb 2.png" })).json()).toMatchObject({
      name: "thumb-2.png",
    });
    expect((await upload({ overwrite: "true" })).status).toBe(201);
    expect([
      ...(await readFile(join(dir, "articles/article/first/thumb.png"))),
    ]).toEqual([1, 2]);

    const body = new FormData();
    body.append("file", new File(["x"], "notes.txt"));
    const noArticle = await app.request("/api/files", {
      method: "POST",
      headers: { Origin: ORIGIN },
      body,
    });
    expect(noArticle.status).toBe(400);
    expect(await noArticle.json()).toEqual({
      error: "Choose an article to upload the file to",
    });
  });

  it("should upload files to the shared files folder when the config file says so", async () => {
    const { dir } = await setup();
    await writeFile(
      join(dir, "edahaconfig.yml"),
      `${await readFile(join(dir, "edahaconfig.yml"), "utf8")}files:\n  uploadTo: files\n`,
    );
    const shared = createEditorApp(
      new ArticleStore(await loadSiteConfig({ siteDir: dir }), undefined, {
        watch: false,
      }),
      { allowedOrigins: [ORIGIN] },
    );
    const body = new FormData();
    body.append("file", new File(["x"], "notes.txt"));
    const uploaded = await shared.request("/api/files", {
      method: "POST",
      headers: { Origin: ORIGIN },
      body,
    });
    expect(await uploaded.json()).toEqual({
      type: "@shared",
      slug: "",
      name: "notes.txt",
      url: "/files/notes.txt",
      reference: "/files/notes.txt",
    });
    expect(await readFile(join(dir, "files/notes.txt"), "utf8")).toBe("x");
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

  it("should list the embed plugins: the config file's, then the given ones", async () => {
    const { dir } = await setup();
    await writeFile(
      join(dir, "edaha.config.mjs"),
      // The config file's folder is outside the workspace, so it can only import Node.js's own modules
      `export default {
  ...${JSON.stringify(parse(await readFile(join(dir, "edahaconfig.yml"), "utf8")))},
  plugins: [{ key: "quote", name: "Quote", build: { render: async (text) => text } }],
};
`,
    );
    const store = new ArticleStore(
      await loadSiteConfig({ configFile: join(dir, "edaha.config.mjs") }),
      undefined,
      { watch: false },
    );
    const app = createEditorApp(store, {
      allowedOrigins: [ORIGIN],
      plugins: [MEDIA, { ...MEDIA, key: "quote", name: "Not used" }],
    });
    expect(await (await app.request("/api/embeds")).json()).toEqual([
      { key: "quote", name: "Quote" },
      {
        key: "media",
        name: "Media",
        description: "A media player",
        info: "Paste the media's URL",
        contentOptional: true,
        icon: "<svg></svg>",
        options: MEDIA.options,
      },
    ]);
  });

  it("should show embed blocks in sandboxed frames, rendered for the editor, with their warnings", async () => {
    const { app } = await setup({ plugins: [MEDIA] });
    const created = await app.request(
      "/api/embed-frames",
      json("POST", { key: "media", content: "https://media.example.com/v/1" }),
    );
    const frame = (await created.json()) as { url: string; warnings: string[] };
    expect(frame.url).toMatch(/^\/embed-frame\/[0-9a-f]{32}\/$/);
    expect(frame.warnings).toEqual([]);
    // The same block keeps its frame's URL
    const again = await app.request(
      "/api/embed-frames",
      json("POST", { key: "media", content: "https://media.example.com/v/1" }),
    );
    expect(((await again.json()) as { url: string }).url).toBe(frame.url);

    const page = await app.request(`${frame.url}?theme=dark`);
    expect(page.headers.get("content-type")).toMatch(/^text\/html/);
    expect(page.headers.get("content-security-policy")).toBe(
      previewCsp([MEDIA], "http://localhost", [ORIGIN]),
    );
    const html = await page.text();
    expect(html).toContain('<html lang="en" data-theme="dark"');
    expect(html).toContain(
      '<div class="embed embed-media"><p>Editing https://media.example.com/v/1 (small)</p></div>',
    );
    expect(html).toContain(
      '<link rel="stylesheet" href="https://cdn.example.com/media.css">',
    );
    expect(html).toContain("<script>/* media */</script>");
    expect(html).toContain("edahaEmbedHeight");
    // Without a theme, the frame follows the visitor's setting
    expect(await (await app.request(frame.url)).text()).toContain(
      '<html lang="en">',
    );

    const unknown = await app.request(
      "/api/embed-frames",
      json("POST", { key: "nope", content: "Hello" }),
    );
    const { url, warnings } = (await unknown.json()) as {
      url: string;
      warnings: string[];
    };
    expect(warnings).toEqual([
      'Embed: no embed plugin with the key "nope"; shown as it is',
    ]);
    expect(await (await app.request(url)).text()).toContain(
      '<pre class="embed-text">Hello</pre>',
    );
    expect((await app.request("/embed-frame/nope/")).status).toBe(404);

    // With options, which another frame shows
    const large = await app.request(
      "/api/embed-frames",
      json("POST", {
        key: "media",
        content: "https://media.example.com/v/1",
        options: { size: "large" },
      }),
    );
    const largeUrl = ((await large.json()) as { url: string }).url;
    expect(largeUrl).not.toBe(frame.url);
    expect(await (await app.request(largeUrl)).text()).toContain(
      "<p>Editing https://media.example.com/v/1 (large)</p>",
    );
  });

  it("should check embed blocks' content with their plugins", async () => {
    const checked = {
      ...MEDIA,
      validate: (content: string) => {
        if (!content.startsWith("https://")) throw new Error("Not a URL");
        return true;
      },
    };
    const { app } = await setup({ plugins: [checked] });
    const check = async (key: string, content: string, options?: unknown) =>
      (
        await (
          await app.request(
            "/api/embed-validations",
            json("POST", { key, content, options }),
          )
        ).json()
      ).errors as string[];
    expect(await check("media", "https://media.example.com/v/1")).toEqual([]);
    expect(await check("media", "v/1")).toEqual(["Not a URL"]);
    expect(await check("nope", "x")).toEqual([
      'No embed plugin with the key "nope"',
    ]);
    // Options are checked too; options that aren't a map are none
    expect(
      await check("media", "https://media.example.com/v/1", { size: "huge" }),
    ).toEqual(['Size must be one of "small", "large"']);
    expect(
      await check("media", "https://media.example.com/v/1", ["large"]),
    ).toEqual([]);
    expect(
      (
        await (
          await app.request("/api/embed-validations", json("POST", {}))
        ).json()
      ).errors,
    ).toEqual([
      "Embed blocks need a key, e.g. <!-- embed:youtube -->...<!-- /embed:youtube -->",
    ]);
    // Content that isn't valid has no frame, and its errors are given apart from other problems
    const frame = await app.request(
      "/api/embed-frames",
      json("POST", { key: "media", content: "v/1" }),
    );
    expect(await frame.json()).toEqual({
      url: "",
      errors: ["Not a URL"],
      warnings: [],
    });
    // Like other changes, only the editor page may ask
    const other = await app.request("/api/embed-validations", {
      method: "POST",
      body: "{}",
    });
    expect(other.status).toBe(403);
  });

  it("should fetch embed data with the given fetch, or the global one", async () => {
    const fetching = {
      ...MEDIA,
      key: "fetching",
      build: {
        render: async (
          content: string,
          { fetch }: { fetch: typeof globalThis.fetch },
        ) => (await fetch(content)).text(),
      },
      editor: undefined,
    };
    const fetch = vi.fn(
      async () => new Response("<p>Fetched</p>"),
    ) as unknown as typeof globalThis.fetch;
    const { store } = await setup();
    const app = createEditorApp(store, {
      allowedOrigins: [ORIGIN],
      fetch,
      plugins: [fetching],
    });
    const created = await app.request(
      "/api/embed-frames",
      json("POST", { key: "fetching", content: "https://example.com/a" }),
    );
    const { url } = (await created.json()) as { url: string };
    expect(await (await app.request(url)).text()).toContain("<p>Fetched</p>");

    const global = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("<p>Global</p>"));
    const defaultApp = createEditorApp(store, {
      allowedOrigins: [ORIGIN],
      plugins: [fetching],
    });
    await defaultApp.request(
      "/api/embed-frames",
      json("POST", { key: "fetching", content: "https://example.com/b" }),
    );
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

  it("should render previews of unsaved articles, with embeds and what their page needs once", async () => {
    const { app } = await setup({ plugins: [MEDIA] });
    const response = await app.request(
      "/api/preview",
      json("POST", {
        data: {
          ...ARTICLE,
          title: "Preview me",
          bodyHtml:
            '<h2>Hello there</h2><div class="embed" data-embed="media" data-content="https://media.example.com/v/1"></div><div class="embed" data-embed="nope" data-content="not shown"></div>',
        },
      }),
    );
    expect(response.status).toBe(200);
    const { url } = (await response.json()) as { url: string };
    expect(url).toMatch(/^\/preview\/[0-9a-f-]{36}\/$/);
    const page = await app.request(url);
    expect(page.headers.get("content-type")).toMatch(/^text\/html/);
    expect(page.headers.get("content-security-policy")).toBe(
      previewCsp([MEDIA], "http://localhost", [ORIGIN]),
    );
    const html = await page.text();
    expect(html).toContain("Preview me");
    expect(html).toContain('<h2 id="hello-there">');
    // As the website shows it, not as the editor does
    expect(html).toContain('<iframe src="https://media.example.com/v/1">');
    expect(html).toMatch(/<script>\/\* media \*\/<\/script>\s*<\/body>/);
    // Embeds that can't be shown are shown as they are written, without a warning
    expect(html).toContain('<pre class="embed-text">not shown</pre>');

    const missing = await app.request(
      "/api/preview",
      json("POST", { data: { ...ARTICLE, thumbnail: "nope.png" } }),
    );
    expect(missing.status).toBe(400);
  });

  it("should give a preview's outputs, and render each of them with its content type", async () => {
    const { app, dir } = await setup();
    await mkdir(join(dir, "templates/article"), { recursive: true });
    await writeFile(
      join(dir, "templates/article/single.json.njk"),
      '{ "title": {{ article.title | json | safe }} }',
    );
    const response = await app.request(
      "/api/preview",
      json("POST", { data: { ...ARTICLE, title: "Both" } }),
    );
    const { url, outputs } = (await response.json()) as {
      url: string;
      outputs: string[];
    };
    expect(outputs).toEqual(["html", "json"]);
    const page = await app.request(`${url}index.json`);
    expect(page.headers.get("content-type")).toMatch(/^application\/json/);
    expect(page.headers.get("content-security-policy")).toBe(
      previewCsp([], "http://localhost", [ORIGIN]),
    );
    expect(await page.json()).toEqual({ title: "Both" });
    expect((await app.request(`${url}index.xml`)).status).toBe(404);
    expect((await app.request("/preview/nope/index.json")).status).toBe(404);
  });

  it("should serve the files previews share at the root, sandboxed like them", async () => {
    const { app, dir } = await setup();
    await mkdir(join(dir, "static"), { recursive: true });
    await writeFile(join(dir, "static/site.css"), "body {}");
    await writeFile(join(dir, "static/notes"), "x");
    await app.request("/api/preview", json("POST", { data: ARTICLE }));
    const css = await app.request("/site.css");
    expect(css.headers.get("content-type")).toMatch(/^text\/css/);
    expect(css.headers.get("content-security-policy")).toBe(
      previewCsp([], "http://localhost", [ORIGIN]),
    );
    expect(await css.text()).toBe("body {}");
    expect((await app.request("/notes")).headers.get("content-type")).toBe(
      "application/octet-stream",
    );
    expect((await app.request("/missing.css")).status).toBe(404);
    expect((await app.request("/preview/nope/")).status).toBe(404);
  });

  it("should sandbox previews in their own origin, allowing their own scripts and styles and the embeds' sources", () => {
    const self = "http://localhost:5180";
    const csp = previewCsp([MEDIA, { ...MEDIA, key: "b" }], self, [ORIGIN]);
    // Their own origin, so embedded players (e.g. Bandcamp's) keep theirs
    expect(csp).toMatch(
      /^sandbox allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox; /,
    );
    // Only the editor's pages may show them in frames
    expect(csp).toContain(`frame-ancestors 'self' ${ORIGIN}`);
    expect(csp).toContain(`default-src ${self};`);
    expect(csp).toContain(
      `script-src ${self} 'unsafe-inline' https://cdn.example.com;`,
    );
    expect(csp).toContain(
      `style-src ${self} 'unsafe-inline' https://cdn.example.com;`,
    );
    expect(csp).toContain(`font-src ${self} data:;`);
    // Each origin once
    expect(csp).toContain("frame-src https://media.example.com;");
    expect(csp).toContain("form-action 'none'");
    // Without sources, no frames or requests
    const none = previewCsp([], self);
    expect(none).toContain("frame-src 'none';");
    expect(none).toContain("connect-src 'none';");
    expect(none).toContain(`script-src ${self} 'unsafe-inline';`);
    expect(none).toContain("frame-ancestors 'self'");
  });

  it("should answer nothing from the API at the previews' own origin", async () => {
    const dir = await mkdtemp(join(tmpdir(), "edaha-app-"));
    await cp(FIXTURE, dir, { recursive: true });
    const store = new ArticleStore(
      await loadSiteConfig({ siteDir: dir }),
      undefined,
      { watch: false },
    );
    const app = createEditorApp(store, {
      allowedOrigins: [ORIGIN],
      previewOrigin: "http://localhost:5180",
    });
    expect(
      (await app.request("http://localhost:5180/api/articles")).status,
    ).toBe(404);
    expect((await app.request(`${ORIGIN}/api/articles`)).status).toBe(200);
    // Previews and their files are there
    const created = await app.request(
      `${ORIGIN}/api/preview`,
      json("POST", { data: ARTICLE }),
    );
    const { url } = (await created.json()) as { url: string };
    expect((await app.request(`http://localhost:5180${url}`)).status).toBe(200);
  });

  it("should give the previews' origin for an editor's address", () => {
    expect(previewOriginOf("http://127.0.0.1:5180")).toBe(
      "http://localhost:5180",
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

describe("sharedFile", () => {
  it("should split a shared file's path into its folder and name", () => {
    expect(sharedFile("2026/11/photo.png")).toEqual({
      slug: "2026/11",
      name: "photo.png",
    });
    expect(sharedFile("logo.png")).toEqual({ slug: "", name: "logo.png" });
  });

  it("should refuse a missing or unsafe path", () => {
    for (const path of [undefined, "", "../secret", "a//b", ".hidden"])
      expect(() => sharedFile(path)).toThrow("File not found");
  });
});

describe("articleQuery", () => {
  it("should read a query from search parameters, leaving out what it can't use", () => {
    expect(
      articleQuery(
        new URLSearchParams(
          "search=hi&type=news&author=Matt&tag=News&status=draft&problems=errors&sort=title&order=desc&page=2&perPage=10",
        ),
      ),
    ).toEqual({
      search: "hi",
      type: "news",
      author: "Matt",
      tag: "News",
      status: "draft",
      problems: "errors",
      sort: "title",
      order: "desc",
      page: 2,
      perPage: 10,
    });
    expect(
      articleQuery(
        new URLSearchParams(
          "search=&status=gone&problems=lots&sort=random&order=sideways&page=two",
        ),
      ),
    ).toEqual({});
    for (const problems of ["warnings", "any"])
      expect(articleQuery(new URLSearchParams(`problems=${problems}`))).toEqual(
        { problems },
      );
    expect(articleQuery(new URLSearchParams("sort=status"))).toEqual({
      sort: "status",
    });
    expect(articleQuery(new URLSearchParams("sort=date&order=asc"))).toEqual({
      sort: "date",
      order: "asc",
    });
    expect(articleQuery(new URLSearchParams("sort=updated"))).toEqual({
      sort: "updated",
    });
  });
});

describe("fileQuery", () => {
  it("should read a file query from search parameters, leaving out what it can't use", () => {
    expect(
      fileQuery(
        new URLSearchParams(
          "search=photo&kind=image&type=news&sort=size&order=asc&page=2&perPage=10",
        ),
      ),
    ).toEqual({
      search: "photo",
      kind: "image",
      type: "news",
      sort: "size",
      order: "asc",
      page: 2,
      perPage: 10,
    });
    expect(
      fileQuery(
        new URLSearchParams("kind=video-game&sort=colour&order=up&page=x"),
      ),
    ).toEqual({});
    expect(fileQuery(new URLSearchParams("order=desc"))).toEqual({
      order: "desc",
    });
  });
});
