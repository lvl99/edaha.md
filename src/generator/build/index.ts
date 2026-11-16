import {
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import {
  EMBED_RENDERERS,
  EmbedResolver,
  type EmbedRenderer,
} from "../../embeds/index.ts";
import { loadArticle } from "../article/index.ts";
import {
  defaultTypeConfig,
  RESERVED_TYPES,
  type ArticleTypeConfig,
  type BlogConfig,
} from "../config/index.ts";
import { loadSiteConfig } from "../configFile/index.ts";
import { collectLists, PAGE_SIZE, pageFile, paginate } from "../lists/index.ts";
import { createMarkdown, renderMarkdown } from "../markdown/index.ts";
import { isSlug } from "../slug/index.ts";
import { THEME_DIR } from "../../theme/index.ts";
import { Templates } from "../templates/index.ts";
import type {
  Logger,
  TemplateDataArticle,
  TemplateDataArticleType,
  TemplateDataBlog,
  TemplateDataList,
  TemplateDataSite,
} from "../types/index.ts";
import {
  checkTypePaths,
  folderPath,
  folderUrl,
  slugProblem,
} from "../urls/index.ts";

export { RESERVED_TYPES } from "../config/index.ts";

/** Used for feeds when neither `SITE_URL` nor `siteUrl` in the config file is set */
export const DEFAULT_SITE_URL = "http://localhost";

/** Options for building the blog */
export interface BuildOptions {
  /**
   * The folder to look for a config file in, before the nearest package.json's folder (see findConfigFile). Default:
   * the current folder. The site folder is the config file's folder: it holds the articles folder (`articlesDir`), and
   * optionally templates/ and static/.
   */
  siteDir?: string | undefined;
  /** The config file to use instead of looking for one */
  configFile?: string | undefined;
  /** The default theme folder (holds templates/ and static/) that the site's own files override. Default: THEME_DIR */
  themeDir?: string;
  /** The website's absolute URL, for feeds. Defaults to `siteUrl` in the config file, then DEFAULT_SITE_URL with a warning. */
  siteUrl?: string | undefined;
  /** Where warnings go (defaults to console) */
  logger?: Logger;
  /** Fetches extra data for embeds (defaults to the global fetch) */
  fetch?: typeof fetch;
  /** Embed renderers tried after the config file's `embeds` (defaults to the built-in ones, EMBED_RENDERERS) */
  embedRenderers?: readonly EmbedRenderer[];
}

/** What a build produced */
export interface BuildResult {
  /** The absolute output directory */
  outputDir: string;
  /** The absolute folder the files were copied to, if the config file sets `publishDir` */
  publishDir: string | undefined;
  /** Rendered articles (published and unlisted) */
  articles: TemplateDataArticle[];
  /** Files written, relative to the output directory (and the publish directory) */
  files: string[];
}

/** List the names of sub-folders in a folder (none if it doesn't exist) */
const subfolders = async (dir: string): Promise<string[]> => {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
};

/** List every file in a folder and its sub-folders, relative to it (none if it doesn't exist) */
const listFiles = async (dir: string): Promise<string[]> => {
  try {
    const entries = await readdir(dir, {
      recursive: true,
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) =>
        relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"),
      )
      .sort();
  } catch {
    return [];
  }
};

/** Whether a path exists */
const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

/** Whether one folder is the other or inside it */
const overlaps = (a: string, b: string) => {
  const fromA = relative(a, b);
  const fromB = relative(b, a);
  return !fromA || !fromB || !fromA.startsWith("..") || !fromB.startsWith("..");
};

/**
 * Resolve `outputDir` from the config file: a folder inside the site folder, apart from its source folders (the
 * articles folder, templates/ and static/), as it is emptied on every build.
 *
 * @param articlesDir - the articles folder, relative to the site folder
 *
 * @example
 * resolveOutputDir("/site", "dist"); // "/site/dist"
 */
export const resolveOutputDir = (
  siteDir: string,
  folder: string,
  articlesDir: string = "articles",
): string => {
  const sources = [articlesDir, "templates", "static"];
  const dir = resolve(siteDir, folder);
  const fromSite = relative(resolve(siteDir), dir);
  if (!fromSite || fromSite.startsWith("..") || isAbsolute(fromSite))
    throw new Error(
      `"outputDir" must be a folder inside the site folder, got "${folder}"`,
    );
  if (sources.some((source) => overlaps(join(siteDir, source), dir)))
    throw new Error(
      `"outputDir" must be apart from ${sources.join(", ")}, got "${folder}"`,
    );
  return dir;
};

/**
 * Resolve `publishDir` from the config file, relative to the site folder: any folder apart from the site folder, e.g.
 * another app's build folder.
 *
 * @example
 * resolvePublishDir("/work/blog", "../app/dist"); // "/work/app/dist"
 */
export const resolvePublishDir = (siteDir: string, folder: string): string => {
  const dir = resolve(siteDir, folder);
  if (overlaps(resolve(siteDir), dir))
    throw new Error(
      `"publishDir" must be a folder apart from the site folder, got "${folder}"`,
    );
  return dir;
};

/**
 * Map each static file's path to its source: the theme's files, overridden by the site's files with the same path.
 *
 * @param dirs - static folders, the overriding one last
 *
 * @example
 * await staticFiles(["/theme/static", "/site/static"]); // Map { "site.css" => "/site/static/site.css", ... }
 */
export const staticFiles = async (
  dirs: string[],
): Promise<Map<string, string>> => {
  const files = new Map<string, string>();
  for (const dir of dirs)
    for (const file of await listFiles(dir)) files.set(file, join(dir, file));
  return new Map([...files].sort(([a], [b]) => (a < b ? -1 : 1)));
};

/**
 * An article type's template data: its settings and URL.
 */
const typeData = (
  blogPath: string,
  config: ArticleTypeConfig,
): TemplateDataArticleType => ({
  ...config,
  url: folderUrl(folderPath(blogPath, config.path)),
});

/**
 * The blog's template data: its name, description and URL, and each article type's settings and URL.
 *
 * @param typeConfigs - the article types' settings (configured ones, plus defaults for any others)
 *
 * @example
 * blogData(config, config.types).types.news.url; // "/news/"
 */
export const blogData = (
  config: BlogConfig,
  typeConfigs: Record<string, ArticleTypeConfig>,
): TemplateDataBlog => ({
  name: config.name,
  description: config.description,
  path: config.path,
  url: folderUrl(folderPath(config.path)),
  types: Object.fromEntries(
    Object.entries(typeConfigs).map(([type, typeConfig]) => [
      type,
      typeData(config.path, typeConfig),
    ]),
  ),
});

/**
 * Build the blog: render every published and unlisted article with its assets, then each type's paginated list and
 * RSS feed, and its tag and author lists, and copy the static files (the theme's, overridden by the site's `static/`)
 * as they are. Files are written to `outputDir` (emptied first). If `publishDir` is set, they are then copied into it
 * (the website's root): the files published by the previous build are removed from it first, and the build stops if a
 * file is already there.
 *
 * @example
 * await buildBlog({ siteDir: "my-site", siteUrl: "https://example.com" });
 */
export const buildBlog = async (
  options: BuildOptions,
): Promise<BuildResult> => {
  const logger = options.logger ?? console;
  const { configFile, siteDir, config } = await loadSiteConfig({
    siteDir: options.siteDir,
    configFile: options.configFile,
    logger,
  });
  const configName = basename(configFile);
  const themeDir = options.themeDir ?? THEME_DIR;
  /** Run a check of the config's settings, naming the config file in its error */
  const checkConfig = <T>(check: () => T): T => {
    try {
      return check();
    } catch (error) {
      throw new Error(`${configName}: ${(error as Error).message}`, {
        cause: error,
      });
    }
  };
  const outputDir = checkConfig(() =>
    resolveOutputDir(siteDir, config.outputDir, config.articlesDir),
  );
  const publishDir =
    config.publishDir === undefined
      ? undefined
      : checkConfig(() =>
          resolvePublishDir(siteDir, config.publishDir as string),
        );
  const templates = new Templates(
    [join(siteDir, "templates"), join(themeDir, "templates")],
    logger,
  );

  const siteUrl = options.siteUrl || config.siteUrl;
  if (!siteUrl)
    logger.warn(
      `SITE_URL is not set and ${configName} has no "siteUrl"; feeds will link to ${DEFAULT_SITE_URL}`,
    );
  const site: TemplateDataSite = {
    url: (siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, ""),
  };

  // Article types: configured ones, plus any other type folders (with defaults)
  const articlesDir = join(siteDir, config.articlesDir);
  const typeFolders = await subfolders(articlesDir);
  const typeConfigs = { ...config.types };
  for (const type of typeFolders) {
    if (!isSlug(type) || RESERVED_TYPES.includes(type))
      throw new Error(
        `${config.articlesDir}/${type}: article types must be lowercase kebab-case and not ${RESERVED_TYPES.join(" or ")}`,
      );
    if (!typeConfigs[type]) {
      logger.warn(
        `${config.articlesDir}/${type}: type "${type}" is not in ${configName}; using the default settings`,
      );
      typeConfigs[type] = defaultTypeConfig(type);
    }
  }
  checkConfig(() =>
    checkTypePaths(config.path, typeConfigs, config.reservedPaths),
  );
  const blog = blogData(config, typeConfigs);

  const markdown = createMarkdown();
  const embeds = new EmbedResolver({
    fetch: options.fetch ?? fetch,
    logger,
    renderers: [
      ...config.embeds,
      ...(options.embedRenderers ?? EMBED_RENDERERS),
    ],
  });

  // Remove what the previous build published, then empty the build folder
  if (publishDir)
    for (const file of await listFiles(outputDir))
      await rm(join(publishDir, file), { force: true });
  await rm(outputDir, { recursive: true, force: true });
  const files: string[] = [];
  const write = async (file: string, contents: string) => {
    const path = join(outputDir, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
    files.push(file);
  };

  // Load articles (types that generate nothing are still checked for errors)
  const articles: {
    article: TemplateDataArticle;
    dir: string;
    folder: string;
  }[] = [];
  for (const type of typeFolders) {
    const typeConfig = blog.types[type] as TemplateDataArticleType;
    const built = typeConfig.generate.article;
    const typeFolder = typeConfig.url.slice(1);
    for (const slug of await subfolders(join(articlesDir, type))) {
      const source = `${config.articlesDir}/${type}/${slug}`;
      if (!isSlug(slug))
        throw new Error(`${source}: folder names must be lowercase kebab-case`);
      const problem = slugProblem(
        slug,
        type,
        config.path,
        typeConfigs,
        config.reservedPaths,
      );
      if (problem) throw new Error(`${source}: ${problem}`);
      const dir = join(articlesDir, type, slug);
      let text: string;
      try {
        text = await readFile(join(dir, "article.md"), "utf8");
      } catch {
        logger.warn(`${source}: no article.md; skipped`);
        continue;
      }
      // An index article is its type's front page
      const folder = slug === "index" ? typeFolder : `${typeFolder}${slug}/`;
      const article = await loadArticle(text, type, {
        blog,
        dir,
        slug,
        url: folderUrl(folder),
        typeUrl: typeConfig.url,
        source,
        // Embeds aren't fetched for articles that won't be built
        replaceEmbeds: built
          ? (md) => embeds.replaceBlocks(md, source)
          : async (md) => md,
        renderMarkdown: (md, baseUrl) => renderMarkdown(markdown, md, baseUrl),
      });
      if (article && built) articles.push({ article, dir, folder });
    }
  }

  // Lists (published articles only, without index articles)
  const withIndex = new Set(
    articles
      .filter(({ article }) => article.slug === "index")
      .map(({ article }) => article.type),
  );
  const listed = articles
    .map(({ article }) => article)
    .filter(
      (article) => article.status === "published" && article.slug !== "index",
    );
  const lists = collectLists(listed, blog, withIndex);
  const firstPages = new Map<string, TemplateDataList>();
  for (const list of lists) {
    const pages = paginate(list);
    if (list.kind === "type")
      firstPages.set(list.type, pages[0] as TemplateDataList);
    if (list.pages) {
      const listTemplate = templates.resolve(list.type, "list");
      for (const page of pages)
        await write(
          list.dir + pageFile(page.pagination.page.index),
          templates.render(listTemplate, { site, blog, list: page }),
        );
    }
    if (list.feed)
      await write(
        `${list.dir}feed.xml`,
        templates.render("layouts/rssfeed.njk", {
          site,
          blog,
          // The feed has the newest articles that can be in feeds
          list: {
            ...(pages[0] as TemplateDataList),
            articles: list.feedArticles.slice(0, PAGE_SIZE),
          },
        }),
      );
  }

  // Article pages with their assets; index articles also get their type's list
  for (const { article, dir, folder } of articles) {
    await cp(dir, join(outputDir, folder), {
      recursive: true,
      filter: (path) => path !== join(dir, "article.md"),
    });
    await write(
      `${folder}index.html`,
      templates.render(templates.resolve(article.type, article.template), {
        site,
        blog,
        article,
        ...(article.slug === "index"
          ? { list: firstPages.get(article.type) }
          : {}),
      }),
    );
  }

  // Static files (stylesheet, fonts) at the website's root, beside the articles
  const statics = await staticFiles([
    join(themeDir, "static"),
    join(siteDir, "static"),
  ]);
  for (const file of statics.keys())
    if (await exists(join(outputDir, file)))
      throw new Error(
        `static/${file} has the same path as an article's file; rename one of them`,
      );
  for (const [file, source] of statics) {
    await mkdir(dirname(join(outputDir, file)), { recursive: true });
    await cp(source, join(outputDir, file));
  }

  // Publish into the website's root, without replacing anything already there
  const built = await listFiles(outputDir);
  if (publishDir) {
    for (const file of built)
      if (await exists(join(publishDir, file)))
        throw new Error(
          `${file} is already in "publishDir" (${config.publishDir}); remove it there or rename the article`,
        );
    if (built.length) await cp(outputDir, publishDir, { recursive: true });
  }

  return {
    outputDir,
    publishDir,
    articles: articles.map(({ article }) => article),
    files: built,
  };
};
