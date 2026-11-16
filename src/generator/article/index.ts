import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import mime from "mime-types";
import { parse } from "yaml";
import {
  maskCode,
  rawHtml,
  replaceRawBlocks,
  formatBytes,
  isRelativeUrl,
  stripHtml,
  cropText,
  escapeHtml,
} from "../format/index.ts";
import { isSlug, slugify } from "../slug/index.ts";
import type {
  ArticleStatus,
  TemplateDataArticle,
  TemplateDataAttachment,
  TemplateDataAuthor,
  TemplateDataBlog,
  TemplateDataTag,
} from "../types/index.ts";

/** Formats an article's config header can be written in */
export const HEADER_FORMATS = ["yaml", "yml", "json"] as const;

/** A format an article's config header can be written in */
export type HeaderFormat = (typeof HEADER_FORMATS)[number];

/** The format articles' config headers are written in by default */
export const DEFAULT_HEADER_FORMAT: HeaderFormat = "yaml";

/** The config header at the start of an article: `<!--yaml ... -->`, `<!--yml ... -->` or `<!--json ... -->` */
const HEADER = /^\s*<!--(yaml|yml|json)[ \t]*\r?\n([\s\S]*?)-->/;

/** The `<!-- readmore -->` shortcode */
export const READMORE = /<!--\s*readmore\s*-->/;

/** A leading `# Title` line (only blank lines before it) */
const LEADING_H1 = /^\s*#[ \t]+(.+?)[ \t#]*(?:\r?\n|$)/;

/** Any `# Title` line */
const ANY_H1 = /^#[ \t]+(.+?)[ \t#]*$/m;

/** Excerpts without a readmore shortcode or config are cropped to this many characters */
export const EXCERPT_LENGTH = 200;

const STATUSES: readonly ArticleStatus[] = ["published", "draft", "unlisted"];

/** An attachment as written in an article's config */
export interface AttachmentConfig {
  url: string;
  thumbnail?: string | undefined;
  mimeType?: string | undefined;
  name?: string | undefined;
}

/** An author as written in an article's config */
export interface AuthorConfig {
  name: string;
  email?: string | undefined;
  url?: string | undefined;
}

/** An article's validated config header */
export interface ArticleConfig {
  type: string;
  status: ArticleStatus;
  date: string;
  author?: AuthorConfig | undefined;
  title?: string | undefined;
  template?: string | undefined;
  excerpt?: string | undefined;
  thumbnail?: string | undefined;
  attachments: AttachmentConfig[];
  tags: string[];
}

/**
 * The format of an article's config header, or DEFAULT_HEADER_FORMAT if it has none.
 *
 * @example
 * headerFormat("<!--json\n{}\n-->\n# Hi"); // "json"
 */
export const headerFormat = (source: string): HeaderFormat =>
  (HEADER.exec(source)?.[1] as HeaderFormat | undefined) ??
  DEFAULT_HEADER_FORMAT;

/**
 * Split an article's source into its parsed config header (empty if there is none), the header's format and its
 * markdown content. The header is YAML (`<!--yaml` or `<!--yml`) or JSON (`<!--json`). Throws if it can't be read.
 *
 * @example
 * splitArticle("<!--yaml\ndate: 2026-10-19\n-->\n# Hi"); // { header: { date: "2026-10-19" }, format: "yaml", content: "\n# Hi" }
 * splitArticle('<!--json\n{ "date": "2026-10-19" }\n-->\n# Hi'); // { header: { date: "2026-10-19" }, format: "json", content: "\n# Hi" }
 */
export const splitArticle = (
  source: string,
): { header: unknown; format: HeaderFormat; content: string } => {
  const match = HEADER.exec(source);
  if (!match)
    return { header: {}, format: DEFAULT_HEADER_FORMAT, content: source };
  const format = match[1] as HeaderFormat;
  const text = match[2] as string;
  let header: unknown;
  try {
    header =
      format === "json"
        ? text.trim()
          ? (JSON.parse(text) as unknown)
          : null
        : (parse(text) as unknown);
  } catch (error) {
    throw new Error(
      `the ${format} config header can't be read: ${(error as Error).message}`,
      { cause: error },
    );
  }
  return {
    header: header ?? {},
    format,
    content: source.slice(match[0].length),
  };
};

/** Throw a config error for an article */
const fail = (source: string, message: string): never => {
  throw new Error(`${source}: ${message}`);
};

/** Read an optional string field */
const optionalString = (
  data: Record<string, unknown>,
  field: string,
  source: string,
): string | undefined => {
  const value = data[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.trim() === "")
    return fail(source, `"${field}" must be a non-empty string`);
  return value.trim();
};

/** Check a value is a map */
const asMap = (
  value: unknown,
  source: string,
  what: string,
): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail(source, `${what} must be a map of fields`);

/**
 * Validate an article's config header and fill in defaults.
 *
 * @param folderType - the type folder the article is in
 * @param source - where the article is, for errors
 *
 * @example
 * parseArticleConfig({ date: "2026-10-19T09:54:00Z" }, "article", "article/hello");
 */
