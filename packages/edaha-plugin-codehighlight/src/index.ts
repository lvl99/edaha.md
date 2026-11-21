import type { EmbedPlugin } from "@lvl99dotcom/edaha.md/embeds";
import { escapeHtml } from "@lvl99dotcom/edaha.md/generator/format";
import { createMarkdown } from "@lvl99dotcom/edaha.md/generator/markdown";

/** The Shiki version pages load, from jsDelivr */
export const SHIKI_VERSION = "4.6.0";

/** Shiki's browser module, with its languages and themes loaded as they are needed */
export const SHIKI_URL = `https://cdn.jsdelivr.net/npm/shiki@${SHIKI_VERSION}/+esm`;

/** Shiki's themes for light and dark pages */
export const SHIKI_THEMES = { light: "github-light", dark: "github-dark" };

/** Languages' display names, by the names code blocks are marked with; others are shown as they are written */
export const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  bash: "Bash",
  c: "C",
  cpp: "C++",
  cs: "C#",
  csharp: "C#",
  css: "CSS",
  diff: "Diff",
  go: "Go",
  html: "HTML",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  kotlin: "Kotlin",
  md: "Markdown",
  markdown: "Markdown",
  njk: "Nunjucks",
  nunjucks: "Nunjucks",
  php: "PHP",
  py: "Python",
  python: "Python",
  rb: "Ruby",
  ruby: "Ruby",
  rs: "Rust",
  rust: "Rust",
  sass: "Sass",
  scss: "SCSS",
  sh: "Shell",
  shell: "Shell",
  sql: "SQL",
  swift: "Swift",
  text: "Text",
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
  zsh: "Zsh",
};

/** A code block in an embed block */
export interface CodeBlock {
  /** Its language, as it is marked, e.g. "ts" (empty without one) */
  language: string;
  /** Its tab label: the heading before it, else its language's display name, else "Code" */
  label: string;
  /** Whether its label is from a heading */
  headed: boolean;
  /** Its code, without the last line break */
  code: string;
}

/** Parses embed blocks' Markdown */
const markdown = createMarkdown();

/**
 * The fenced code blocks in Markdown, each labelled by the heading before it (if it has one and no code block took
 * it), else its language's display name (see LANGUAGE_NAMES), else "Code". Other Markdown is left out.
 *
 * @example
 * codeBlocks("## Node\n\n```js\n1;\n```\n\n```ts\n2;\n```");
 * // [{ language: "js", label: "Node", headed: true, code: "1;" }, { language: "ts", label: "TypeScript", headed: false, code: "2;" }]
 */
export const codeBlocks = (content: string): CodeBlock[] => {
  const tokens = markdown.parse(content, { baseUrl: "", siteBaseUrl: "" });
  const blocks: CodeBlock[] = [];
  let heading: string | undefined;
  tokens.forEach((token, i) => {
    if (token.type === "heading_open")
      heading = (tokens[i + 1] as typeof token).content.trim() || undefined;
    if (token.type !== "fence") return;
    const language = token.info.trim().split(/\s+/)[0] as string;
    blocks.push({
      language,
      label:
        heading ??
        LANGUAGE_NAMES[language.toLowerCase()] ??
        (language || "Code"),
      headed: heading !== undefined,
      code: token.content.replace(/\r?\n$/, ""),
    });
    heading = undefined;
  });
  return blocks;
};

/**
 * A code block's HTML: its label (when it is in tabs or has a heading), and its lines (for line numbers), in a
 * `<pre>` that can be scrolled with the keyboard.
 *
 * @param id - its ID on the page
 * @param labelled - whether to show its label
 * @example
 * codeBlockHtml({ language: "js", label: "JavaScript", headed: false, code: "1;" }, "codehighlight-1-1", false);
 * // '<div class="codehighlight-block" id="codehighlight-1-1" data-language="js"><pre tabindex="0"><code class="language-js"><span class="line">1;</span></code></pre></div>'
 */
export const codeBlockHtml = (
  { language, label, code }: CodeBlock,
  id: string,
  labelled: boolean,
): string => {
  const lines = code
    .split(/\r?\n/)
    .map((line) => `<span class="line">${escapeHtml(line)}</span>`)
    .join("\n");
  return [
    `<div class="codehighlight-block" id="${id}"${language ? ` data-language="${escapeHtml(language)}"` : ""}>`,
    labelled
      ? `<p class="codehighlight-label" id="${id}-label">${escapeHtml(label)}</p>`
      : "",
    `<pre tabindex="0"${labelled ? ` aria-labelledby="${id}-label"` : ""}>`,
    `<code${language ? ` class="language-${escapeHtml(language)}"` : ""}>${lines}</code></pre></div>`,
  ].join("");
};

/** What the page script uses from Shiki */
export interface Shiki {
  codeToHtml(
    code: string,
    options: {
      lang: string;
      themes: typeof SHIKI_THEMES;
      defaultColor: false;
    },
  ): Promise<string>;
}

