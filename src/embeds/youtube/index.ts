import { escapeHtml } from "../../generator/format/index.ts";
import type { EmbedRenderer } from "../types/index.ts";

const HOSTS = new Set([
  "youtu.be",
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

/** YouTube video IDs are 11 URL-safe base64 characters */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Paths where the video ID follows the first segment, e.g. /embed/<id> */
const ID_PATHS = new Set(["embed", "shorts", "live", "v"]);

/**
 * Get the video ID from any form of YouTube URL. Throws if there is none.
 *
 * @example
 * extractYouTubeId(new URL("https://youtu.be/aju_UB5VIf8")); // "aju_UB5VIf8"
 * extractYouTubeId(new URL("https://www.youtube.com/watch?v=aju_UB5VIf8")); // "aju_UB5VIf8"
 */
export const extractYouTubeId = (url: URL): string => {
  const [first = "", second = ""] = url.pathname.split("/").filter(Boolean);
  const id =
    url.hostname === "youtu.be"
      ? first
      : first === "watch"
        ? (url.searchParams.get("v") ?? "")
        : ID_PATHS.has(first)
          ? second
          : "";
  if (!VIDEO_ID.test(id)) throw new Error(`No YouTube video ID in ${url}`);
  return id;
};

/**
 * Embeds YouTube videos. Always uses youtube-nocookie.com, whatever form of YouTube URL is given.
 *
 * @example
 * await youtube.render(new URL("https://youtu.be/aju_UB5VIf8"), context); // '<iframe ... src="https://www.youtube-nocookie.com/embed/aju_UB5VIf8" ...>'
 */
export const youtube: EmbedRenderer = {
  name: "YouTube",
  match: (url) => HOSTS.has(url.hostname),
  render: async (url) => {
    const src = `https://www.youtube-nocookie.com/embed/${extractYouTubeId(url)}`;
    return `<iframe width="560" height="315" src="${escapeHtml(src)}" title="YouTube video player" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  },
};

export default youtube;
