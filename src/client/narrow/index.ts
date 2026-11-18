/**
 * Narrow screens (phones and small tablets), where the editor's article list opens from a menu button and the article's
 * settings open full screen from a bar at the bottom. Keep in step with the `@media (max-width: 899.98px)` rules in
 * style.css.
 */
export const NARROW_QUERY = "(max-width: 899.98px)";

/** Matches on narrow screens (undefined where the browser can't tell, e.g. in tests) */
const narrowQuery = (): MediaQueryList | undefined =>
  typeof window.matchMedia === "function"
    ? window.matchMedia(NARROW_QUERY)
    : undefined;

/**
 * Whether the screen is narrow now (false where the browser can't tell).
 *
 * @example
 * isNarrow(); // true on a phone
 */
export const isNarrow = (): boolean => narrowQuery()?.matches ?? false;

/**
 * Call a function when the screen becomes narrow or wide, e.g. when a window is resized or a tablet turned. Returns a
 * function that stops it.
 *
 * @example
 * const stop = onNarrowChange(() => (element.open = false));
 */
export const onNarrowChange = (listener: () => void): (() => void) => {
  const query = narrowQuery();
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
};
