/** Letters that don't split into a basic Latin letter plus diacritics */
const LATIN_EXTRA: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  đ: "d",
  ð: "d",
  ł: "l",
  þ: "th",
  ı: "i",
};

/**
 * Convert text to a lowercase, URL-safe `kebab-case` slug. Accented letters become basic Latin, quotes and
 * apostrophes are removed, and any other runs of characters become a single `-`.
 *
 * @example
 * slugify("What?! Who Is This?!? I don't think so..."); // "what-who-is-this-i-dont-think-so"
 * slugify("Café Naïve"); // "cafe-naive"
 */
export const slugify = (text: string): string =>
  text
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[ßæœøđðłþı]/g, (letter) => LATIN_EXTRA[letter] as string)
    .replace(/['"‘’“”`´]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Whether text is already a valid slug.
 *
 * @example
 * isSlug("hello-world"); // true
 * isSlug("Hello World"); // false
 */
export const isSlug = (text: string): boolean =>
  text !== "" && slugify(text) === text;

/**
 * IDs for a document's headings, from their text (as slugs): a repeated heading gets `-2`, `-3`… added, and a heading
 * without letters or numbers gets none (an empty string).
 *
 * @example
 * headingIds(["This?! Is an, example...", "Notes", "Notes", "!!!"]);
 * // ["this-is-an-example", "notes", "notes-2", ""]
 */
export const headingIds = (texts: string[]): string[] => {
  const used = new Set<string>();
  return texts.map((text) => {
    const base = slugify(text);
    if (!base) return "";
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  });
};
