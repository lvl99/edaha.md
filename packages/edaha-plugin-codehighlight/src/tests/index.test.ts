// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isEmbedPlugin,
  type EmbedRenderContext,
  type EmbedState,
} from "@lvl99dotcom/edaha.md/embeds";
import codehighlightDefault, {
  codeBlockHtml,
  codeBlocks,
  codehighlight,
  enhanceCodeBlocks,
  COPY_ICONS,
  SHIKI_THEMES,
  SHIKI_URL,
  type Shiki,
} from "..";

/** What a block's render gets, with options and the page's state */
const context = (
  options: Record<string, unknown> = {},
  state: EmbedState = {},
): EmbedRenderContext => ({ fetch, state, options, headings: [] });

/** Three code blocks: one with a heading, one with a known language, one without a language */
const TABS = [
  "## ts-node",
  "",
  "```ts",
  "const a = 1;",
  "```",
  "",
  "```js",
  "const b = 2;",
  "```",
  "",
  "```",
  "<plain>",
  "```",
].join("\n");

/** A Shiki that colours each line, or fails for the "broken" language */
const fakeShiki: Shiki = {
  codeToHtml: vi.fn(async (code: string, { lang }) => {
    if (lang === "broken") throw new Error("Unknown language");
    return `<pre class="shiki" style="--shiki-light-bg:#fff"><code>${code
      .split("\n")
      .map(
        (line) =>
          `<span class="line"><span style="--shiki-light:#f00">${line}</span></span>`,
      )
      .join("\n")}</code></pre>`;
  }),
};

/** Put rendered blocks in the page, then enhance them */
const enhance = async (
  html: string,
  loadShiki: () => Promise<Shiki> = async () => fakeShiki,
) => {
  document.body.innerHTML = html;
  await enhanceCodeBlocks(document, loadShiki, SHIKI_THEMES, COPY_ICONS);
};

/** The page's tabs */
const tabs = () => [
  ...document.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
];

/** A copy button's tooltip, name (for screen readers; its icon is hidden from them) and icon */
const copyButton = (button: HTMLButtonElement) => ({
  title: button.title,
  name: button.querySelector(".codehighlight-hidden")?.textContent,
  icon: button.firstElementChild?.outerHTML,
});

/** An icon as the page shows it, to compare with a copy button's (see copyButton) */
const iconHtml = (markup: string) => {
  const template = document.createElement("template");
  template.innerHTML = markup;
  return template.content.firstElementChild?.outerHTML;
};

/** Which of the page's blocks are hidden */
const hidden = () =>
  [...document.querySelectorAll<HTMLElement>(".codehighlight-block")].map(
    (block) => block.hidden,
  );

/** Press a key on the focused tab */
const press = (key: string) =>
  (document.activeElement as HTMLElement).dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("codehighlight", () => {
  it("should be an embed plugin with the codehighlight key, allowing scripts from jsDelivr", () => {
    expect(codehighlightDefault).toBe(codehighlight);
    expect(isEmbedPlugin(codehighlight)).toBe(true);
    expect(codehighlight.key).toBe("codehighlight");
    expect(codehighlight.sources.script).toEqual(["https://cdn.jsdelivr.net"]);
    expect(codehighlight.editor.icon).toMatch(/^<svg /);
  });

  it("should have line numbers, syntax highlighting and copy button options, on by default", () => {
    expect(
      Object.entries(codehighlight.options).map(([name, schema]) => [
        name,
        schema.type,
        schema.$edahaField.defaultValue,
      ]),
    ).toEqual([
      ["lineNumbers", "boolean", true],
      ["syntaxHighlight", "boolean", true],
      ["copyButton", "boolean", true],
    ]);
  });

  it("should only accept blocks with fenced code blocks", () => {
    expect(codehighlight.validate("```\ncode\n```")).toBe(true);
    expect(() => codehighlight.validate("Just text\n\n    indented")).toThrow(
      "There are no fenced code blocks",
    );
  });
});

describe("codeBlocks", () => {
  it("should label code blocks by their heading, else their language's name, else Code", () => {
    expect(codeBlocks(TABS)).toEqual([
      { language: "ts", label: "ts-node", headed: true, code: "const a = 1;" },
      {
        language: "js",
        label: "JavaScript",
        headed: false,
        code: "const b = 2;",
      },
      { language: "", label: "Code", headed: false, code: "<plain>" },
    ]);
  });

  it("should show languages without a display name as they are written, and leave out other Markdown", () => {
    expect(
      codeBlocks(
        "Some text\n\n## \n\n~~~elixir title\na\nb\n~~~\n\n```TS\n\n```",
      ),
    ).toEqual([
      // An empty heading isn't a label
      { language: "elixir", label: "elixir", headed: false, code: "a\nb" },
      { language: "TS", label: "TypeScript", headed: false, code: "" },
    ]);
  });
});

