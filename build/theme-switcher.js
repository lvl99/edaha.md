// Switches the website between its light and dark colours when a `.theme-switcher` button is pressed, remembering the
// choice in this browser. Until a choice is made, the website follows the device's setting. The chosen theme is set as
// `data-theme="light"` or `data-theme="dark"` on <html>, which the stylesheets use; the page's <head> sets a remembered
// choice before the page appears.
(() => {
  const STORAGE_KEY = "edaha-theme";
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

  /** The theme being shown: the chosen one, or the device's */
  const currentTheme = () =>
    root.dataset.theme || (prefersDark.matches ? "dark" : "light");

  /** Tell screen readers (and mouse users, with a tooltip) which theme each switcher switches to */
  const labelSwitchers = () => {
    const label = `Switch to the ${currentTheme() === "dark" ? "light" : "dark"} theme`;
    for (const switcher of document.querySelectorAll(".theme-switcher")) {
      switcher.title = label;
      const text = switcher.querySelector(".visually-hidden");
      if (text) text.textContent = label;
      else switcher.setAttribute("aria-label", label);
    }
  };

  /** Show a theme and remember it (where the browser allows it) */
  const chooseTheme = (theme) => {
    root.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Not remembered, e.g. in a private window with storage blocked
    }
    labelSwitchers();
  };

  document.addEventListener("click", (event) => {
    const switcher =
      event.target instanceof Element &&
      event.target.closest(".theme-switcher");
    if (!switcher) return;
    event.preventDefault();
    chooseTheme(currentTheme() === "dark" ? "light" : "dark");
  });
  // The device's setting changed while no theme is chosen
  prefersDark.addEventListener("change", labelSwitchers);
  labelSwitchers();
})();