/**
 * Enhance a page's code blocks in the browser (run once per page by the page script, as its own source, so it uses
 * nothing outside itself): blocks in a group with several become tabs (the WCAG tabs pattern: arrow keys, Home and
 * End move between them), blocks get copy buttons (when the option is on), and their code is highlighted with Shiki
 * (when the option is on), which is only loaded when a block needs it. Code Shiki can't highlight (e.g. an unknown
 * language, or when it can't be loaded) is left as it is.
 *
 * @param doc - the page
 * @param loadShiki - imports Shiki
 * @param themes - Shiki's themes for light and dark pages
 * @example
 * await enhanceCodeBlocks(document, () => import(SHIKI_URL), SHIKI_THEMES);
 */
export const enhanceCodeBlocks = async (
  doc: Document,
  loadShiki: () => Promise<Shiki>,
  themes: typeof SHIKI_THEMES,
): Promise<void> => {
  for (const group of doc.querySelectorAll<HTMLElement>(
    ".codehighlight[data-tabs]",
  )) {
    const blocks = [
      ...group.querySelectorAll<HTMLElement>(":scope > .codehighlight-block"),
    ];
    const tabList = doc.createElement("div");
    tabList.className = "codehighlight-tabs";
    tabList.setAttribute("role", "tablist");
    tabList.setAttribute("aria-label", "Code examples");
    const tabs = blocks.map((block) => {
      // Blocks in tabs always have labels
      const label = block.querySelector(".codehighlight-label") as HTMLElement;
      const tab = doc.createElement("button");
      tab.type = "button";
      tab.id = `${block.id}-tab`;
      tab.className = "codehighlight-tab";
      tab.textContent = label.textContent;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", block.id);
      block.setAttribute("role", "tabpanel");
      block.setAttribute("aria-labelledby", tab.id);
      label.hidden = true;
      tabList.append(tab);
      return tab;
    });
    const select = (index: number, focus: boolean) =>
      tabs.forEach((tab, i) => {
        const selected = i === index;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        (blocks[i] as HTMLElement).hidden = !selected;
        if (selected && focus) tab.focus();
      });
    tabList.addEventListener("click", (event) => {
      const index = tabs.indexOf(
        (event.target as HTMLElement).closest("button") as HTMLButtonElement,
      );
      if (index >= 0) select(index, false);
    });
    tabList.addEventListener("keydown", (event) => {
      const index = tabs.indexOf(doc.activeElement as HTMLButtonElement);
      const keys: Record<string, number> = {
        ArrowRight: index + 1,
        ArrowLeft: index - 1,
        Home: 0,
        End: tabs.length - 1,
      };
      const next = keys[event.key];
      if (next === undefined) return;
      event.preventDefault();
      select((next + tabs.length) % tabs.length, true);
    });
    group.prepend(tabList);
    select(0, false);
  }

  for (const block of doc.querySelectorAll<HTMLElement>(
    ".codehighlight[data-copy-button] .codehighlight-block",
  )) {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "codehighlight-copy";
    button.textContent = "Copy";
    const status = doc.createElement("span");
    status.className = "codehighlight-status";
    status.setAttribute("role", "status");
    const view = doc.defaultView as Window;
    let reset: number | undefined;
    button.addEventListener("click", async () => {
      try {
        await view.navigator.clipboard.writeText(
          String((block.querySelector("code") as HTMLElement).textContent),
        );
        button.textContent = status.textContent = "Copied";
      } catch {
        button.textContent = status.textContent = "Couldn't copy";
      }
      // Ready to copy again after a moment
      view.clearTimeout(reset);
      reset = view.setTimeout(() => {
        button.textContent = "Copy";
        status.textContent = "";
      }, 2000);
    });
    (block.querySelector("pre") as HTMLPreElement).before(button, status);
  }

  const highlighted = [
    ...doc.querySelectorAll<HTMLElement>(
      ".codehighlight[data-syntax-highlight] .codehighlight-block[data-language]",
    ),
  ];
  if (!highlighted.length) return;
  let shiki: Shiki;
  try {
    shiki = await loadShiki();
  } catch {
    return;
  }
  for (const block of highlighted) {
    const pre = block.querySelector("pre") as HTMLPreElement;
    try {
      const template = doc.createElement("template");
      template.innerHTML = await shiki.codeToHtml(String(pre.textContent), {
        lang: block.dataset.language as string,
        themes,
        defaultColor: false,
      });
      const code = template.content.querySelector("code") as HTMLElement;
      pre.classList.add("shiki");
      pre.replaceChildren(code);
    } catch {
      // Left as it is
    }
  }
};

/** Enhances the page's code blocks once it has loaded (see enhanceCodeBlocks) */
const START_SCRIPT = `<script type="module">
  await (${enhanceCodeBlocks.toString()})(document, () => import("${SHIKI_URL}"), ${JSON.stringify(SHIKI_THEMES)});
</script>`;

/**
 * Line numbers (not copied with the code), tabs and copy buttons (above the code, so they don't cover it) big enough to
 * tap, and Shiki's colours for the page's theme: its `data-theme` ("light" or "dark", as the default theme's switcher
 * sets it), or else the visitor's setting.
 */
