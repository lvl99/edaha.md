import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import nunjucks from "nunjucks";
import { loadSiteConfig } from "../configFile/index.ts";
import {
  addTemplateTools,
  findTemplates,
  isRelativeName,
  outputExtension,
  relativeTemplateName,
  REQUIRED_TEMPLATES,
  resolveTemplateName,
  TEMPLATE_EXTENSIONS,
  TEMPLATE_OPTIONS,
  templateFileName,
  THEME_PREFIX,
} from "../templates/index.ts";
import { THEME_DIR } from "../../theme/index.ts";
import type { Logger } from "../types/index.ts";

/** A problem in a template */
export interface TemplateProblem {
  /** The template file's absolute path */
  file: string;
  /** Where the problem is in the file, from 1; undefined for problems with the whole file */
  line?: number | undefined;
  /** Where the problem is on its line, from 1 */
  column?: number | undefined;
  /** What the problem is */
  message: string;
}

/** A Nunjucks template node (not in @types/nunjucks) */
interface TemplateNode {
  typename: string;
  /** From 0 */
  lineno: number;
  /** From 0 */
  colno: number;
  value?: unknown;
  /** The filter's name, for Filter nodes */
  name?: TemplateNode;
  /** The template's name, for Extends, Include, Import and FromImport nodes */
  template?: TemplateNode;
  /** Whether a missing template is left out, for Include nodes */
  ignoreMissing?: boolean;
  iterFields(callback: (value: unknown) => void): void;
}

/** Nunjucks' parser and node classes (not in @types/nunjucks) */
const { parser, nodes } = nunjucks as unknown as {
  parser: {
    parse(
      src: string,
      extensions: nunjucks.Extension[],
      options: object,
    ): TemplateNode;
  };
  nodes: { Node: abstract new () => TemplateNode };
};

/** Template tags that load another template by its name */
const TEMPLATE_REFERENCES = new Set([
  "Extends",
  "Include",
  "Import",
  "FromImport",
]);

/**
 * Every node in a template's tree, the root first.
 *
 * @example
 * [...templateNodes(parser.parse("{{ a | upper }}", [], {}))].map((node) => node.typename);
 * // ["Root", "Output", "Filter", "Symbol", "NodeList", "Symbol"]
 */
function* templateNodes(node: TemplateNode): Generator<TemplateNode> {
  yield node;
  const children: unknown[] = [];
  node.iterFields((value) =>
    children.push(...(Array.isArray(value) ? value : [value])),
  );
  for (const child of children)
    if (child instanceof nodes.Node) yield* templateNodes(child);
}

/**
 * Whether a template name loads a template from the template folders, as the build would (see templateLoader).
 * Names starting with `./` or `../` are relative to the template that names them. Throws if two templates in a folder
 * output the same file type.
 *
 * @param from - the template that names it, relative to its folder
 * @example
 * templateExists(["site/templates", "theme/templates"], "@theme/layouts/rssfeed.njk", "layouts/html.njk"); // true
 */
export const templateExists = (
  dirs: readonly string[],
  name: string,
  from: string,
): boolean => {
  const theme = name.startsWith(THEME_PREFIX);
  const searchDirs = theme ? dirs.slice(-1) : dirs;
  const relative = theme
    ? name.slice(THEME_PREFIX.length)
    : isRelativeName(name)
      ? relativeTemplateName(dirs, from, name)
      : name;
  const file = resolveTemplateName(searchDirs, relative);
  return searchDirs.some((dir) => existsSync(join(dir, file)));
};

/**
 * The problems in one template's source: syntax errors and unknown tags, unknown filters, and templates it extends,
 * includes or imports by a name that loads nothing.
 *
 * @param dirs - the template folders, to find the templates it names
 * @param file - the template's path in its folder, e.g. "article/single.njk"
 * @param path - the template file's absolute path, for its problems
 * @example
 * checkTemplate(dirs, "{{ a | nope }}", "test.njk", "/site/templates/test.njk");
 * // [{ file: "/site/templates/test.njk", line: 1, column: 8, message: 'Unknown filter "nope"' }]
 */
