// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_STORAGE_KEY,
  chooseTheme,
  currentTheme,
  onDeviceThemeChange,
  storedTheme,
  themeSwitcherLabel,
  toggleTheme,
} from "..";

/** The device's setting, and the listeners for its changes */
let deviceDark = false;
const listeners = new Set<() => void>();

/** Change the device's light or dark setting */
const setDeviceDark = (dark: boolean) => {
  deviceDark = dark;
  for (const listener of listeners) listener();
};

beforeEach(() => {
  deviceDark = false;
  listeners.clear();
  // jsdom has no matchMedia
  window.matchMedia = vi.fn(() => ({
    get matches() {
      return deviceDark;
    },
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  delete document.documentElement.dataset.theme;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("currentTheme", () => {
  it("should follow the device until a theme is chosen", () => {
    expect(currentTheme()).toBe("light");
    setDeviceDark(true);
    expect(currentTheme()).toBe("dark");
    chooseTheme("light");
    expect(currentTheme()).toBe("light");
  });

  it("should be light when the browser can't tell the device's setting", () => {
    // @ts-expect-error -- a browser without matchMedia
    delete window.matchMedia;
    expect(currentTheme()).toBe("light");
    const stop = onDeviceThemeChange(vi.fn());
    expect(stop).not.toThrow();
  });

  it("should ignore an unknown data-theme", () => {
    document.documentElement.dataset.theme = "sepia";
    expect(currentTheme()).toBe("light");
  });
});

describe("chooseTheme and storedTheme", () => {
  it("should show and remember the chosen theme", () => {
    expect(storedTheme()).toBeUndefined();
    chooseTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(storedTheme()).toBe("dark");
  });

  it("should ignore an unknown remembered theme", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(storedTheme()).toBeUndefined();
  });

  it("should still show the theme when the browser blocks storage", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    chooseTheme("dark");
    expect(currentTheme()).toBe("dark");
    expect(storedTheme()).toBeUndefined();
  });
});

describe("toggleTheme and themeSwitcherLabel", () => {
  it("should switch to the other theme, and say which theme the switcher switches to", () => {
    setDeviceDark(true);
    expect(themeSwitcherLabel()).toBe("Switch to the light theme");
    expect(toggleTheme()).toBe("light");
    expect(themeSwitcherLabel()).toBe("Switch to the dark theme");
    expect(toggleTheme()).toBe("dark");
    expect(storedTheme()).toBe("dark");
  });
});

describe("onDeviceThemeChange", () => {
  it("should call the listener when the device's setting changes, until stopped", () => {
    const listener = vi.fn();
    const stop = onDeviceThemeChange(listener);
    setDeviceDark(true);
    expect(listener).toHaveBeenCalledOnce();
    stop();
    setDeviceDark(false);
    expect(listener).toHaveBeenCalledOnce();
  });
});
