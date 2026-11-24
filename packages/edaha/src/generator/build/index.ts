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
  cachedFetch,
  EMBED_PAGE_PARTS,
  EmbedResolver,
  type EmbedPlugin,
} from "../../embeds/index.ts";
import { loadArticle } from "../article/index.ts";
import { MetadataValidator, typeMetadataKeys } from "../metadata/index.ts";
import {
  defaultTypeConfig,
  RESERVED_TYPES,
  SOURCE_FOLDERS,
  type ArticleTypeConfig,
  type EdahaConfig,
  type FilesConfig,
} from "../config/index.ts";
import { loadSiteConfig } from "../configFile/index.ts";
import { collectLists, PAGE_SIZE, pageFile, paginate } from "../lists/index.ts";
import { createMarkdown, renderMarkdown } from "../markdown/index.ts";
import { isSlug } from "../slug/index.ts";
import { THEME_DIR } from "../../theme/index.ts";
import { Templates, type TemplateOutput } from "../templates/index.ts";
import type {
  Logger,
  TemplateData,
  TemplateDataArticle,
  TemplateDataArticleType,
  TemplateDataList,
  TemplateDataFiles,
  TemplateDataSite,
} from "../types/index.ts";
import {
  checkTypePaths,
  folderPath,
  baseUrlOf,
  folderUrl,
  slugProblem,
} from "../urls/index.ts";

export { RESERVED_TYPES } from "../config/index.ts";

/** Used for feeds when neither `SITE_URL` nor `siteUrl` in the config file is set */
export const DEFAULT_SITE_URL = "http://localhost";

/** Options for building the site */
export interface BuildOptions {
  /**
   * The folder to look for a config file in, before the nearest package.json's folder (see findConfigFile). Default:
   * the current folder. The site folder is the config file's folder: it holds the articles folder (`articlesDir`), and
   * optionally the templates and static files folders (`templatesDir` and `staticDir`).
   */
  siteDir?: string | undefined;
  /** The config file to use instead of looking for one */
  configFile?: string | undefined;
  /**
   * The theme folder (holds templates/ and static/) that the site's own files override, instead of the config's
   * `theme`. Default: the config's `theme`, else THEME_DIR
   */
  themeDir?: string;
  /** The website's absolute URL, for feeds. Defaults to `siteUrl` in the config file, then DEFAULT_SITE_URL with a warning. */
  siteUrl?: string | undefined;
  /** Where warnings go (defaults to console) */
  logger?: Logger;
  /** Fetches extra data for embeds (defaults to the global fetch) */
  fetch?: typeof fetch;
  /** Embed plugins added after the config file's `plugins` (a key in both uses the config file's). Default: none */
  plugins?: readonly EmbedPlugin[];
}

/** What a build produced */
export interface BuildResult {
  /** The absolute output directory */
  outputDir: string;
  /** The absolute folder the files were copied to, if the config file sets `publishDir` */
  publishDir: string | undefined;
  /** The absolute folder the shared files were copied to, if they are hosted elsewhere (the config's `files.url`) */
  filesOutputDir?: string | undefined;
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
 * articles, templates and static files folders), as it is emptied on every build.
 *
 * @param sources - the source folders, relative to the site folder (default: the default ones)
 * @param setting - the setting, for errors (default: "outputDir"; also used for "files.outputDir")
 *
 * @example
 * resolveOutputDir("/site", "build"); // "/site/build"
 * resolveOutputDir("/site", "site/build", ["site/content", "site/templates", "site/static"]); // "/site/site/build"
 */
export const resolveOutputDir = (
  siteDir: string,
  folder: string,
  sources: readonly string[] = Object.values(SOURCE_FOLDERS),
  setting = "outputDir",
): string => {
  const dir = resolve(siteDir, folder);
  const fromSite = relative(resolve(siteDir), dir);
  if (!fromSite || fromSite.startsWith("..") || isAbsolute(fromSite))
    throw new Error(
      `"${setting}" must be a folder inside the site folder, got "${folder}"`,
    );
  if (sources.some((source) => overlaps(join(siteDir, source), dir)))
    throw new Error(
      `"${setting}" must be apart from ${sources.join(", ")}, got "${folder}"`,
    );
  return dir;
};

