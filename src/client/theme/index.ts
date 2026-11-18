/** A colour theme */
export type Theme = "light" | "dark";

/** Where the editor remembers the chosen theme in this browser */
export const THEME_STORAGE_KEY = "edaha-editor-theme";

/** Matches when the device prefers dark colours (undefined where the browser can't tell, e.g. in tests) */
const prefersDark = (): MediaQueryList | undefined =>
  typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : undefined;

/**
 * The theme chosen with the theme switcher and remembered in this browser, or undefined if none was chosen (or the
 * browser blocks storage).
 *
 * @example
 * storedTheme(); // "dark"
 */
export const storedTheme = (): Theme | undefined => {
  try {
    const theme = localStorage.getItem(THEME_STORAGE_KEY);
    return theme === "light" || theme === "dark" ? theme : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The theme being shown: the chosen one (`data-theme` on <html>), or else the device's (light if it can't tell).
 *
 * @example
 * currentTheme(); // "light"
 */
export const currentTheme = (): Theme => {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return prefersDark()?.matches ? "dark" : "light";
};

/**
 * Show a theme (as `data-theme` on <html>, which the stylesheet uses) and remember it where the browser allows it.
 *
 * @example
 * chooseTheme("dark");
 */
export const chooseTheme = (theme: Theme): void => {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Not remembered, e.g. in a private window with storage blocked
  }
};

/**
 * Switch to the other theme from the one being shown. Returns the new theme.
 *
 * @example
 * toggleTheme(); // "dark" when the light theme was shown
 */
export const toggleTheme = (): Theme => {
  const theme = currentTheme() === "dark" ? "light" : "dark";
  chooseTheme(theme);
  return theme;
};

/**
 * The theme switcher's label: what pressing it does.
 *
 * @example
 * themeSwitcherLabel(); // "Switch to the dark theme" when the light theme is shown
 */
export const themeSwitcherLabel = (): string =>
  `Switch to the ${currentTheme() === "dark" ? "light" : "dark"} theme`;

/**
 * Call a function when the device's light or dark setting changes (which changes the theme shown while none is
 * chosen). Returns a function that stops it.
 *
 * @example
 * const stop = onDeviceThemeChange(() => element.requestUpdate());
 */
export const onDeviceThemeChange = (listener: () => void): (() => void) => {
  const query = prefersDark();
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
};
