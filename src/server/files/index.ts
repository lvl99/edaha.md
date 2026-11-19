import { stringify } from "yaml";
import { splitArticle } from "../../generator/article/index.ts";
import { replaceOutsideCode } from "../../generator/format/index.ts";
import {
  DEFAULT_FILE_ORDERS,
  type FileFilters,
  type FileKind,
  type FilePage,
  type FileQuery,
  type FileSort,
  type IndexedFile,
} from "../types/index.ts";

/** The most files a page of query results has */
export const MAX_FILES_PER_PAGE = 50;

/** File extensions of each kind (anything else is "other") */
const KIND_EXTENSIONS: Readonly<Record<Exclude<FileKind, "other">, string[]>> =
  {
    image: ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "ico", "bmp"],
    document: [
      "pdf",
      "doc",
      "docx",
      "odt",
      "rtf",
      "txt",
      "md",
      "csv",
      "xls",
      "xlsx",
      "ods",
      "ppt",
      "pptx",
      "odp",
      "epub",
    ],
    archive: ["zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar"],
    video: ["mp4", "webm", "mov", "m4v", "ogv", "avi", "mkv"],
    audio: ["mp3", "wav", "ogg", "oga", "m4a", "flac", "aac", "opus"],
  };

/**
 * The kind of file a name is, by its extension.
 *
 * @example
 * fileKind("photo.JPG"); // "image"
 * fileKind("notes"); // "other"
 */
export const fileKind = (name: string): FileKind => {
  const extension = /\.([^./]+)$/.exec(name)?.[1]?.toLowerCase() ?? "";
  return (
    (Object.entries(KIND_EXTENSIONS).find(([, extensions]) =>
      extensions.includes(extension),
    )?.[0] as FileKind | undefined) ?? "other"
  );
};

/** A file's location, e.g. "news/welcome" */
const location = (file: IndexedFile) => `${file.type}/${file.slug}`;

/** The value each sort compares */
const SORT_VALUES: Readonly<
  Record<FileSort, (file: IndexedFile) => string | number>
> = {
  name: (file) => file.name.toLocaleLowerCase(),
  kind: (file) => file.kind,
  size: (file) => file.size,
  location,
};

/** Compare two sort values: numbers by size, text alphabetically */
const compare = (a: string | number, b: string | number) =>
  typeof a === "number" && typeof b === "number"
    ? a - b
    : String(a).localeCompare(String(b));

/**
 * Find files: those whose name contains the search text (ignoring case) and that are of the kind and in an article of
 * the type given, sorted by name, kind, size or location, ascending or descending (by default by location then name,
 * A to Z), one page at a time.
 *
 * @example
 * queryFiles(files, { search: "photo", kind: "image", sort: "size", order: "desc" });
 */
export const queryFiles = (
  files: IndexedFile[],
  query: FileQuery = {},
): Omit<FilePage, "files"> & { files: IndexedFile[] } => {
  const search = query.search?.trim().toLocaleLowerCase() ?? "";
  const sort: FileSort = query.sort ?? "location";
  const direction =
    (query.order ?? DEFAULT_FILE_ORDERS[sort]) === "asc" ? 1 : -1;
  const value = SORT_VALUES[sort];
  const found = files
    .filter(
      (file) =>
        (!search || file.name.toLocaleLowerCase().includes(search)) &&
        (!query.kind || file.kind === query.kind) &&
        (!query.type || file.type === query.type),
    )
    .sort(
      (a, b) =>
        direction * compare(value(a), value(b)) ||
        location(a).localeCompare(location(b)) ||
        a.name.localeCompare(b.name),
    );
  const perPage = Math.min(
    Math.max(Math.floor(query.perPage ?? MAX_FILES_PER_PAGE), 1),
    MAX_FILES_PER_PAGE,
  );
  const pages = Math.max(Math.ceil(found.length / perPage), 1);
  const page = Math.min(Math.max(Math.floor(query.page ?? 1), 1), pages);
  return {
    files: found.slice((page - 1) * perPage, page * perPage),
    total: found.length,
    page,
    pages,
    perPage,
  };
};

/**
 * The file kinds and article types files are in, for the file browser's filters.
 *
 * @example
 * fileFilters(files); // { kinds: ["document", "image"], types: ["news"] }
 */
export const fileFilters = (files: IndexedFile[]): FileFilters => ({
  kinds: [...new Set(files.map((file) => file.kind))].sort(),
  types: [...new Set(files.map((file) => file.type))].sort(),
});

/** Escape text for use in a regular expression */
const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The ways an article can refer to a file: its name (or `./` and its name) in the file's own article, and its path on
 * the website (e.g. "/news/welcome/photo.png") or its full address anywhere.
 *
 * @param url - the file's path on the website
 * @param siteUrl - the website's address (without a trailing slash), if it has one
 *
 * @example
 * fileReferences("photo.png", "/news/welcome/photo.png", "https://example.com", true);
 * // ["photo.png", "./photo.png", "/news/welcome/photo.png", "https://example.com/news/welcome/photo.png"]
 */
