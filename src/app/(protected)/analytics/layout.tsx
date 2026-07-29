import { RouteTabs, RouteTab } from "@/components/layout/RouteTabs";

const tabs: RouteTab[] = [
  { href: "/analytics", label: "Overview" },
  { href: "/analytics/operational", label: "Operational" },
];

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Analytics</h1>
      </header>
      <RouteTabs tabs={tabs} />
      <main>{children}</main>
    </div>
  );
}
