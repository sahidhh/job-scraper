"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/components/layout/navItems";
import { cn } from "@/lib/utils";

// Reads NAV_ITEMS rather than declaring its own list: the desktop sidebar and
// this bar are two renderings of one navigation, and the previous duplicate
// array had already drifted (labelled Dashboard "Jobs", omitted Resume
// entirely, leaving /resume reachable only via an unlabelled header icon).
// See design/architecture.md §12.2.
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-stretch border-t bg-background md:hidden"
      /* Distinct from SidebarNav's landmark: both are in the DOM at all times
         (each hidden at the other's breakpoint), and two nav landmarks sharing
         one name is ambiguous to a screen reader. */
      aria-label="Primary (mobile)"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium tracking-tight transition-colors",
              isActive ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className={cn("size-5", isActive ? "stroke-[2.5px]" : "stroke-[1.75px]")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