const STYLE = `<style>
  .embed-codehighlight .codehighlight-block {
    display: flex; flex-wrap: wrap; align-items: end; gap: 0.25rem; margin: 0 0 1rem;
  }
  .embed-codehighlight .codehighlight-block[hidden] { display: none; }
  .embed-codehighlight .codehighlight-label { flex: 1; margin: 0; font-weight: bold; }
  .embed-codehighlight pre { flex: 1 0 100%; min-width: 0; margin: 0; }
  .embed-codehighlight pre code { display: block; padding: 0; background: none; color: inherit; font-size: inherit; }
  .embed-codehighlight .codehighlight-line-numbers code { counter-reset: line; }
  .embed-codehighlight .codehighlight-line-numbers .line::before {
    counter-increment: line; content: counter(line); display: inline-block; width: 2.5em; margin-right: 1em;
    text-align: right; color: var(--colour-muted, #5a5a60); user-select: none;
  }
  .embed-codehighlight .codehighlight-tabs { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-bottom: 0.5rem; }
  .embed-codehighlight button {
    min-height: 2.75rem; min-width: 2.75rem; padding: 0.5rem 0.75rem; border: 1px solid var(--colour-border, #d8d8de);
    background: var(--colour-background, #fff); color: inherit; font: inherit; cursor: pointer;
  }
  .embed-codehighlight button:focus-visible { outline: 2px solid var(--colour-focus, #db5a10); outline-offset: 2px; }
  .embed-codehighlight .codehighlight-tab[aria-selected="true"] { border-color: currentColor; font-weight: bold; }
  .embed-codehighlight .codehighlight-copy { margin-left: auto; }
  .embed-codehighlight .codehighlight-status {
    position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap;
  }
  .embed-codehighlight .shiki span { color: var(--shiki-light); }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) .embed-codehighlight .shiki span { color: var(--shiki-dark); }
  }
  :root[data-theme="dark"] .embed-codehighlight .shiki span { color: var(--shiki-dark); }
</style>`;

/** Angle brackets, as the editor's icon */
const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" aria-hidden="true"><path d="M320-240 80-480l240-240 57 57-184 184 183 183-56 56Zm320 0-57-57 184-184-183-183 56-56 240 240-240 240Z"/></svg>';

/**
 * Shows code blocks with line numbers, syntax highlighting (Shiki, https://shiki.style, loaded in the visitor's
 * browser) and a copy button. Several code blocks become tabs, labelled by the heading before each one, else its
 * language, else "Code":
 *
 * ````
 * <!-- embed:codehighlight -->
 * ## ts-node
 * ```ts
 * const answer = 42;
 * ```
 * <!-- /embed:codehighlight -->
 * ````
 *
 * Options: `lineNumbers`, `syntaxHighlight` and `copyButton` (all on by default). Without JavaScript, the code blocks
 * are shown one under another with their labels, without highlighting or copy buttons.
 *
 * @example
 * await codehighlight.build.render("```js\n1;\n```", context);
 * // '<div class="codehighlight codehighlight-line-numbers" data-syntax-highlight data-copy-button><div class="codehighlight-block" ...'
 */
export const codehighlight = {
  key: "codehighlight",
  name: "Code",
  description:
    "Code blocks with line numbers, syntax highlighting and a copy button; several become tabs. Pages with code load Shiki from jsDelivr.",
  info: "Fenced code blocks (```ts ... ```), each with an optional heading before it as its tab label",
  sources: { script: ["https://cdn.jsdelivr.net"] },
  options: {
    lineNumbers: {
      title: "Show line numbers",
      type: "boolean",
      $edahaField: { checkbox: true, defaultValue: true },
    },
    syntaxHighlight: {
      title: "Highlight syntax",
      type: "boolean",
      $edahaField: { checkbox: true, defaultValue: true },
    },
    copyButton: {
      title: "Show copy button",
      type: "boolean",
      $edahaField: { checkbox: true, defaultValue: true },
    },
  },
  validate: (content) => {
    if (!codeBlocks(content).length)
      throw new Error("There are no fenced code blocks, e.g. ```ts ... ```");
    return true;
  },
  build: {
    render: async (content, { state, options }) => {
      const group = ((state.count as number | undefined) ?? 0) + 1;
      state.count = group;
      const blocks = codeBlocks(content);
      const tabbed = blocks.length > 1;
      const attributes = [
        options.lineNumbers === false ? "" : " codehighlight-line-numbers",
        tabbed ? " data-tabs" : "",
        options.syntaxHighlight === false ? "" : " data-syntax-highlight",
        options.copyButton === false ? "" : " data-copy-button",
      ];
      return `<div class="codehighlight${attributes[0]}"${attributes.slice(1).join("")}>${blocks
        .map((block, i) =>
          codeBlockHtml(
            block,
            `codehighlight-${group}-${i + 1}`,
            tabbed || block.headed,
          ),
        )
        .join("")}</div>`;
    },
    renderHead: async () => STYLE,
    renderFoot: async () => START_SCRIPT,
  },
  editor: { icon: ICON },
} satisfies EmbedPlugin;

export default codehighlight;