describe("codeBlockHtml", () => {
  it("should put each line in a span, in a pre that can be scrolled with the keyboard", () => {
    expect(
      codeBlockHtml(
        {
          language: "js",
          label: "JavaScript",
          headed: false,
          code: "a < b\nc",
        },
        "codehighlight-1-1",
        false,
      ),
    ).toBe(
      '<div class="codehighlight-block" id="codehighlight-1-1" data-language="js"><div class="codehighlight-code"><pre tabindex="0"><code class="language-js"><span class="line">a &lt; b</span>\n<span class="line">c</span></code></pre></div></div>',
    );
  });

  it("should show its label, naming the code, and leave out a language it doesn't have", () => {
    expect(
      codeBlockHtml(
        { language: "", label: "A & B", headed: true, code: "x" },
        "c-1",
        true,
      ),
    ).toBe(
      '<div class="codehighlight-block" id="c-1"><p class="codehighlight-label" id="c-1-label">A &amp; B</p><div class="codehighlight-code"><pre tabindex="0" aria-labelledby="c-1-label"><code><span class="line">x</span></code></pre></div></div>',
    );
  });
});

describe("codehighlight.build", () => {
  it("should render one code block on its own, with every option on", async () => {
    expect(
      await codehighlight.build.render("```ts\nconst a = 1;\n```", context()),
    ).toBe(
      '<div class="codehighlight codehighlight-line-numbers" data-syntax-highlight data-copy-button><div class="codehighlight-block" id="codehighlight-1-1" data-language="ts"><div class="codehighlight-code"><pre tabindex="0"><code class="language-ts"><span class="line">const a = 1;</span></code></pre></div></div></div>',
    );
  });

  it("should label code blocks in tabs, numbering the page's groups, with options off", async () => {
    const state: EmbedState = {};
    await codehighlight.build.render("```\na\n```", context({}, state));
    const html = await codehighlight.build.render(
      TABS,
      context(
        { lineNumbers: false, syntaxHighlight: false, copyButton: false },
        state,
      ),
    );
    expect(html).toMatch(/^<div class="codehighlight" data-tabs>/);
    expect(html.match(/id="codehighlight-2-\d"/g)).toEqual([
      'id="codehighlight-2-1"',
      'id="codehighlight-2-2"',
      'id="codehighlight-2-3"',
    ]);
    expect(html.match(/class="codehighlight-label"[^>]*>[^<]*/g)).toEqual([
      'class="codehighlight-label" id="codehighlight-2-1-label">ts-node',
      'class="codehighlight-label" id="codehighlight-2-2-label">JavaScript',
      'class="codehighlight-label" id="codehighlight-2-3-label">Code',
    ]);
  });

  it("should label one code block with a heading", async () => {
    expect(
      await codehighlight.build.render("## Example\n\n```\na\n```", context()),
    ).toContain(
      '<p class="codehighlight-label" id="codehighlight-1-1-label">Example</p>',
    );
  });

  it("should style code blocks and enhance them once per page, loading a pinned Shiki from jsDelivr", async () => {
    expect(SHIKI_URL).toMatch(
      /^https:\/\/cdn\.jsdelivr\.net\/npm\/shiki@\d+\.\d+\.\d+\/\+esm$/,
    );
    const head = await codehighlight.build.renderHead();
    expect(head).toMatch(/^<style>/);
    expect(head).toContain("counter-increment: line;");
    expect(head).toContain(
      '[data-theme="dark"] .embed-codehighlight .shiki span',
    );
    const foot = await codehighlight.build.renderFoot();
    expect(foot).toContain('<script type="module">');
    expect(foot).toContain(enhanceCodeBlocks.toString());
    expect(foot).toContain(`() => import("${SHIKI_URL}")`);
    expect(foot).toContain(
      `${JSON.stringify(SHIKI_THEMES)}, ${JSON.stringify(COPY_ICONS)})`,
    );
  });
});

