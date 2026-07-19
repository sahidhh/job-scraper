"use client";

import { Loader2, SlidersHorizontal, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { JobStatus } from "@/features/jobs/domain/types";
import { JOB_SOURCES, LOCATION_TAGS } from "@/shared/domain/enums";
import { useDashboardNavigation } from "./DashboardNavigationProvider";

export function FilterBar({
  hasAiScores,
  statuses,
  effectiveMaxYears,
}: {
  hasAiScores: boolean;
  statuses: JobStatus[];
  effectiveMaxYears: number | null;
}) {
  const { isPending, navigate } = useDashboardNavigation();
  const searchParams = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value.length === 0 || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    navigate(`/dashboard?${params.toString()}`);
  }

  function updateSearch(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      params.delete("q");
    } else {
      params.set("q", trimmed);
    }
    navigate(`/dashboard?${params.toString()}`);
  }

  function toggleArchived(checked: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (checked) {
      params.set("archived", "1");
    } else {
      params.delete("archived");
    }
    navigate(`/dashboard?${params.toString()}`);
  }

  // Generic "1"/absent boolean toggle (remote, sponsoring).
  function toggleFlag(key: string, checked: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (checked) {
      params.set(key, "1");
    } else {
      params.delete(key);
    }
    navigate(`/dashboard?${params.toString()}`);
  }

  // Score stored as 0–1 decimal in URL, shown as 0–100 integer in the input
  function updateMinScore(pct: string) {
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = pct.trim();
    if (!trimmed) {
      params.delete("minScore");
    } else {
      const n = Number(trimmed);
      if (!Number.isNaN(n) && n >= 0 && n <= 100) {
        params.set("minScore", String(n / 100));
      }
    }
    navigate(`/dashboard?${params.toString()}`);
  }

  const minScoreDisplay = searchParams.get("minScore")
    ? String(Math.round(Number(searchParams.get("minScore")) * 100))
    : "";

  const activeCount = [
    searchParams.get("location"),
    searchParams.get("source"),
    searchParams.get("status"),
    searchParams.get("minScore"),
    searchParams.get("maxYears"),
    searchParams.get("q"),
    searchParams.get("archived") === "1" ? "1" : null,
    searchParams.get("remote") === "1" ? "1" : null,
    searchParams.get("sponsoring") === "1" ? "1" : null,
  ].filter(Boolean).length;

  function clearAll() {
    navigate("/dashboard");
  }

  const controls = (
    <div className="flex flex-col gap-4">
      <FilterField label="Search">
        <Input
          key={`search-${searchParams.get("q") ?? ""}`}
          type="text"
          placeholder="Title or company"
          defaultValue={searchParams.get("q") ?? ""}
          onBlur={(e) => updateSearch(e.target.value)}
        />
      </FilterField>

      <FilterField label="Location">
        <Select
          value={searchParams.get("location") ?? "all"}
          onValueChange={(v) => updateParam("location", v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
            {LOCATION_TAGS.map((tag) => (
              <SelectItem key={tag} value={tag}>{tag}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField label="Source">
        <Select
          value={searchParams.get("source") ?? "all"}
          onValueChange={(v) => updateParam("source", v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {JOB_SOURCES.map((source) => (
              <SelectItem key={source} value={source}>{source}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField label="Status">
        <Select
          value={searchParams.get("status") ?? "all"}
          onValueChange={(v) => updateParam("status", v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statuses.map((status) => (
              <SelectItem key={status.id} value={status.id}>{status.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField label="Min AI score">
        <div className="relative flex items-center">
          <Input
            key={`score-${minScoreDisplay}`}
            type="number"
            min={0}
            max={100}
            step={5}
            placeholder={hasAiScores ? "e.g. 75" : "No AI scores yet"}
            defaultValue={minScoreDisplay}
            onBlur={(e) => updateMinScore(e.target.value)}
            disabled={!hasAiScores}
            className="pr-7"
          />
          <span className="pointer-events-none absolute right-3 text-sm text-muted-foreground">%</span>
        </div>
      </FilterField>

      <FilterField label="Max experience">
        <div className="relative flex items-center">
          <Input
            key={`years-${searchParams.get("maxYears") ?? ""}`}
            type="number"
            min={0}
            max={50}
            step={1}
            placeholder={effectiveMaxYears === null ? "No limit" : `Default ${effectiveMaxYears}`}
            defaultValue={searchParams.get("maxYears") ?? ""}
            onBlur={(e) => updateParam("maxYears", e.target.value)}
            className="pr-10"
          />
          <span className="pointer-events-none absolute right-3 text-sm text-muted-foreground">yrs</span>
        </div>
      </FilterField>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={searchParams.get("remote") === "1"}
          onChange={(e) => toggleFlag("remote", e.target.checked)}
          className="size-4 accent-primary"
        />
        <span>Remote only</span>
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={searchParams.get("sponsoring") === "1"}
          onChange={(e) => toggleFlag("sponsoring", e.target.checked)}
          className="size-4 accent-primary"
        />
        <span>Offers visa sponsorship</span>
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={searchParams.get("archived") === "1"}
          onChange={(e) => toggleArchived(e.target.checked)}
          className="size-4 accent-primary"
        />
        <span>Show archived jobs</span>
      </label>
    </div>
  );

  return (
    <>
      {/* Mobile: pill button → bottom sheet */}
      <div className="flex items-center gap-2 md:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2 rounded-full px-4">
              <SlidersHorizontal className="size-4" />
              Filters
              {activeCount > 0 && (
                <Badge className="flex size-5 items-center justify-center rounded-full p-0 text-[10px] tabular-nums">
                  {activeCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
            <SheetHeader className="mb-2">
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="px-1 pb-8 pt-2">
              {controls}
              <div className="mt-6 flex gap-3">
                {activeCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { clearAll(); setSheetOpen(false); }}
                    className="gap-1.5 text-muted-foreground"
                  >
                    <X className="size-3.5" />
                    Clear all
                  </Button>
                )}
                <Button
                  size="sm"
                  className="ml-auto"
                  onClick={() => setSheetOpen(false)}
                >
                  Done
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3" />
            Clear
          </button>
        )}
        {isPending && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
            <Loader2 className="size-3.5 animate-spin" />
            Updating…
          </span>
        )}
      </div>

      {/* Desktop: horizontal row */}
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <Input
          key={`search-${searchParams.get("q") ?? ""}`}
          type="text"
          placeholder="Search title or company"
          defaultValue={searchParams.get("q") ?? ""}
          onBlur={(e) => updateSearch(e.target.value)}
          className="w-52"
        />

        <Select
          value={searchParams.get("location") ?? "all"}
          onValueChange={(v) => updateParam("location", v)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
            {LOCATION_TAGS.map((tag) => (
              <SelectItem key={tag} value={tag}>{tag}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("source") ?? "all"}
          onValueChange={(v) => updateParam("source", v)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {JOB_SOURCES.map((source) => (
              <SelectItem key={source} value={source}>{source}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("status") ?? "all"}
          onValueChange={(v) => updateParam("status", v)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statuses.map((status) => (
              <SelectItem key={status.id} value={status.id}>{status.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex items-center">
          <Input
            key={`score-${minScoreDisplay}`}
            type="number"
            min={0}
            max={100}
            step={5}
            placeholder="Min score"
            defaultValue={minScoreDisplay}
            onBlur={(e) => updateMinScore(e.target.value)}
            disabled={!hasAiScores}
            title={hasAiScores ? undefined : "No AI scores yet — run a scoring pass first"}
            className="w-28 pr-7"
          />
          <span className="pointer-events-none absolute right-3 text-sm text-muted-foreground">%</span>
        </div>

        <div className="relative flex items-center">
          <Input
            key={`years-${searchParams.get("maxYears") ?? ""}`}
            type="number"
            min={0}
            max={50}
            step={1}
            placeholder={effectiveMaxYears === null ? "Max yrs" : `Max yrs (${effectiveMaxYears})`}
            defaultValue={searchParams.get("maxYears") ?? ""}
            onBlur={(e) => updateParam("maxYears", e.target.value)}
            className="w-28 pr-10"
          />
          <span className="pointer-events-none absolute right-3 text-sm text-muted-foreground">yrs</span>
        </div>

        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={searchParams.get("remote") === "1"}
            onChange={(e) => toggleFlag("remote", e.target.checked)}
            className="size-4 accent-primary"
          />
          Remote
        </label>

        <label
          className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground"
          title="Only jobs that explicitly offer visa sponsorship"
        >
          <input
            type="checkbox"
            checked={searchParams.get("sponsoring") === "1"}
            onChange={(e) => toggleFlag("sponsoring", e.target.checked)}
            className="size-4 accent-primary"
          />
          Sponsoring
        </label>

        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={searchParams.get("archived") === "1"}
            onChange={(e) => toggleArchived(e.target.checked)}
            className="size-4 accent-primary"
          />
          Archived
        </label>

        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1 text-muted-foreground">
            <X className="size-3.5" />
            Clear
          </Button>
        )}
        {isPending && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-live="polite">
            <Loader2 className="size-4 animate-spin" />
            Updating…
          </span>
        )}
      </div>
    </>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