/**
 * Resolve `publishDir` from the config file, relative to the site folder: any folder apart from the site folder, e.g.
 * another app's build folder.
 *
 * @example
 * resolvePublishDir("/work/site", "../app/dist"); // "/work/app/dist"
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
  // Sorted by path, comparing characters (not the locale's order)
  return new Map([...files].sort(([a], [b]) => Number(a > b) - Number(a < b)));
};

/**
 * An article type's template data: its settings and URL.
 */
const typeData = (
  sitePath: string,
  config: ArticleTypeConfig,
  baseUrl: string,
): TemplateDataArticleType => ({
  ...config,
  url: folderUrl(folderPath(sitePath, config.path), baseUrl),
});

/**
 * Where the shared files folder's files are on the website (see TemplateDataFiles).
 *
 * @example
 * filesData({ ...DEFAULT_FILES_CONFIG, path: "media" }, "/docs"); // { url: "/docs/media/", path: "/docs/media/" }
 */
export const filesData = (
  files: FilesConfig,
  baseUrl: string,
): TemplateDataFiles => {
  const path = folderUrl(folderPath(files.path), baseUrl);
  return { url: files.url ?? path, path };
};

/**
 * The website's template data: its name, description, absolute URL and home URL, default author, and each article
 * type's settings and URL.
 *
 * @param typeConfigs - the article types' settings (configured ones, plus defaults for any others)
 * @param url - the website's absolute URL (a trailing slash is removed)
 *
 * @example
 * siteData(config, config.types, "https://example.com").types.news.url; // "/news/"
 */
export const siteData = (
  config: EdahaConfig,
  typeConfigs: Record<string, ArticleTypeConfig>,
  url: string,
): TemplateDataSite => {
  const baseUrl = baseUrlOf(url);
  return {
    name: config.name,
    description: config.description,
    url: url.replace(/\/+$/, ""),
    baseUrl,
    path: folderUrl(folderPath(config.path), baseUrl),
    files: filesData(config.files, baseUrl),
    author:
      config.author === false
        ? undefined
        : (config.author ?? { name: config.name }),
    types: Object.fromEntries(
      Object.entries(typeConfigs).map(([type, typeConfig]) => [
        type,
        typeData(config.path, typeConfig, baseUrl),
      ]),
    ),
  };
};

/**
 * The template data for an article's page, with its type's list for an index article.
 *
 * @example
 * articlePageData(site, article); // { site, type: "news", isArticle: true, isList: false, article }
 */
export const articlePageData = (
  site: TemplateDataSite,
  article: TemplateDataArticle,
  list?: TemplateDataList,
): TemplateData => ({
  site,
  type: article.type,
  isArticle: true,
  isList: false,
  article,
  ...(list ? { list } : {}),
});

/**
 * The template data for a list's page or feed.
 *
 * @example
 * listPageData(site, list); // { site, type: "news", isArticle: false, isList: true, list }
 */
export const listPageData = (
  site: TemplateDataSite,
  list: TemplateDataList,
): TemplateData => ({
  site,
  type: list.type,
  isArticle: false,
  isList: true,
  list,
});

/**
 * The embed plugins to build with: the config file's, then the given ones whose keys the config file doesn't use.
 *
 * @example
 * withPlugins([youtube], [youtube2, mermaidjs]); // [youtube, mermaidjs]
 */
export const withPlugins = (
  configPlugins: readonly EmbedPlugin[],
  plugins: readonly EmbedPlugin[] = [],
): EmbedPlugin[] => {
  const keys = new Set(configPlugins.map((plugin) => plugin.key));
  return [
    ...configPlugins,
    ...plugins.filter((plugin) => !keys.has(plugin.key)),
  ];
};

