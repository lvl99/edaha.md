import type {
  EmbedPlugin,
  EmbedOptionValues,
} from "@lvl99dotcom/edaha.md/embeds";

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

/** A colour without its "#", e.g. "#0687F5" as "0687f5" */
const colour = (value: unknown) =>
  String(value).replace(/^#/, "").toLowerCase();

/**
 * The player's options (see EmbedPlugin.options): its layout, artwork, tracklist and colours. Their defaults are
 * Bandcamp's large player without a tracklist.
 */
export const BANDCAMP_OPTIONS = {
  layout: {
    title: "Layout",
    description: "How the player looks",
    type: "string",
    enum: ["slim", "artwork-only", "large"],
    $edahaField: {
      select: {
        options: [
          { value: "slim", title: "Slim" },
          { value: "artwork-only", title: "Artwork only" },
          { value: "large", title: "Large" },
        ],
      },
      defaultValue: "large",
    },
  },
  artwork: {
    title: "Hide artwork",
    type: "string",
    enum: ["none"],
    $edahaField: {
      checkbox: { value: "none" },
      showWhen: ["layout", "in", ["slim", "large"]],
    },
  },
  size: {
    title: "Artwork size",
    type: "string",
    enum: ["small", "large"],
    $edahaField: {
      select: {
        options: [
          { value: "small", title: "Small" },
          { value: "large", title: "Large" },
        ],
      },
      defaultValue: "large",
      showWhen: ["layout", "=", "large"],
      hideWhen: ["artwork", "=", "none"],
    },
  },
  tracklist: {
    title: "Show tracklist",
    description: "Albums only",
    type: "boolean",
    $edahaField: {
      checkbox: true,
      defaultValue: false,
      showWhen: ["layout", "=", "large"],
    },
  },
  transparent: {
    title: "Transparent background",
    type: "boolean",
    $edahaField: { checkbox: true, defaultValue: true },
  },
  bgcol: {
    title: "Background colour",
    type: "string",
    pattern: "^#?[0-9a-fA-F]{6}$",
    $edahaField: { color: true, defaultValue: "ffffff" },
  },
  linkcol: {
    title: "Link colour",
    type: "string",
    pattern: "^#?[0-9a-fA-F]{6}$",
    $edahaField: { color: true, defaultValue: "0687f5" },
  },
} satisfies EmbedPlugin["options"];

/** An album page's track rows, for the tracklist's height */
const TRACK_ROW = /class="track_row_view/g;

/** Tracks an album is taken to have when its page doesn't list them */
const DEFAULT_TRACKS = 3;

/**
 * The player's width and height for its options, as Bandcamp's embed codes give them: the tracklist adds a row for
 * each of an album's tracks (tracks have no tracklist).
 *
 * @example
 * playerSize("album", { layout: "large", tracklist: true }, 3); // { width: "350", height: "588" }
 */
export const playerSize = (
  kind: string,
  { layout, artwork, size, tracklist }: EmbedOptionValues,
  tracks = DEFAULT_TRACKS,
): { width: string; height: string } => {
  if (layout === "slim") return { width: "100%", height: "42" };
  if (layout === "artwork-only") return { width: "350", height: "350" };
  const list = kind === "album" && tracklist === true;
  // The large player, with small artwork beside the controls, or none
  if (artwork === "none" || size === "small")
    return list
      ? {
          width: artwork === "none" ? "350" : "400",
          height: String(175 + 33 * tracks),
        }
      : { width: "100%", height: "120" };
  // ...or big artwork above them
  if (list) return { width: "350", height: String(489 + 33 * tracks) };
  return { width: "350", height: kind === "album" ? "470" : "442" };
};

/**
 * Bandcamp's player URL for an album or track and the player's options.
 *
 * @example
 * playerUrl("album", "123", { layout: "large", size: "large", tracklist: false, transparent: true, bgcol: "ffffff", linkcol: "0687f5" });
 * // "https://bandcamp.com/EmbeddedPlayer/album=123/size=large/bgcol=ffffff/linkcol=0687f5/tracklist=false/transparent=true/"
 */
export const playerUrl = (
  kind: string,
  id: string,
  {
    layout,
    artwork,
    size,
    tracklist,
    transparent,
    bgcol,
    linkcol,
  }: EmbedOptionValues,
): string =>
  [
    `https://bandcamp.com/EmbeddedPlayer/${kind}=${id}`,
    `size=${layout === "slim" ? "small" : "large"}`,
    `bgcol=${colour(bgcol)}`,
    `linkcol=${colour(linkcol)}`,
    // Bandcamp's artwork-only player is its large one with minimal controls
    ...(layout === "artwork-only" ? ["minimal=true"] : []),
    ...(artwork === "none"
      ? ["artwork=none"]
      : size === "small"
        ? ["artwork=small"]
        : []),
    // Bandcamp shows the tracklist unless told not to
    ...(layout === "large" && tracklist !== true ? ["tracklist=false"] : []),
    `transparent=${transparent === true}`,
    "",
  ].join("/");

/**
 * Embeds Bandcamp albums and tracks from their page's URL (`<!-- embed:bandcamp -->URL<!-- /embed:bandcamp -->`),
 * in one of Bandcamp's player layouts (see BANDCAMP_OPTIONS). Bandcamp URLs don't contain the album/track ID, so the
 * page is fetched to find it. Throws if the content isn't an album or track URL, or the page has no player.
 *
 * @example
 * await bandcamp.build.render("https://artist.bandcamp.com/album/name", { fetch, state: {}, options: { layout: "slim" } });
 */
export const bandcamp = {
  key: "bandcamp",
  name: "Bandcamp player",
  description:
    "A Bandcamp album or track player, from its page's URL. The page is read when building, so it needs internet access.",
  info: "Paste the URL of an album's or track's page on Bandcamp, e.g. https://artist.bandcamp.com/album/name",
  sources: { frame: ["https://bandcamp.com"] },
  options: BANDCAMP_OPTIONS,
  validate: (content) => {
    itemUrl(content);
    return true;
  },
  build: {
    render: async (content, { fetch, options }) => {
      const url = itemUrl(content);
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Fetching ${url} failed with ${response.status}`);
      const page = await response.text();
      const item = PLAYER_ITEM.exec(page);
      if (!item) throw new Error(`No Bandcamp player found on ${url}`);
      const [, kind, id] = item as unknown as [string, string, string];
      const tracks = page.match(TRACK_ROW)?.length;
      const { width, height } = playerSize(kind, options, tracks);
      return `<iframe width="${width}" height="${height}" src="${playerUrl(kind, id, options)}" title="Bandcamp player" loading="lazy" seamless></iframe>`;
    },
  },
  editor: { icon: ICON },
} satisfies EmbedPlugin;

export default bandcamp;
