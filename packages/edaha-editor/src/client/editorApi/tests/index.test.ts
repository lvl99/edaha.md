// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { EditorApi } from "..";

/** A fetch answering with a status and JSON body (or raw text) */
const answer = (status: number, body?: unknown) =>
  vi.fn(
    async () =>
      new Response(
        body === undefined
          ? null
          : typeof body === "string"
            ? body
            : JSON.stringify(body),
        { status },
      ),
  );

const LOCATION = { type: "article", slug: "hello" };

describe("EditorApi", () => {
  it("should use the global fetch by default", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("[]"));
    expect(await new EditorApi().recent()).toEqual([]);
    expect(fetch).toHaveBeenCalledWith("/api/articles/recent", undefined);
    fetch.mockRestore();
  });

  it("should reach an editor server that isn't the page's at its address", async () => {
    const fetch = answer(200, []);
    const api = new EditorApi({ baseUrl: "http://127.0.0.1:5193/", fetch });
    expect(api.baseUrl).toBe("http://127.0.0.1:5193");
    await api.recent();
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:5193/api/articles/recent",
      undefined,
    );
    expect(api.url("/files/news/a/b.png")).toBe(
      "http://127.0.0.1:5193/files/news/a/b.png",
    );
    // Other addresses are kept as they are
    for (const address of ["https://x.dev/a.png", "//cdn.dev/a.png", "a.png"])
      expect(api.url(address)).toBe(address);
    expect(api.previewUrl("/preview/1/")).toBe(
      "http://localhost:5193/preview/1/",
    );
  });

  it("should use the page's own server by default", async () => {
    const api = new EditorApi({});
    expect(api.baseUrl).toBe("");
    expect(api.url("/files/news/a/b.png")).toBe("/files/news/a/b.png");
    expect(api.previewUrl("/preview/1/")).toBe("/preview/1/");
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("[]"));
    await api.recent();
    expect(fetch).toHaveBeenCalledWith("/api/articles/recent", undefined);
    fetch.mockRestore();
  });

  it("should call each route", async () => {
    const fetch = answer(200, { ok: true });
    const api = new EditorApi(fetch);
    const data = { title: "Hi" } as never;
    await api.query();
    await api.query({
      search: "hi there",
      type: "news",
      author: "",
      tag: undefined,
      sort: "title",
      page: 2,
    });
    await api.recent();
    await api.filters();
    await api.queryFiles();
    await api.queryFiles({ kind: "image", sort: "size", order: "desc" });
    await api.fileFilters();
    await api.metadata();
    await api.site();
    await api.fileReferences({ ...LOCATION, name: "my photo.png" });
    await api.replaceFile(
      { ...LOCATION, name: "a.png" },
      new File(["x"], "b.png"),
    );
    await api.deleteFile({ ...LOCATION, name: "a.png" });
    const shared = { type: "@shared", slug: "2026/11", name: "a b.png" };
    await api.fileReferences(shared);
    await api.replaceFile(shared, new File(["x"], "b.png"));
    await api.deleteFile({ ...shared, slug: "" });
    await api.types();
    await api.templates("page");
    await api.read(LOCATION);
    await api.create(data);
    await api.save(LOCATION, data);
    await api.upload(LOCATION, new File(["x"], "a.png"));
    await api.upload(undefined, new File(["x"], "a.png"), {
      name: "b.png",
      overwrite: true,
    });
    await api.embeds();
    await api.embedFrame("youtube", "https://youtu.be/x");
    await api.validateEmbed("youtube", "x", { size: 1 });
    const calls = fetch.mock.calls as unknown as [string, RequestInit?][];
    expect(
      calls.map(([path, init]) => `${init?.method ?? "GET"} ${path}`),
    ).toEqual([
      "GET /api/articles",
      "GET /api/articles?search=hi+there&type=news&sort=title&page=2",
      "GET /api/articles/recent",
      "GET /api/articles/filters",
      "GET /api/files",
      "GET /api/files?kind=image&sort=size&order=desc",
      "GET /api/files/filters",
      "GET /api/metadata",
      "GET /api/site",
      "GET /api/files/article/hello/my%20photo.png/references",
      "PUT /api/files/article/hello/a.png",
      "DELETE /api/files/article/hello/a.png",
      "GET /api/shared-files/references?path=2026%2F11%2Fa%20b.png",
      "PUT /api/shared-files?path=2026%2F11%2Fa%20b.png",
      "DELETE /api/shared-files?path=a%20b.png",
      "GET /api/types",
      "GET /api/templates/page",
      "GET /api/articles/article/hello",
      "POST /api/articles",
      "PUT /api/articles/article/hello",
      "POST /api/articles/article/hello/files",
      "POST /api/files",
      "GET /api/embeds",
      "POST /api/embed-frames",
      "POST /api/embed-validations",
    ]);
    // An upload's other name and overwriting are sent with the file
    const upload = calls[21]![1]!.body as FormData;
    expect([upload.get("name"), upload.get("overwrite")]).toEqual([
      "b.png",
      "true",
    ]);
    expect((calls[20]![1]!.body as FormData).has("name")).toBe(false);
    // Without options, none are sent
    expect(calls[23]![1]!.body).toBe(
      '{"key":"youtube","content":"https://youtu.be/x","options":{}}',
    );
    expect(calls[24]![1]!.body).toBe(
      '{"key":"youtube","content":"x","options":{"size":1}}',
    );
    expect(
      (calls[10]![1]!.body as FormData).get("file") as File,
    ).toHaveProperty("name", "b.png");
    expect(calls[18]![1]).toMatchObject({
      headers: { "Content-Type": "application/json" },
      body: '{"title":"Hi"}',
    });
    expect((calls[20]![1]!.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("should convert bodies and render previews, returning their result", async () => {
    const fetch = vi.fn(
      async (path: string) =>
        new Response(
          JSON.stringify(
            path.endsWith("markdown")
              ? { markdown: "**Hi**" }
              : path.endsWith("preview")
                ? { url: "/preview/x/", outputs: ["html"] }
                : { html: "<p>Hi</p>" },
          ),
        ),
    );
    const api = new EditorApi(fetch as unknown as typeof globalThis.fetch);
    const data = { title: "Hi" } as never;
    expect(await api.toMarkdown("<p>x</p>", LOCATION)).toBe("**Hi**");
    expect(await api.toHtml("x")).toBe("<p>Hi</p>");
    expect(await api.preview(data, LOCATION)).toEqual({
      url: "/preview/x/",
      outputs: ["html"],
    });
    const calls = fetch.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([path, init]) => [path, init.method, init.body])).toEqual(
      [
        [
          "/api/convert/markdown",
          "POST",
          JSON.stringify({ html: "<p>x</p>", location: LOCATION }),
        ],
        ["/api/convert/html", "POST", JSON.stringify({ markdown: "x" })],
        ["/api/preview", "POST", JSON.stringify({ data, location: LOCATION })],
      ],
    );
  });

  it("should return nothing for 204 responses", async () => {
    expect(await new EditorApi(answer(204)).remove(LOCATION)).toBeUndefined();
  });

  it("should give the problems when saving was refused because of them", async () => {
    const problems = [{ path: "a", message: "is wrong", level: "error" }];
    await expect(
      new EditorApi(answer(400, { error: "Not valid", problems })).save(
        LOCATION,
        {} as never,
      ),
    ).rejects.toMatchObject({ message: "Not valid", problems });
  });

  it("should give the two files when a file couldn't be saved because another has its name", async () => {
    const conflict = {
      incoming: { name: "a.png", kind: "image", size: 1 },
      existing: { type: "news", slug: "hello", name: "a.png" },
    };
    await expect(
      new EditorApi(answer(409, { error: "Exists", conflict })).upload(
        LOCATION,
        new File(["x"], "a.png"),
      ),
    ).rejects.toMatchObject({ message: "Exists", conflict });
  });

  it("should throw the server's error message, or the status", async () => {
    await expect(
      new EditorApi(answer(409, { error: "Exists" })).recent(),
    ).rejects.toThrow("Exists");
    await expect(
      new EditorApi(answer(500, "not json")).recent(),
    ).rejects.toThrow("Request failed with 500");
  });
});
