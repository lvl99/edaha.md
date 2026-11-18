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
    await api.types();
    await api.templates("page");
    await api.read(LOCATION);
    await api.create(data);
    await api.save(LOCATION, data);
    await api.upload(LOCATION, new File(["x"], "a.png"));
    await api.embedPreview("https://youtu.be/x?a=1&b=2");
    const calls = fetch.mock.calls as unknown as [string, RequestInit?][];
    expect(
      calls.map(([path, init]) => `${init?.method ?? "GET"} ${path}`),
    ).toEqual([
      "GET /api/articles",
      "GET /api/articles?search=hi+there&type=news&sort=title&page=2",
      "GET /api/articles/recent",
      "GET /api/articles/filters",
      "GET /api/types",
      "GET /api/templates/page",
      "GET /api/articles/article/hello",
      "POST /api/articles",
      "PUT /api/articles/article/hello",
      "POST /api/articles/article/hello/files",
      "GET /api/embed?url=https%3A%2F%2Fyoutu.be%2Fx%3Fa%3D1%26b%3D2",
    ]);
    expect(calls[7]![1]).toMatchObject({
      headers: { "Content-Type": "application/json" },
      body: '{"title":"Hi"}',
    });
    expect((calls[9]![1]!.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("should convert bodies and render previews, returning their result", async () => {
    const fetch = vi.fn(
      async (path: string) =>
        new Response(
          JSON.stringify(
            path.endsWith("markdown")
              ? { markdown: "**Hi**" }
              : path.endsWith("preview")
                ? { url: "/preview/x/" }
                : { html: "<p>Hi</p>" },
          ),
        ),
    );
    const api = new EditorApi(fetch as unknown as typeof globalThis.fetch);
    const data = { title: "Hi" } as never;
    expect(await api.toMarkdown("<p>x</p>", LOCATION)).toBe("**Hi**");
    expect(await api.toHtml("x")).toBe("<p>Hi</p>");
    expect(await api.preview(data, LOCATION)).toBe("/preview/x/");
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

  it("should throw the server's error message, or the status", async () => {
    await expect(
      new EditorApi(answer(409, { error: "Exists" })).recent(),
    ).rejects.toThrow("Exists");
    await expect(
      new EditorApi(answer(500, "not json")).recent(),
    ).rejects.toThrow("Request failed with 500");
  });
});
