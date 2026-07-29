import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
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
  title: "Job Intelligence Platform",
  description: "Personal job intelligence dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The generated class only *defines* --font-ibm-plex-sans; globals.css
    // maps it onto Tailwind v4's --font-sans theme token, so `font-sans`
    // (and the preflight default) resolve to it everywhere.
    <html lang="en" className={ibmPlexSans.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
