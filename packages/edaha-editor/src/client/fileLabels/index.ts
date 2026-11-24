import type { FileKind } from "../../server/types/index.ts";
import type { IconName } from "../icons/index.ts";

/** The kinds of files, as the file browser names them */
export const FILE_KINDS: readonly { value: FileKind; label: string }[] = [
  { value: "image", label: "Image" },
  { value: "document", label: "Document" },
  { value: "archive", label: "Archive" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "other", label: "Other" },
];

/** The icon shown for each kind of file that isn't an image, in place of its thumbnail */
export const FILE_KIND_ICONS: Record<Exclude<FileKind, "image">, IconName> = {
  document: "description",
  archive: "folder_zip",
  video: "video_file",
  audio: "audio_file",
  other: "draft",
};

/** The units file sizes are shown in */
const SIZE_UNITS = ["B", "KB", "MB", "GB"];

/**
 * A file size for people: bytes, kilobytes, megabytes or gigabytes (1 KB = 1024 bytes), with one decimal below 10.
 *
 * @example
 * formatFileSize(512); // "512 B"
 * formatFileSize(1536); // "1.5 KB"
 * formatFileSize(5 * 1024 ** 3); // "5 GB"
 */
export const formatFileSize = (bytes: number): string => {
  const unit = Math.min(
    Math.max(Math.floor(Math.log(bytes) / Math.log(1024)), 0),
    SIZE_UNITS.length - 1,
  );
  const value = bytes / 1024 ** unit;
  const rounded =
    unit && value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded} ${SIZE_UNITS[unit]}`;
};

/** What each kind of file is called after its extension, e.g. "PNG image" */
const KIND_NOUNS: Record<FileKind, string> = {
  image: "image",
  document: "document",
  archive: "archive",
  video: "video",
  audio: "audio",
  other: "file",
};

/**
 * A file's type for people: its extension and its kind.
 *
 * @example
 * fileTypeLabel("photo.png", "image"); // "PNG image"
 * fileTypeLabel("notes", "other"); // "File"
 */
export const fileTypeLabel = (name: string, kind: FileKind): string => {
  const extension = /\.([^./]+)$/.exec(name)?.[1];
  const noun = KIND_NOUNS[kind];
  return extension
    ? `${extension.toUpperCase()} ${noun}`
    : noun.charAt(0).toUpperCase() + noun.slice(1);
};
