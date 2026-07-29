// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { applyStoredTheme, THEME_SCRIPT, THEME_STORAGE_KEY } from "./theme";

// jsdom rather than node purely for a real `classList` -- applyStoredTheme is
// pure otherwise (the OS preference arrives as a parameter, so nothing here
// needs matchMedia stubbed).
function element(className = ""): Element {
  const el = document.createElement("div");
  el.className = className;
  return el;
}

describe("applyStoredTheme", () => {
  it("applies a stored dark choice", () => {
    const el = element();
    applyStoredTheme(el, "dark", false);
    expect(el.classList.contains("dark")).toBe(true);
  });

  it("honours a stored light choice over an OS preference for dark", () => {
    const el = element("dark");
    applyStoredTheme(el, "light", true);
    expect(el.classList.contains("dark")).toBe(false);
  });

  it("follows the OS when nothing is stored", () => {
    const dark = element();
    const light = element();
    applyStoredTheme(dark, null, true);
    applyStoredTheme(light, null, false);
    expect(dark.classList.contains("dark")).toBe(true);
    expect(light.classList.contains("dark")).toBe(false);
  });

  // The regression this exists for: writing `className = "dark"` would drop
  // next/font's generated class off <html>, which is the only thing defining
  // --font-ibm-plex-sans. It presents as a typography bug, not a theme bug.
  it("preserves the classes already on the element", () => {
    const el = element("__variable_abc123 some-other-class");
    applyStoredTheme(el, "dark", false);
    applyStoredTheme(el, "light", false);
    expect(el.className).toContain("__variable_abc123");
    expect(el.className).toContain("some-other-class");
  });
});

describe("THEME_SCRIPT", () => {
  // Guards the String(fn) serialization: if a compiler step ever rewrites the
  // function into something that closes over module scope, the emitted script
  // silently stops working in the browser and no other test would notice.
  it("inlines the function body rather than a reference to it", () => {
    expect(THEME_SCRIPT).toContain("classList.add");
    expect(THEME_SCRIPT).toContain("classList.remove");
    expect(THEME_SCRIPT).toContain(THEME_STORAGE_KEY);
  });

  it("runs against a real document without throwing", () => {
    document.documentElement.classList.remove("dark");
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    // jsdom has no matchMedia; the script's own try/catch must not swallow the
    // stored-choice path, so provide one.
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: false }),
    });

    new Function(THEME_SCRIPT)();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

beforeEach(() => {
  // jsdom's localStorage persists across tests in a file.
  localStorage.clear();
});
