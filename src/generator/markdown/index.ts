import MarkdownIt from "markdown-it";
import { isRelativeUrl } from "../format/index.ts";
import { headingIds } from "../slug/index.ts";

/** A configured markdown renderer */
export type Markdown = InstanceType<typeof MarkdownIt>;

/** Rendering settings passed to markdown-it for each document */
interface RenderEnv {
  /** Root-relative folder URL that relative links and images are resolved against */
  baseUrl: string;
}

/**
 * Create the markdown renderer. Raw HTML is allowed, as articles are written by trusted authors and embeds are HTML.
 * Relative link and image URLs are resolved against the article's URL, so they work on any page (e.g. lists).
 * Headings get IDs from their text (see `headingIds`), so they can be linked to, e.g. `#this-is-an-example`.
 * Typographer (curly quotes, dashes) is on for the website and off for the editor, so text round-trips unchanged.
 *
 * @example
 * const markdown = createMarkdown();
 * renderMarkdown(markdown, "![A](a.png)", "/news/article/hello/"); // '<p><img src="/news/article/hello/a.png" alt="A"></p>\n'
 */
export const createMarkdown = ({ typographer = true } = {}): Markdown => {
  const markdown = new MarkdownIt({ html: true, typographer });
  markdown.core.ruler.push("resolve_relative_urls", (state) => {
    const { baseUrl } = state.env as unknown as RenderEnv;
    for (const block of state.tokens) {
      for (const token of block.children ?? []) {
        const attribute =
          token.type === "image"
            ? "src"
            : token.type === "link_open"
              ? "href"
              : undefined;
        if (!attribute) continue;
        // markdown-it always sets src on images and href on links
        const url = String(token.attrGet(attribute));
        if (isRelativeUrl(url)) token.attrSet(attribute, baseUrl + url);
      }
    }
  });
  markdown.core.ruler.push("heading_ids", (state) => {
    const headings = state.tokens.flatMap((token, i) =>
      token.type === "heading_open"
        ? [{ token, inline: state.tokens[i + 1] as typeof token }]
        : [],
    );
    // A heading's text, without its formatting or HTML tags (a heading's inline token always has children)
    const texts = headings.map(({ inline }) =>
      (inline.children as NonNullable<typeof inline.children>)
        .filter(
          (child) => child.type === "text" || child.type === "code_inline",
        )
        .map((child) => child.content)
        .join(""),
    );
    const ids = headingIds(texts);
    headings.forEach(({ token }, i) => {
      const id = ids[i] as string;
      if (id) token.attrSet("id", id);
    });
  });
  return markdown;
};

/**
 * Render markdown to HTML, resolving relative URLs against a folder URL.
 */
export const renderMarkdown = (
  markdown: Markdown,
  source: string,
  baseUrl: string,
): string => markdown.render(source, { baseUrl } satisfies RenderEnv);
