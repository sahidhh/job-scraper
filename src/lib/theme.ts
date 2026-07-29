export const THEME_STORAGE_KEY = "theme";

/**
 * Applies the resolved theme to `root` by adding or removing the `dark` class.
 *
 * Resolution order: an explicit stored choice wins; absent one, the OS
 * preference decides. `prefersDark` is a *parameter* rather than a
 * `matchMedia` call so the whole function stays pure and node-testable.
 *
 * **This function is serialized with `String()` into the blocking `<head>`
 * script** (see `THEME_SCRIPT` and `layout.tsx`), so it must remain entirely
 * self-contained: no imports, no closures over module scope, no helper it does
 * not define itself. A violation compiles fine and fails silently in the
 * browser.
 */
export function applyStoredTheme(root: Element, stored: string | null, prefersDark: boolean): void {
  const dark = stored === "dark" || (stored !== "light" && prefersDark);
  // `classList`, never `className`. <html> already carries next/font's
  // generated class, which is the only thing defining --font-ibm-plex-sans
  // (layout.tsx). Overwriting className drops the app's typography to the
  // fallback stack, and it presents as a font bug, not a theme bug.
  if (dark) root.classList.add("dark");
  else root.classList.remove("dark");
}

/**
 * The no-flash script. Runs synchronously in <head> before first paint --
 * without it the browser paints `--background` (white) and repaints dark after
 * hydration, which is a full-screen flash on a slow connection.
 *
 * Wrapped in try/catch because `localStorage` throws outright when cookies are
 * blocked; a theme is never worth a blank page.
 */
export const THEME_SCRIPT = `(function(){try{(${String(applyStoredTheme)})(document.documentElement,localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)}),matchMedia("(prefers-color-scheme: dark)").matches)}catch(e){}})()`;
