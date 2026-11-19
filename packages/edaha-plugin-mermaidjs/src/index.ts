import type { EmbedPlugin } from "@lvl99dotcom/edaha.md/embeds";
import { escapeHtml } from "@lvl99dotcom/edaha.md/generator/format";

/** The Mermaid version pages load, from jsDelivr */
export const MERMAID_VERSION = "12.3.0";

/** Mermaid's browser module */
export const MERMAID_URL = `https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.esm.min.mjs`;

/** A tree of boxes, as the editor's icon */
const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" aria-hidden="true"><path d="M604-120v-125H450v-410h-93v130H80v-315h277v125h247v-125h276v315H604v-130h-94v350h94v-130h276v315H604ZM140-780v195-195Zm524 405v195-195Zm0-405v195-195Zm0 195h156v-195H664v195Zm0 405h156v-195H664v195ZM140-585h157v-195H140v195Z"/></svg>';

/**
 * Draws the page's diagrams once it has loaded, in Mermaid's dark theme when the page is dark: its `data-theme`
 * ("light" or "dark", as the default theme's switcher sets it), or else the visitor's setting.
 */
const START_SCRIPT = `<script type="module">
  import mermaid from "${MERMAID_URL}";
  const theme = document.documentElement.dataset.theme;
  const dark = theme ? theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "default" });
  await mermaid.run({ querySelector: ".embed-mermaidjs .mermaid" });
</script>`;

/**
 * Draws Mermaid diagrams (https://mermaid.js.org) from their code, in the visitor's browser:
 *
 * ```
 * <!-- embed:mermaidjs -->
 * graph TD;
 *   A-->B;
 * <!-- /embed:mermaidjs -->
 * ```
 *
 * The code is kept in the page (so it reads as text without scripts), and pages with diagrams load Mermaid from
 * jsDelivr once.
 *
 * @example
 * await mermaidjs.build.render("graph TD;\n  A-->B;", context); // '<pre class="mermaid">graph TD;\n  A--&gt;B;</pre>'
 */
export const mermaidjs = {
  key: "mermaidjs",
  name: "MermaidJS diagram",
  description:
    "A diagram drawn from Mermaid code, e.g. a flowchart. Pages with diagrams load Mermaid from jsDelivr.",
  sources: { script: ["https://cdn.jsdelivr.net"] },
  build: {
    render: async (content) => {
      if (!content.trim()) throw new Error("the diagram has no code");
      return `<pre class="mermaid">${escapeHtml(content)}</pre>`;
    },
    renderFoot: async () => START_SCRIPT,
  },
  editor: { icon: ICON },
} satisfies EmbedPlugin;

export default mermaidjs;