export const fileReferences = (
  name: string,
  url: string,
  siteUrl: string | undefined,
  ownArticle: boolean,
): string[] => [
  ...(ownArticle ? [name, `./${name}`] : []),
  url,
  ...(siteUrl ? [siteUrl + url] : []),
];

/** What to do with references to a file: point them at another file name, or remove them */
export type ReferenceChange = { rename: string } | { remove: true };

/** A reference in Markdown or HTML: an image or link (with its text), or an HTML image or link */
const REFERENCE =
  /(?<image>!?)\[(?<text>[^\]]*)\]\(\s*<?(?<dest>[^)\s>]+)>?(?<title>\s+"[^"]*")?\s*\)|<img\b[^>]*?\ssrc=(?<imgQuote>["'])(?<imgSrc>[^"']+)\k<imgQuote>[^>]*>|<a\b[^>]*?\shref=(?<linkQuote>["'])(?<linkHref>[^"']+)\k<linkQuote>[^>]*>(?<linkText>[\s\S]*?)<\/a>/;

/** Swap a reference's file name for another, keeping its folder or address */
const renamed = (reference: string, name: string) =>
  reference.replace(/[^/]+$/, name);

/**
 * Change references to a file in Markdown (outside code): point them at a new file name, or remove them (images are
 * removed, links keep their text). Returns the Markdown and how many references were changed.
 *
 * @example
 * changeBodyReferences("![](a.png) [A](a.png)", ["a.png"], { remove: true }); // { markdown: " A", count: 2 }
 */
export const changeBodyReferences = (
  markdown: string,
  references: string[],
  change: ReferenceChange,
): { markdown: string; count: number } => {
  let count = 0;
  const result = replaceOutsideCode(markdown, REFERENCE, (match) => {
    const groups = match.groups as Record<string, string | undefined>;
    // One of the three kinds of reference matched
    const dest = (groups.dest ?? groups.imgSrc ?? groups.linkHref) as string;
    if (!references.includes(dest)) return match[0];
    count++;
    if ("rename" in change)
      return match[0].replace(dest, renamed(dest, change.rename));
    // Images go; links keep their text
    if (groups.imgSrc || groups.image) return "";
    return (groups.text ?? groups.linkText) as string;
  });
  return { markdown: result, count };
};

/**
 * Change references to a file in an article's settings: its thumbnail, and its attachments and their thumbnails. Removing
 * clears a thumbnail and removes an attachment. Returns the settings (the same object if nothing changed) and how many were changed.
 */
const changeHeaderReferences = (
  header: Record<string, unknown>,
  references: string[],
  change: ReferenceChange,
): { header: Record<string, unknown>; count: number } => {
  let count = 0;
  const next = { ...header };
  const { thumbnail, attachments } = header;
  if (typeof thumbnail === "string" && references.includes(thumbnail)) {
    count++;
    if ("rename" in change) next.thumbnail = renamed(thumbnail, change.rename);
    else delete next.thumbnail;
  }
  if (Array.isArray(attachments)) {
    const kept: unknown[] = [];
    for (const attachment of attachments as unknown[]) {
      const fields =
        typeof attachment === "string"
          ? { url: attachment }
          : ({ ...(attachment as object) } as Record<string, unknown>);
      // The attachment itself, or only its thumbnail, may be the file
      if (typeof fields.url === "string" && references.includes(fields.url)) {
        count++;
        if ("remove" in change) continue;
        fields.url = renamed(fields.url, change.rename);
      }
      if (
        typeof fields.thumbnail === "string" &&
        references.includes(fields.thumbnail)
      ) {
        count++;
        if ("rename" in change)
          fields.thumbnail = renamed(fields.thumbnail, change.rename);
        else delete fields.thumbnail;
      }
      kept.push(typeof attachment === "string" ? fields.url : fields);
    }
    if (kept.length) next.attachments = kept;
    else delete next.attachments;
  }
  return { header: count ? next : header, count };
};

/**
 * Change references to a file in an article's source (its settings header and its body), keeping the header's format.
 * Returns the new source, or undefined if the article doesn't refer to the file.
 *
 * @example
 * changeArticleReferences(source, ["photo.png"], { rename: "photo.jpg" });
 */
export const changeArticleReferences = (
  source: string,
  references: string[],
  change: ReferenceChange,
): string | undefined => {
  // Most articles don't mention the file at all
  const names = [
    ...new Set(references.map((reference) => reference.replace(/^.*\//, ""))),
  ];
  if (!new RegExp(names.map(escapeRegExp).join("|")).test(source))
    return undefined;
  const { header, format, content } = splitArticle(source);
  const settings = changeHeaderReferences(
    header as Record<string, unknown>,
    references,
    change,
  );
  const body = changeBodyReferences(content, references, change);
  if (!settings.count && !body.count) return undefined;
  const headerSource = settings.count
    ? `<!--${format}\n${format === "json" ? `${JSON.stringify(settings.header, null, 2)}\n` : stringify(settings.header)}-->`
    : source.slice(0, source.length - content.length);
  return headerSource + body.markdown;
};
