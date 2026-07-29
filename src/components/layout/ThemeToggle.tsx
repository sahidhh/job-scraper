"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { applyStoredTheme, THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Two-state light/dark toggle (docs/decisions.md AD-63). No "System" option in
 * the control: storage has three states, but the third one is *absence*, which
 * the OS supplies as the default on first load. One icon cannot label a
 * three-way cycle, and "it defaulted correctly, then I set it" is the whole
 * usage.
 *
 * Deliberately holds no React state. The icon is CSS-driven -- both glyphs are
 * in the server HTML and `.dark` decides which paints -- so nothing here has to
 * know the theme during SSR, and there is no `mounted` flag and no icon
 * flicker. The DOM is the state.
 */
export function ThemeToggle({ label = false }: { label?: boolean }) {
  // Only relevant while nothing is stored: follow an OS-level auto-switch that
  // happens with the tab already open. Once the user picks a side, the storage
  // read below makes this a no-op.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === null) applyStoredTheme(document.documentElement, null, event.matches);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return (
    <Button
      type="button"
      variant="ghost"
      size={label ? "default" : "icon"}
      className={label ? "w-full justify-start gap-2 text-muted-foreground" : "text-muted-foreground"}
      // Static, for the same reason the icon is CSS-driven: a name computed
      // from state would differ between server and client render.
      aria-label="Toggle light and dark theme"
      onClick={() => {
        const dark = document.documentElement.classList.toggle("dark");
        localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
      }}
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
      {label && "Theme"}
    </Button>
  );
}