export const checkTemplate = (
  dirs: readonly string[],
  source: string,
  file: string,
  path: string,
): TemplateProblem[] => {
  let root: TemplateNode;
  try {
    root = parser.parse(
      source,
      Object.values(TEMPLATE_EXTENSIONS),
      TEMPLATE_OPTIONS,
    );
  } catch (error) {
    const { message, lineno, colno } = error as Error & {
      lineno?: number;
      colno?: number;
    };
    return [
      {
        file: path,
        line: lineno,
        column: colno,
        // Nunjucks names every error "Template render error"
        message: message.replace(/^Template render error:?\s*/, ""),
      },
    ];
  }
  const env = addTemplateTools(new nunjucks.Environment([]));
  const problems: TemplateProblem[] = [];
  const problem = (node: TemplateNode, message: string) =>
    problems.push({
      file: path,
      line: node.lineno + 1,
      column: node.colno + 1,
      message,
    });
  for (const node of templateNodes(root)) {
    if (node.typename === "Filter" || node.typename === "FilterAsync") {
      const name = String(node.name?.value);
      try {
        env.getFilter(name);
      } catch {
        problem(node, `Unknown filter "${name}"`);
      }
    } else if (
      TEMPLATE_REFERENCES.has(node.typename) &&
      node.template?.typename === "Literal" &&
      !node.ignoreMissing
    ) {
      // Only names written as text can be checked, not ones in variables
      const name = String(node.template.value);
      try {
        if (!templateExists(dirs, name, file))
          problem(node, `Template "${name}" not found`);
      } catch (error) {
        problem(node, (error as Error).message);
      }
    }
  }
  return problems;
};

/**
 * The problems in every template (`.njk` file) in the template folders, without building: syntax errors and unknown
 * tags, unknown filters, templates named in `extends`, `include` and `import` that don't exist, missing required
 * templates, and templates in one folder that output the same file type. Templates whose names are in variables, and
 * mistakes only seen when rendering (e.g. a misspelt variable), aren't checked.
 *
 * @param dirs - the template folders, the site's first and the theme's last
 * @example
 * checkTemplates(["site/templates", join(THEME_DIR, "templates")]);
 * // [{ file: "/…/site/templates/article/single.njk", line: 3, column: 15, message: 'Unknown filter "dat"' }]
 */
export const checkTemplates = (dirs: readonly string[]): TemplateProblem[] => {
  /** Whether a required template exists, with any output extension (clashes are reported with their templates) */
  const exists = (required: string) => {
    const path = required.slice(0, -".njk".length);
    try {
      return findTemplates(dirs, path, outputExtension(required)).length > 0;
    } catch {
      return true;
    }
  };
  const problems: TemplateProblem[] = REQUIRED_TEMPLATES.filter(
    (required) => !exists(required),
  ).map((required) => ({
    file: dirs[0] as string,
    message: `Missing required template ${required} (or with an output extension, e.g. ${required.replace(/\.njk$/, ".html.njk")})`,
  }));
  for (const dir of dirs) {
    let files: string[];
    try {
      files = readdirSync(dir, { recursive: true, encoding: "utf8" })
        // Template names use "/" on every system
        .map((file) => file.split(sep).join("/"))
        .filter((file) => templateFileName(posix.basename(file)))
        .sort();
    } catch {
      // A site without its own templates folder
      continue;
    }
    const clashes = new Set<string>();
    for (const file of files) {
      const path = join(dir, file);
      // The template's path without its output extension and `.njk`, e.g. "layouts/rssfeed"
      const name = file.replace(/(\.[a-z0-9]+)?\.njk$/i, "");
      try {
        // Two templates in one folder that output the same file type
        findTemplates([dir], name, outputExtension(`${name}.njk`));
      } catch (error) {
        const { message } = error as Error;
        if (!clashes.has(message)) {
          clashes.add(message);
          problems.push({ file: path, message });
        }
      }
      problems.push(
        ...checkTemplate(dirs, readFileSync(path, "utf8"), file, path),
      );
    }
  }
  return problems;
};

/** Options for checkSite */
export interface CheckOptions {
  /** The folder to look for a config file in (see loadSiteConfig) */
  siteDir?: string | undefined;
  /** The config file, if one was named */
  configFile?: string | undefined;
  /** The theme folder (default: the config's theme, or the default theme) */
  themeDir?: string | undefined;
  /** Where warnings go (default: console) */
  logger?: Logger | undefined;
}

/**
 * The problems in a site's templates and its theme's (see checkTemplates), found from its config file.
 *
 * @example
 * await checkSite({ siteDir: "my-site" }); // [] when every template is fine
 */
export const checkSite = async (
  options: CheckOptions,
): Promise<TemplateProblem[]> => {
  const site = await loadSiteConfig({
    siteDir: options.siteDir,
    configFile: options.configFile,
    logger: options.logger ?? console,
  });
  const themeDir = options.themeDir ?? site.themeDir ?? THEME_DIR;
  return checkTemplates([
    join(site.siteDir, site.config.templatesDir),
    join(themeDir, "templates"),
  ]);
};

/**
 * A problem as one line, `file:line:column message`, with the file relative to a folder, as editors and terminals
 * link them.
 *
 * @example
 * formatProblem({ file: "/site/templates/a.njk", line: 2, column: 5, message: "Unknown filter" }, "/site");
 * // "templates/a.njk:2:5 Unknown filter"
 */
export const formatProblem = (problem: TemplateProblem, cwd: string): string =>
  `${relative(cwd, problem.file) || "."}${
    problem.line === undefined
      ? ""
      : `:${problem.line}${problem.column === undefined ? "" : `:${problem.column}`}`
  } ${problem.message}`;
