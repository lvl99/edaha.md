import type { EmbedPlugin } from "@lvl99dotcom/edaha.md/embeds";

/** Album or track pages, e.g. /album/<name> */
const ITEM_PATH = /^\/(album|track)\/[^/]+/;

/** The embedded player URL in a Bandcamp page's `og:video` meta tag, e.g. ".../EmbeddedPlayer/v=2/album=123/..." */
const PLAYER_ITEM = /EmbeddedPlayer\/(?:v=\d+\/)?(album|track)=(\d+)/;

/**
 * A Bandcamp album or track page's URL. Throws saying what is wrong if the content isn't one.
 *
 * @example
 * itemUrl("https://artist.bandcamp.com/album/name"); // URL
 */
export const itemUrl = (content: string): URL => {
  if (!URL.canParse(content))
    throw new Error(
      `"${content}" is not a URL; paste a Bandcamp album or track page's URL`,
    );
  const url = new URL(content);
  if (!url.hostname.endsWith(".bandcamp.com") || !ITEM_PATH.test(url.pathname))
    throw new Error(`${content} is not a Bandcamp album or track page`);
  return url;
};

/** A music note, as the editor's icon */
const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" aria-hidden="true"><path d="M286.5-163.5Q243-207 243-270t43.5-106.5Q330-420 393-420q28 0 50.5 8t39.5 22v-450h234v135H543v435q0 63-43.5 106.5T393-120q-63 0-106.5-43.5Z"/></svg>';

/**
 * Embeds Bandcamp albums and tracks from their page's URL (`<!-- embed:bandcamp -->URL<!-- /embed:bandcamp -->`).
 * Bandcamp URLs don't contain the album/track ID, so the page is fetched to find it. Throws if the content isn't an
 * album or track URL, or the page has no player.
 *
 * @example
 * await bandcamp.build.render("https://artist.bandcamp.com/album/name", { fetch, renders: [] });
 */
export const bandcamp = {
  key: "bandcamp",
  name: "Bandcamp player",
  description:
    "A Bandcamp album or track player, from its page's URL. The page is read when building, so it needs internet access.",
  sources: { frame: ["https://bandcamp.com"] },
  validate: (content) => {
    itemUrl(content);
    return true;
  },
  build: {
    render: async (content, { fetch }) => {
      const url = itemUrl(content);
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Fetching ${url} failed with ${response.status}`);
      const item = PLAYER_ITEM.exec(await response.text());
      if (!item) throw new Error(`No Bandcamp player found on ${url}`);
      const [, kind, id] = item;
      const size =
        kind === "album"
          ? 'width="350" height="470"'
          : 'width="350" height="442"';
      return `<iframe ${size} src="https://bandcamp.com/EmbeddedPlayer/${kind}=${id}/size=large/bgcol=ffffff/linkcol=0687f5/tracklist=false/transparent=true/" title="Bandcamp player" loading="lazy" seamless></iframe>`;
    },
  },
  editor: { icon: ICON },
} satisfies EmbedPlugin;

export default bandcamp;
