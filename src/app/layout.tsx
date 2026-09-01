import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// IBM Plex Sans, self-hosted by `next/font` (no external request at runtime,
// no dependency added -- next/font ships with Next). Chosen over the system
// stack because this UI is a dense data surface: the dashboard table, the stat
// chips and the insight percentages all sit at text-xs/text-[11px], where the
// OS default stack renders differently on every machine and the layout the
// design handoff specifies stops holding. Plex is a neo-grotesque drawn for
// technical reading -- open apertures, a distinguishable l/I/1 and 0/O, and
// even-width lining figures that make the `tabular-nums` convention in
// tech-stack.md section 8 actually do its job. It also sits quietly next to
// the indigo accent (decisions.md AD-54) instead of competing with it.
//
// Cold-start budget (limitations.md section 6.4): latin subset only, and the
// variable cut rather than static weights -- one file covers 400/500/600/700
// (every weight the design system uses) instead of four downloads.
// `display: swap` paints text immediately in next/font's metric-adjusted
// fallback, so a slow font never blocks first paint.
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ibm-plex-sans",
});

export const metadata: Metadata = {
  // "Job Intelligence", not "Job Intelligence Platform" -- design/tech-stack.md
  // §8 "Product name" fixes one name and explicitly forbids a third variant
  // alongside the handoff's "Job Intel"; the old title was that third variant.
  //
  // The template exists because this app is read with many tabs open at once
  // (a dozen job listings next to the dashboard). Every route sets its own
  // title, so the tab strip and history are navigable instead of showing a
  // dozen identical entries.
  title: { default: "Job Intelligence", template: "%s · Job Intelligence" },
  description: "Personal job intelligence dashboard",
  applicationName: "Job Intelligence",
  // Single-user, auth-gated, and every route below `(protected)` 302s to
  // /login for a crawler anyway -- but /login itself is publicly reachable and
  // is otherwise perfectly indexable. Nothing here is meant to be found.
  robots: { index: false, follow: false },
  // iOS reads this, not the manifest, when the app is added to the home
  // screen; without it the installed window falls back to the browser chrome
  // the manifest's `display: standalone` is trying to drop.
  appleWebApp: { capable: true, title: "Job Intelligence", statusBarStyle: "default" },
};

// Paints the browser's own chrome (mobile Safari's address bar, Android's
// status bar) to match the page instead of leaving a light strip above a dark
// app. Two media-scoped values rather than one, because the theme follows the
// OS by default (AD-63) -- and this is metadata, not markup, so it does not
// breach the "never branch server-rendered output on theme" rule: the browser
// picks between both values client-side, exactly as the CSS does.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The generated class only *defines* --font-ibm-plex-sans; globals.css
    // maps it onto Tailwind v4's --font-sans theme token, so `font-sans`
    // (and the preflight default) resolve to it everywhere.
    //
    // suppressHydrationWarning because THEME_SCRIPT adds `dark` to this element
    // before React hydrates, so server and client markup differ here by design.
    // React's suppression is one level deep -- <html>'s own attributes and
    // nothing below -- which is exactly the intended blast radius. The standing
    // rule it creates: never branch server-rendered output on theme, branch in
    // CSS (decisions.md AD-63).
    <html lang="en" className={ibmPlexSans.variable} suppressHydrationWarning>
      <head>
        {/* Blocking and inline on purpose: it has to run before first paint or
            the page flashes white on the way to dark. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