export const parseArticleConfig = (
  header: unknown,
  folderType: string,
  source: string,
): ArticleConfig => {
  const data = asMap(header, source, "the config header");

  const type = optionalString(data, "type", source) ?? folderType;
  if (type !== folderType)
    fail(source, `type "${type}" doesn't match its folder "${folderType}"`);

  const template = optionalString(data, "template", source);
  if (template !== undefined && (!isSlug(template) || template === "list"))
    fail(
      source,
      `"template" must be a template name like "single" (lowercase kebab-case, not "list")`,
    );

  const status = (optionalString(data, "status", source) ??
    "published") as ArticleStatus;
  if (!STATUSES.includes(status))
    fail(source, `"status" must be one of ${STATUSES.join(", ")}`);

  const rawDate =
    data.date instanceof Date ? data.date.toISOString() : data.date;
  if (typeof rawDate !== "string" || Number.isNaN(Date.parse(rawDate)))
    fail(source, `"date" must be an ISO 8601 timestamp`);
  const date = new Date(rawDate as string).toISOString();

  let author: AuthorConfig | undefined;
  if (typeof data.author === "string") author = { name: data.author.trim() };
  else if (data.author !== undefined && data.author !== null) {
    const fields = asMap(data.author, source, `"author"`);
    author = {
      name:
        optionalString(fields, "name", source) ??
        fail(source, `"author.name" is required`),
      email: optionalString(fields, "email", source),
      url: optionalString(fields, "url", source),
    };
  }
  if (author && !slugify(author.name))
    fail(source, `"author" needs a name with letters or numbers`);

  const attachmentList = data.attachments ?? [];
  if (!Array.isArray(attachmentList))
    fail(source, `"attachments" must be a list`);
  const attachments = (attachmentList as unknown[]).map((item, i) => {
    const fields = asMap(item, source, `attachment ${i + 1}`);
    return {
      url:
        optionalString(fields, "url", source) ??
        fail(source, `attachment ${i + 1} needs a "url"`),
      thumbnail: optionalString(fields, "thumbnail", source),
      mimeType: optionalString(fields, "mimeType", source),
      name: optionalString(fields, "name", source),
    };
  });

  const tagList = data.tags ?? [];
  if (
    !Array.isArray(tagList) ||
    tagList.some((tag) => typeof tag !== "string" || !slugify(tag))
  )
    fail(source, `"tags" must be a list of names`);

  return {
    type,
    status,
    date,
    author,
    title: optionalString(data, "title", source),
    template,
    excerpt: optionalString(data, "excerpt", source),
    thumbnail: optionalString(data, "thumbnail", source),
    attachments,
    tags: (tagList as string[]).map((tag) => tag.trim()),
  };
};

/** The article's content split into its parts */
export interface ArticleContent {
  /** The title from the first H1, if any */
  heading: string | undefined;
  /** The body markdown, without a leading H1 or the readmore shortcode */
  body: string;
  /** The markdown before the readmore shortcode, if there is one */
  beforeReadmore: string | undefined;
}

/**
 * Split article markdown into its title heading, body and the part before `<!-- readmore -->`. Raw blocks become HTML
 * that shows their content as it is (see rawHtml) first, so nothing inside them is read as a title or shortcode.
 *
 * @example
 * splitContent("# Hi\n\nIntro <!-- readmore -->rest"); // { heading: "Hi", body: "\nIntro rest", beforeReadmore: "\nIntro" }
 */
export const splitContent = (content: string): ArticleContent => {
  const markdown = replaceRawBlocks(content, rawHtml);
  const heading = ANY_H1.exec(markdown)?.[1];
  const withoutTitle = markdown.replace(LEADING_H1, "");
  // The first break outside code (code may show the shortcode itself)
  const readmore = READMORE.exec(maskCode(withoutTitle));
  if (!readmore)
    return { heading, body: withoutTitle.trim(), beforeReadmore: undefined };
  const before = withoutTitle.slice(0, readmore.index);
  return {
    heading,
    body: (
      before + withoutTitle.slice(readmore.index + readmore[0].length)
    ).trim(),
    beforeReadmore: before.trim(),
  };
};

/** Where an article is and how to render its parts */
export interface ArticleContext {
  /** The blog the article belongs to */
  blog: TemplateDataBlog;
  /** The article's folder on disk */
  dir: string;
  /** The article's slug (its folder name) */
  slug: string;
  /** The article's URL, e.g. "/news/hello/" */
  url: string;
  /** The URL of the article type's front page, which its tag and author lists are under, e.g. "/news/" */
  typeUrl: string;
  /** Where the article is, for errors and warnings */
  source: string;
  /** Replace embed blocks in markdown with HTML */
  replaceEmbeds(markdown: string): Promise<string>;
  /** Render markdown to HTML, resolving relative URLs against a folder URL */
  renderMarkdown(markdown: string, baseUrl: string): string;
}

