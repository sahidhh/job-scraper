// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { ThemeToggle } from "./ThemeToggle";

// jsdom does not implement matchMedia, and the OS-follow effect calls it on
// mount. Every field the component touches has to be present or the render
// throws before any assertion runs.
const listeners = new Set<(event: MediaQueryListEvent) => void>();
vi.stubGlobal("matchMedia", () => ({
  matches: false,
  addEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) => listeners.add(fn),
  removeEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) => listeners.delete(fn),
}));

beforeEach(() => {
  localStorage.clear();
  listeners.clear();
  document.documentElement.classList.remove("dark");
});

describe("ThemeToggle", () => {
  it("flips the class on <html> and records the choice", async () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: "Toggle light and dark theme" });

    await userEvent.click(button);
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    await userEvent.click(button);
    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  // The accessible name and both icons are static -- the theme is expressed in
  // CSS, not in state -- so there is nothing here that could mismatch between
  // the server render and hydration.
  it("renders both icons and a name that does not depend on the theme", () => {
    const { container } = render(<ThemeToggle />);
    expect(container.querySelectorAll("svg")).toHaveLength(2);

    document.documentElement.classList.add("dark");
    expect(screen.getByRole("button", { name: "Toggle light and dark theme" })).toBeInTheDocument();
  });

  it("follows an OS switch only while no explicit choice is stored", () => {
    render(<ThemeToggle />);
    const fire = (matches: boolean) => {
      for (const listener of listeners) listener({ matches } as MediaQueryListEvent);
    };

    fire(true);
    expect(document.documentElement).toHaveClass("dark");

    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    fire(false);
    expect(document.documentElement).toHaveClass("dark");
  });
});
