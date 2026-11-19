import type { EmbedPlugin } from "@lvl99dotcom/edaha.md/embeds";
import { escapeHtml } from "@lvl99dotcom/edaha.md/generator/format";

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

/** The YouTube logo's play button shape, as the editor's icon */
const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" aria-hidden="true"><path d="m392-313 260-169-260-169v338ZM140-160q-24 0-42-18t-18-42v-520q0-24 18-42t42-18h680q24 0 42 18t18 42v520q0 24-18 42t-42 18H140Zm0-60h680v-520H140v520Zm0 0v-520 520Z"/></svg>';

/**
 * Embeds YouTube videos from their URL (`<!-- embed:youtube -->URL<!-- /embed:youtube -->`). Always uses
 * youtube-nocookie.com, whatever form of YouTube URL is given. Throws if the content isn't a YouTube video URL.
 *
 * @example
 * await youtube.build.render("https://youtu.be/aju_UB5VIf8", context); // '<iframe ... src="https://www.youtube-nocookie.com/embed/aju_UB5VIf8" ...>'
 */
export const youtube = {
  key: "youtube",
  name: "YouTube video",
  description: "A YouTube video player, from the video's URL.",
  sources: { frame: ["https://www.youtube-nocookie.com"] },
  build: {
    render: async (content) => {
      const url = new URL(content);
      if (!HOSTS.has(url.hostname))
        throw new Error(`${content} is not a YouTube URL`);
      const src = `https://www.youtube-nocookie.com/embed/${extractYouTubeId(url)}`;
      return `<iframe width="560" height="315" src="${escapeHtml(src)}" title="YouTube video player" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
    },
  },
  editor: { icon: ICON },
} satisfies EmbedPlugin;

export default youtube;