/**
 * Build the site: render every published and unlisted article with its assets, then each type's paginated list and
 * RSS feed, and its tag and author lists, and copy the static files (the theme's, overridden by the site's `static/`)
 * as they are. Files are written to `outputDir` (emptied first). If `publishDir` is set, they are then copied into it
 * (the website's root): the files published by the previous build are removed from it first, and the build stops if a
 * file is already there.
 *
 * @example
 * await buildSite({ siteDir: "my-site", siteUrl: "https://example.com" });
 */
export const buildSite = async (
  options: BuildOptions,
): Promise<BuildResult> => {
  const logger = options.logger ?? console;
  const siteConfig = await loadSiteConfig({
    siteDir: options.siteDir,
    configFile: options.configFile,
    logger,
  });
  const { configFile, siteDir, config } = siteConfig;
  const configName = basename(configFile);
  const themeDir = options.themeDir ?? siteConfig.themeDir ?? THEME_DIR;
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
  // Output folders are emptied on every build, so they must be apart from the source folders
  const sources = [
    config.articlesDir,
    config.templatesDir,
    config.staticDir,
    config.files.dir,
  ];
  const outputDir = checkConfig(() =>
    resolveOutputDir(siteDir, config.outputDir, sources),
  );
  // Shared files hosted elsewhere are built into their own folder, to upload there
  const filesOutputDir =
    config.files.url === undefined
      ? undefined
      : checkConfig(() =>
          resolveOutputDir(
            siteDir,
            config.files.outputDir,
            [...sources, config.outputDir],
            "files.outputDir",
          ),
        );
  const publishDir =
    config.publishDir === undefined
      ? undefined
      : checkConfig(() =>
          resolvePublishDir(siteDir, config.publishDir as string),
        );
  const templates = new Templates(
    [join(siteDir, config.templatesDir), join(themeDir, "templates")],
    logger,
  );

  const siteUrl = options.siteUrl || config.siteUrl;
  if (!siteUrl)
    logger.warn(
      `SITE_URL is not set and ${configName} has no "siteUrl"; feeds will link to ${DEFAULT_SITE_URL}`,
    );

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
  // Shared files published with the website take their path's first folder at its root
  const sharedFilesDir = join(siteDir, config.files.dir);
  const sharedFileList = await listFiles(sharedFilesDir);
  const reservedPaths =
    sharedFileList.length && !filesOutputDir
      ? [...config.reservedPaths, config.files.path.split("/")[0] as string]
      : config.reservedPaths;
  checkConfig(() => checkTypePaths(config.path, typeConfigs, reservedPaths));
  const site = siteData(config, typeConfigs, siteUrl || DEFAULT_SITE_URL);
  // Articles can use the shared files folder's files, at their website path or, when hosted elsewhere, their URL there
  const sharedFiles = {
    dir: sharedFilesDir,
    path: `/${config.files.path}/`,
  };
  const hostedFiles = config.files.url
    ? { path: sharedFiles.path, url: config.files.url }
    : undefined;

  const markdown = createMarkdown();
  const embeds = new EmbedResolver({
    // Pages that show the same embed don't fetch it again
    fetch: cachedFetch(options.fetch ?? fetch),
    logger,
    plugins: withPlugins(config.plugins, options.plugins),
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

  // Validates articles' custom metadata
  const validator = new MetadataValidator(config.metadata);

  // Load articles (types that generate nothing are still checked for errors)
  const articles: {
    article: TemplateDataArticle;
    dir: string;
    folder: string;
  }[] = [];
  for (const type of typeFolders) {
    const typeConfig = site.types[type] as TemplateDataArticleType;
    const built = typeConfig.generate.article;
    // The type's folder in the output folder: its URL without the site's base URL
    const typeFolder = typeConfig.url.slice(site.baseUrl.length + 1);
    for (const slug of await subfolders(join(articlesDir, type))) {
      const source = `${config.articlesDir}/${type}/${slug}`;
      if (!isSlug(slug))
        throw new Error(`${source}: folder names must be lowercase kebab-case`);
      const problem = slugProblem(
        slug,
        type,
        config.path,
        typeConfigs,
        reservedPaths,
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
        site,
        dir,
        slug,
        url: folderUrl(folder, site.baseUrl),
        typeUrl: typeConfig.url,
        source,
        // Embeds are rendered with the pages that show them
        replaceEmbeds: async (md) => embeds.replaceBlocks(md, source),
        setEmbedHeadings: (html, headings) =>
          embeds.setHeadings(html, headings),
        renderMarkdown: (md, baseUrl) =>
          renderMarkdown(markdown, md, baseUrl, site.baseUrl, hostedFiles),
        sharedFiles,
        metadata: {
          validator,
          keys: typeMetadataKeys(config.metadata, typeConfigs[type]?.metadata),
          typeLabel: typeConfig.labelPlural,
          warn: (message) => logger.warn(message),
        },
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
  const lists = collectLists(listed, site, withIndex);
  /** Render a page's template, then the embeds it shows (see EmbedResolver.renderPage) */
  const renderPage = (template: string, data: TemplateData, url: string) =>
    embeds.renderPage(
      templates.render(template, { ...data, embeds: EMBED_PAGE_PARTS }),
      url,
    );
  // Each template outputs a file with its extension (see Templates.outputs); lists link to the XML feed, if there is one
  const feedOutputs = templates.feedOutputs();
  const feedFile = `feed.${
    (
      feedOutputs.find(({ extension }) => extension === "xml") ??
      (feedOutputs[0] as TemplateOutput)
    ).extension
  }`;
  const firstPages = new Map<string, TemplateDataList>();
  for (const list of lists) {
    const pages = paginate(list, PAGE_SIZE, feedFile);
    if (list.kind === "type")
      firstPages.set(list.type, pages[0] as TemplateDataList);
    if (list.pages)
      for (const { file, extension } of templates.outputs(list.type, "list"))
        for (const page of pages)
          await write(
            list.dir + pageFile(page.pagination.page.index, extension),
            await renderPage(
              file,
              listPageData(site, page),
              page.pagination.page.url,
            ),
          );
    if (list.feed)
      for (const { file, extension } of feedOutputs)
        await write(
          `${list.dir}feed.${extension}`,
          await renderPage(
            file,
            // The feed has the newest articles that can be in feeds
            listPageData(site, {
              ...(pages[0] as TemplateDataList),
              articles: list.feedArticles.slice(0, PAGE_SIZE),
            }),
            `${list.dir}feed.${extension}`,
          ),
        );
  }

  // Article pages with their assets; index articles also get their type's list
  for (const { article, dir, folder } of articles) {
    await cp(dir, join(outputDir, folder), {
      recursive: true,
      filter: (path) => path !== join(dir, "article.md"),
    });
    const list =
      article.slug === "index" ? firstPages.get(article.type) : undefined;
    for (const { file, extension } of templates.outputs(
      article.type,
      article.template,
    ))
      await write(
        `${folder}index.${extension}`,
        await renderPage(
          file,
          articlePageData(site, article, list),
          article.url,
        ),
      );
  }

  // Static files (stylesheet, fonts) at the website's root, beside the articles
  const statics = await staticFiles([
    join(themeDir, "static"),
    join(siteDir, config.staticDir),
  ]);
  for (const file of statics.keys())
    if (await exists(join(outputDir, file)))
      throw new Error(
        `${config.staticDir}/${file} has the same path as an article's file; rename one of them`,
      );
  for (const [file, source] of statics) {
    await mkdir(dirname(join(outputDir, file)), { recursive: true });
    await cp(source, join(outputDir, file));
  }

  // Shared files: at their website path, beside the articles and static files, or in their own folder when hosted
  // elsewhere
  if (filesOutputDir)
    await rm(filesOutputDir, { recursive: true, force: true });
  const sharedOutput = filesOutputDir ?? join(outputDir, config.files.path);
  for (const file of sharedFileList) {
    const target = join(sharedOutput, file);
    if (!filesOutputDir && (await exists(target)))
      throw new Error(
        `${config.files.dir}/${file} has the same path as an article's or a static file; rename one of them`,
      );
    await mkdir(dirname(target), { recursive: true });
    await cp(join(sharedFilesDir, file), target);
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
    filesOutputDir,
    articles: articles.map(({ article }) => article),
    files: built,
  };
};
