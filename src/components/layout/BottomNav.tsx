"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, Briefcase, LayoutDashboard, Settings, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const BOTTOM_NAV = [
  { href: "/dashboard", label: "Jobs", icon: LayoutDashboard },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/insights", label: "Insights", icon: TrendingUp },
  { href: "/roles", label: "Roles", icon: Briefcase },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-stretch border-t bg-background md:hidden">
      {BOTTOM_NAV.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium tracking-tight transition-colors",
              isActive ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <Icon
              className={cn("size-5", isActive ? "stroke-[2.5px]" : "stroke-[1.75px]")}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