describe("enhanceCodeBlocks", () => {
  it("should turn a group of code blocks into tabs, showing the first", async () => {
    await enhance(
      await codehighlight.build.render(TABS, context({ copyButton: false })),
    );
    const tabList = document.querySelector('[role="tablist"]') as HTMLElement;
    expect(tabList.getAttribute("aria-label")).toBe("Code examples");
    expect(tabs().map((tab) => tab.textContent)).toEqual([
      "ts-node",
      "JavaScript",
      "Code",
    ]);
    expect(tabs().map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    expect(hidden()).toEqual([false, true, true]);
    const panel = document.getElementById("codehighlight-1-2") as HTMLElement;
    expect(panel.getAttribute("role")).toBe("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe("codehighlight-1-2-tab");
    expect(tabs()[1]?.getAttribute("aria-controls")).toBe("codehighlight-1-2");
    // The tabs say what the labels said
    expect(
      [...document.querySelectorAll<HTMLElement>(".codehighlight-label")].every(
        (label) => label.hidden,
      ),
    ).toBe(true);
  });

  it("should show a tab's code when it is clicked, and move between tabs with the arrow, Home and End keys", async () => {
    await enhance(
      await codehighlight.build.render(TABS, context({ copyButton: false })),
    );
    tabs()[2]?.click();
    expect(hidden()).toEqual([true, true, false]);
    // A click between the tabs changes nothing
    (document.querySelector('[role="tablist"]') as HTMLElement).click();
    expect(hidden()).toEqual([true, true, false]);
    tabs()[2]?.focus();
    press("ArrowRight");
    expect(document.activeElement).toBe(tabs()[0]);
    expect(hidden()).toEqual([false, true, true]);
    press("ArrowLeft");
    expect(document.activeElement).toBe(tabs()[2]);
    press("Home");
    expect(document.activeElement).toBe(tabs()[0]);
    press("End");
    expect(document.activeElement).toBe(tabs()[2]);
    expect(tabs()[2]?.getAttribute("aria-selected")).toBe("true");
    // Other keys are left to the browser
    const other = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    tabs()[2]?.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
  });

  it("should add copy buttons that copy the code and say so, ready again after a moment", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await enhance(
      await codehighlight.build.render(
        "```ts\nconst a = 1;\nconst b = 2;\n```",
        context({ syntaxHighlight: false }),
      ),
    );
    const button = document.querySelector(
      ".codehighlight-copy",
    ) as HTMLButtonElement;
    const status = document.querySelector('[role="status"]') as HTMLElement;
    // An icon button, like the editor's toolbar buttons
    const ready = {
      title: "Copy code",
      name: "Copy code",
      icon: iconHtml(COPY_ICONS.copy),
    };
    expect(copyButton(button)).toEqual(ready);
    expect(button.querySelector("span")?.className).toBe(
      "codehighlight-hidden",
    );
    // In the code's box, which it floats in
    expect(button.parentElement?.className).toBe("codehighlight-code");
    expect(button.nextElementSibling).toBe(status);
    expect(status.nextElementSibling?.tagName).toBe("PRE");
    button.click();
    await vi.waitFor(() => expect(status.textContent).toBe("Copied"));
    expect(writeText).toHaveBeenCalledWith("const a = 1;\nconst b = 2;");
    const copied = {
      title: "Copied",
      name: "Copied",
      icon: iconHtml(COPY_ICONS.copied),
    };
    expect(copyButton(button)).toEqual(copied);
    // Clicked again, it waits from then
    button.click();
    await vi.advanceTimersByTimeAsync(1999);
    expect(copyButton(button)).toEqual(copied);
    await vi.advanceTimersByTimeAsync(1);
    expect(copyButton(button)).toEqual(ready);
    expect(status.textContent).toBe("");
  });

  it("should say when the code couldn't be copied", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: async () => Promise.reject(new Error("Denied")) },
    });
    await enhance(await codehighlight.build.render("```\na\n```", context()));
    const button = document.querySelector(
      ".codehighlight-copy",
    ) as HTMLButtonElement;
    button.click();
    await vi.waitFor(() =>
      expect(copyButton(button)).toEqual({
        title: "Couldn't copy",
        name: "Couldn't copy",
        icon: iconHtml(COPY_ICONS.failed),
      }),
    );
    expect(document.querySelector('[role="status"]')?.textContent).toBe(
      "Couldn't copy",
    );
  });

  it("should highlight code with a language in the page's themes, leaving code Shiki can't highlight as it is", async () => {
    await enhance(
      await codehighlight.build.render(
        "```ts\nconst a = 1;\n```\n\n```broken\nb\n```\n\n```\nc\n```",
        context({ copyButton: false }),
      ),
    );
    expect(fakeShiki.codeToHtml).toHaveBeenCalledWith("const a = 1;", {
      lang: "ts",
      themes: SHIKI_THEMES,
      defaultColor: false,
    });
    const [ts, broken, plain] = document.querySelectorAll("pre");
    // Its own pre is kept, with Shiki's code in it
    expect(ts?.outerHTML).toBe(
      '<pre tabindex="0" aria-labelledby="codehighlight-1-1-label" class="shiki"><code><span class="line"><span style="--shiki-light:#f00">const a = 1;</span></span></code></pre>',
    );
    expect(broken?.className).toBe("");
    expect(plain?.className).toBe("");
  });

  it("should only load Shiki when a block needs it, and leave code as it is when Shiki can't be loaded", async () => {
    const loadShiki = vi.fn(async () => fakeShiki);
    await enhance(
      await codehighlight.build.render(
        "```ts\na\n```",
        context({ syntaxHighlight: false, copyButton: false }),
      ),
      loadShiki,
    );
    expect(loadShiki).not.toHaveBeenCalled();
    await enhance(
      await codehighlight.build.render("```ts\na\n```", context()),
      async () => Promise.reject(new Error("Offline")),
    );
    expect(document.querySelector("pre")?.className).toBe("");
  });
});
