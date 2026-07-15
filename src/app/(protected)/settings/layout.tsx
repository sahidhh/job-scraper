import { RouteTabs, type RouteTab } from "@/components/layout/RouteTabs";

const TABS: RouteTab[] = [
  { href: "/settings", label: "Sources" },
  { href: "/settings/workflow", label: "Workflow" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/activity", label: "Activity" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Companies, statuses, scoring, and activity.</p>
      </div>
      <RouteTabs tabs={TABS} />
      <div className="space-y-8">{children}</div>
    </div>
  );
}
