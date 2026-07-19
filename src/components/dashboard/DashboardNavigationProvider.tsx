"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useTransition } from "react";

interface DashboardNavigation {
  /** True while a filter-driven navigation is refetching on the server. */
  isPending: boolean;
  /** Navigate to `url` inside a transition so callers can show pending UI. */
  navigate: (url: string) => void;
}

const DashboardNavigationContext = createContext<DashboardNavigation | null>(null);

// Shares a single navigation-pending state between the FilterBar (which triggers
// route changes) and the results (which dim while the server re-fetches). Mirrors
// the useTransition + router pattern used per-component elsewhere (e.g.
// JobStatusSelect), lifted so the filter controls and the table stay in sync.
export function DashboardNavigationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const value = useMemo<DashboardNavigation>(
    () => ({
      isPending,
      navigate: (url: string) => {
        startTransition(() => {
          router.push(url);
        });
      },
    }),
    [isPending, router],
  );

  return <DashboardNavigationContext.Provider value={value}>{children}</DashboardNavigationContext.Provider>;
}

export function useDashboardNavigation(): DashboardNavigation {
  const context = useContext(DashboardNavigationContext);
  if (context === null) {
    throw new Error("useDashboardNavigation must be used within a DashboardNavigationProvider");
  }
  return context;
}
