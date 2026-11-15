import { describe, expect, it } from "vitest";
import { createMarkdown, renderMarkdown } from "..";

describe("renderMarkdown", () => {
  const markdown = createMarkdown();

  it("should resolve relative links and images against the base URL", () => {
    const html = renderMarkdown(
      markdown,
      "[file](guide.pdf) [site](https://example.com) [root](/about) [top](#top) ![pic](img/a.png)",
      "/news/article/hello/",
    );
    expect(html).toContain('href="/news/article/hello/guide.pdf"');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="/about"');
    expect(html).toContain('href="#top"');
    expect(html).toContain('src="/news/article/hello/img/a.png"');
  });

  it("should give headings IDs from their text, without formatting or HTML", () => {
    const html = renderMarkdown(
      createMarkdown(),
      "## This?! Is an, *example*...\n\n### `Code` <small>note</small>\n\n## This is an example\n\n## !!!",
      "/",
    );
    expect(html).toContain('<h2 id="this-is-an-example">');
    expect(html).toContain('<h3 id="code-note">');
    expect(html).toContain('<h2 id="this-is-an-example-2">');
    expect(html).toContain("<h2>!!!</h2>");
  });

  it("should allow raw HTML blocks", () => {
    expect(
      renderMarkdown(
        markdown,
        '<div class="embed"><iframe></iframe></div>',
        "/",
      ),
    ).toBe('<div class="embed"><iframe></iframe></div>');
  });
});