/**
 * Build an author's template data. Authors without a config are the website itself (the blog's name).
 *
 * @param typeUrl - the URL of the article type, which its author lists are under
 *
 * @example
 * authorData({ name: "Matt Scheurich" }, "LiveCanvas", "/news/"); // { name: "Matt Scheurich", slug: "matt-scheurich", listUrl: "/news/authors/matt-scheurich/" }
 */
export const authorData = (
  author: AuthorConfig | undefined,
  blogName: string,
  typeUrl: string,
): TemplateDataAuthor => {
  const name = author?.name ?? blogName;
  const slug = slugify(name);
  return {
    name,
    slug,
    email: author?.email,
    url: author?.url,
    listUrl: `${typeUrl}authors/${slug}/`,
  };
};

/**
 * Build a tag's template data.
 *
 * @param typeUrl - the URL of the article type, which its tag lists are under
 *
 * @example
 * tagData("Release Notes", "/news/"); // { name: "Release Notes", slug: "release-notes", url: "/news/tags/release-notes/" }
 */
export const tagData = (name: string, typeUrl: string): TemplateDataTag => {
  const slug = slugify(name);
  return { name, slug, url: `${typeUrl}tags/${slug}/` };
};

/**
 * Resolve a URL from an article's config: relative URLs must be files in the article's folder and become
 * root-relative URLs. Returns the URL and, for local files, the file size.
 */
const resolveFile = async (
  url: string,
  articleUrl: string,
  context: ArticleContext,
): Promise<{ url: string; size?: number }> => {
  if (!isRelativeUrl(url)) return { url };
  const file = join(
    context.dir,
    decodeURIComponent(url.split(/[?#]/)[0] as string),
  );
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error();
    return { url: articleUrl + url, size: info.size };
  } catch {
    return fail(
      context.source,
      `"${url}" was not found in the article's folder`,
    );
  }
};

/**
 * Build an attachment's template data, filling in its name and mime type from the file name and its size from the file.
 */
const attachmentData = async (
  attachment: AttachmentConfig,
  articleUrl: string,
  context: ArticleContext,
): Promise<TemplateDataAttachment> => {
  const file = await resolveFile(attachment.url, articleUrl, context);
  const thumbnail = attachment.thumbnail
    ? (await resolveFile(attachment.thumbnail, articleUrl, context)).url
    : undefined;
  const fileName = decodeURIComponent(
    basename(new URL(attachment.url, "file:///").pathname),
  );
  return {
    name: attachment.name ?? fileName,
    thumbnail,
    url: file.url,
    mimeType:
      attachment.mimeType ||
      mime.lookup(fileName) ||
      "application/octet-stream",
    size: file.size,
    sizeRelative: file.size === undefined ? undefined : formatBytes(file.size),
  };
};

/**
 * Build an article's template data from its source. Returns undefined for drafts, which are not built.
 *
 * @example
 * await loadArticle(source, "article", context);
 */
export const loadArticle = async (
  source: string,
  type: string,
  context: ArticleContext,
): Promise<TemplateDataArticle | undefined> => {
  let split: ReturnType<typeof splitArticle>;
  try {
    split = splitArticle(source);
  } catch (error) {
    return fail(context.source, (error as Error).message);
  }
  const { header, content } = split;
  const config = parseArticleConfig(header, type, context.source);
  if (config.status === "draft") return undefined;

  const parts = splitContent(content);
  const title =
    config.title ??
    parts.heading ??
    fail(
      context.source,
      `needs a "title" in its config or a "# Title" heading`,
    );
  const url = context.url;

  const body = parts.body;
  const bodyHtml = context.renderMarkdown(
    await context.replaceEmbeds(body),
    url,
  );
  const bodyText = stripHtml(bodyHtml);

  const excerptSource = config.excerpt ?? parts.beforeReadmore;
  let excerpt: string;
  let excerptHtml: string;
  if (excerptSource === undefined) {
    excerpt = cropText(bodyText, EXCERPT_LENGTH);
    excerptHtml = `<p>${escapeHtml(excerpt)}</p>`;
  } else {
    excerpt = excerptSource;
    excerptHtml = context.renderMarkdown(
      await context.replaceEmbeds(excerptSource),
      url,
    );
  }

  return {
    type,
    status: config.status,
    date: config.date,
    slug: context.slug,
    template: config.template ?? "single",
    url,
    title,
    author: authorData(config.author, context.blog.name, context.typeUrl),
    thumbnail: config.thumbnail
      ? (await resolveFile(config.thumbnail, url, context)).url
      : undefined,
    tags: config.tags.map((tag) => tagData(tag, context.typeUrl)),
    excerpt,
    excerptText: stripHtml(excerptHtml),
    excerptHtml,
    body,
    bodyText,
    bodyHtml,
    attachments: await Promise.all(
      config.attachments.map((attachment) =>
        attachmentData(attachment, url, context),
      ),
    ),
  };
};
