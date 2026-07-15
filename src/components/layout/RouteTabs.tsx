"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface RouteTab {
  href: string;
  label: string;
}

// Route-based tabs (not client-side toggles) -- each tab is a distinct
// server-rendered page fetching only its own data. `aria-current` + the
// active-tab underline mirror BottomNav's pattern.
export function RouteTabs({ tabs }: { tabs: RouteTab[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label="Tabs">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "shrink-0 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
