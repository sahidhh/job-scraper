import { RouteTabs, type RouteTab } from "@/components/layout/RouteTabs";

const TABS: RouteTab[] = [
  { href: "/analytics", label: "Overview" },
  { href: "/analytics/scraping", label: "Scraping & Scoring" },
  { href: "/analytics/breakdown", label: "Job Breakdown" },
  { href: "/analytics/sources", label: "Sources" },
];

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Scrape activity, AI cost, and job score distribution.</p>
      </div>
      <RouteTabs tabs={TABS} />
      {children}
    </div>
  );
}
