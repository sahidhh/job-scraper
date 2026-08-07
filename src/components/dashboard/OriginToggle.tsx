"use client";

import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useDashboardNavigation } from "./DashboardNavigationProvider";

// Global scraper/Claude-routine data-origin switch (docs/tasks/manual-job-
// matches.md §3/§4.3). Sets/clears the `origin` search param the same way
// FilterBar's toggles do -- one more filter value, not a second page/route.
export function OriginToggle() {
  const { navigate } = useDashboardNavigation();
  const searchParams = useSearchParams();
  const origin = searchParams.get("origin") === "claude_routine" ? "claude_routine" : "scraper";

  function setOrigin(value: "scraper" | "claude_routine") {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "scraper") {
      params.delete("origin");
    } else {
      params.set("origin", value);
    }
    navigate(`/dashboard?${params.toString()}`);
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-border p-0.5">
      <Button
        type="button"
        size="sm"
        variant={origin === "scraper" ? "default" : "ghost"}
        onClick={() => setOrigin("scraper")}
      >
        Scraper
      </Button>
      <Button
        type="button"
        size="sm"
        variant={origin === "claude_routine" ? "default" : "ghost"}
        onClick={() => setOrigin("claude_routine")}
      >
        Claude routine
      </Button>
    </div>
  );
}
