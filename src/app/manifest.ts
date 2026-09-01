import type { MetadataRoute } from "next";

// Makes the dashboard installable ("Add to Home Screen"). This is not
// speculative PWA scaffolding: the app already ships a phone rendering of its
// navigation (`BottomNav`, `architecture.md` §12.2) and the job list is read on
// a phone between applications, where a standalone window buys back the
// browser's ~110px of chrome on the one surface that is already dense.
//
// No `start_url` cleverness: "/" is the auth gate's own entry point and
// already redirects to /dashboard when signed in, so an installed icon lands
// in the right place whether or not the session survived.
//
// `theme_color`/`background_color` are single-valued by spec, so they cannot
// follow the theme the way `viewport.themeColor` in `layout.tsx` does. They
// describe the *splash* screen only -- shown once, before the app's own theme
// script runs -- so they take the light values rather than guessing.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Job Intelligence",
    // Deliberately not the shorter "Job Intel", even though `short_name` is
    // what a home screen renders and will truncate this: design/tech-stack.md
    // §8 "Product name" names "Job Intel" as the prototype's shorthand and
    // forbids a third variant. A launcher ellipsis is a rendering detail; a
    // second brand name on the user's home screen is not.
    short_name: "Job Intelligence",
    description: "Personal job intelligence dashboard",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      // `any` keeps the mark's own rounded-square silhouette; `maskable` is
      // full-bleed because Android crops to its launcher's shape and would
      // otherwise clip the corners off a tile that already has them. The glyph
      // fits inside the 80% safe circle at both, so one geometry serves both.
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
