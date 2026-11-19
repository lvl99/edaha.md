import type { EmbedRenderer } from "../types/index.ts";

/** Album or track pages, e.g. /album/<name> */
const ITEM_PATH = /^\/(album|track)\/[^/]+/;

/** The embedded player URL in a Bandcamp page's `og:video` meta tag, e.g. ".../EmbeddedPlayer/v=2/album=123/..." */
const PLAYER_ITEM = /EmbeddedPlayer\/(?:v=\d+\/)?(album|track)=(\d+)/;

/**
 * Embeds Bandcamp albums and tracks. Bandcamp URLs don't contain the album/track ID, so the page is fetched to find it.
 *
 * @example
 * await bandcamp.render(new URL("https://artist.bandcamp.com/album/name"), { fetch });
 */
export const bandcamp: EmbedRenderer = {
  name: "Bandcamp",
  frameSources: ["https://bandcamp.com"],
  match: (url) =>
    url.hostname.endsWith(".bandcamp.com") && ITEM_PATH.test(url.pathname),
  render: async (url, { fetch }) => {
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
};

export default bandcamp;
