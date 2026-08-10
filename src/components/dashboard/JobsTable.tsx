"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { setJobStatusAction } from "@/features/jobs/actions";
import type { JobStatus, JobWithScore } from "@/features/jobs/domain/types";
import { useDashboardNavigation } from "./DashboardNavigationProvider";
import { JobCard } from "./JobCard";
import { JobRow } from "./JobRow";
import type { JobHotkeyAction } from "./jobHotkeys";
import { JOB_HOTKEYS, isTextEntryTarget, resolveJobHotkey } from "./jobHotkeys";

const HOTKEY_LEGEND_ID = "jobs-hotkey-legend";

// Legend chip. Sized off the text rather than the spacing scale so it sits on
// the same baseline as the sentence around it.
function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded-sm border border-border bg-muted px-1 text-[10px] leading-none font-medium text-foreground">
      {children}
    </kbd>
  );
}

export function JobsTable({
  jobs,
  statuses,
  showStatusDropdown,
}: {
  jobs: JobWithScore[];
  statuses: JobStatus[];
  /** Settings → Workflow toggle. False renders a read-only badge instead of the dropdown. */
  showStatusDropdown: boolean;
}) {
  const router = useRouter();
  const { isPending: isNavPending } = useDashboardNavigation();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bulkStatusId, setBulkStatusId] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  // Roving focus. Exactly one row is in the tab order at a time; the arrow
  // keys move which one, and `null` means "nobody has landed here yet", in
  // which case the first row is the entry point.
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  const allSelected = jobs.length > 0 && selected.size === jobs.length;
  const selectedIds = useMemo(() => [...selected], [selected]);

  function toggleSelect(jobId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(jobs.map((job) => job.id)));
  }

  function toggleExpand(jobId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  }

  function applyStatus(statusId: string) {
    if (statusId.length === 0 || selectedIds.length === 0) return;
    startTransition(async () => {
      await setJobStatusAction(selectedIds, statusId);
      setSelected(new Set());
      setBulkStatusId("");
      router.refresh();
    });
  }

  const archivedStatus = statuses.find((status) => status.label === "Archived");
  const notInterestedStatus = statuses.find((status) => status.label === "Not Interested");

  function focusRow(index: number) {
    setFocusedIndex(index);
    rowRefs.current[index]?.focus();
  }

  function runHotkey(action: JobHotkeyAction, job: JobWithScore) {
    if (action === "details") {
      toggleExpand(job.id);
      return;
    }
    const statusId = action === "reject" ? notInterestedStatus?.id : archivedStatus?.id;
    if (statusId === undefined) return;
    startTransition(async () => {
      await setJobStatusAction([job.id], statusId);
      router.refresh();
    });
  }

  // True only while the keyboard is actually inside the table body, so the
  // arrow keys never steal page scrolling and a letter key pressed anywhere
  // else on the dashboard is somebody else's business.
  function tableHasFocus(): boolean {
    const active = document.activeElement;
    return active !== null && bodyRef.current !== null && bodyRef.current.contains(active);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (jobs.length === 0) return;
    const fromTextEntry = isTextEntryTarget(event.target);
    if (fromTextEntry) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!tableHasFocus()) return;
      event.preventDefault();
      const current = focusedIndex ?? 0;
      const next =
        event.key === "ArrowDown"
          ? Math.min(current + 1, jobs.length - 1)
          : Math.max(current - 1, 0);
      focusRow(next);
      return;
    }

    const action = resolveJobHotkey({
      key: event.key,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      fromTextEntry,
    });
    if (action === null) return;
    if (focusedIndex === null || !tableHasFocus()) return;

    const job = jobs[focusedIndex];
    if (job === undefined) return;
    event.preventDefault();
    runHotkey(action, job);
  }

  // One listener for the whole table, not one per row. The handler is read
  // through a ref so the registration itself never has to be torn down and
  // re-added as rows, statuses or the focused index change.
  const handlerRef = useRef(handleKeyDown);
  useEffect(() => {
    handlerRef.current = handleKeyDown;
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => handlerRef.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const bulkBar = selected.size > 0 && (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/50 p-3 text-sm">
      <span className="text-muted-foreground">{selected.size} selected</span>
      <Select value={bulkStatusId} onValueChange={setBulkStatusId} disabled={isPending}>
        <SelectTrigger className="h-8 w-40">
          <SelectValue placeholder="Set status to…" />
        </SelectTrigger>
        <SelectContent>
          {statuses.map((status) => (
            <SelectItem key={status.id} value={status.id}>{status.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" disabled={isPending || bulkStatusId.length === 0} onClick={() => applyStatus(bulkStatusId)}>
        Apply
      </Button>
      {archivedStatus && (
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => applyStatus(archivedStatus.id)}>
          Archive
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setSelected(new Set())}>
        Clear
      </Button>
    </div>
  );

  const emptyState = (
    <p className="py-10 text-center text-sm text-muted-foreground">
      No jobs match the current filters.
    </p>
  );

  return (
    <div className="space-y-3">
      {bulkBar}

      {/* Results dim + block interaction while a filter navigation is in flight */}
      <div
        className={cn(
          "transition-opacity",
          isNavPending && "pointer-events-none opacity-60",
        )}
        aria-busy={isNavPending}
      >
        {/* Mobile card list */}
        <div className="flex flex-col gap-2.5 md:hidden">
          {jobs.length === 0
            ? emptyState
            : jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  statuses={statuses}
                  showStatusDropdown={showStatusDropdown}
                  selected={selected.has(job.id)}
                  onToggleSelect={toggleSelect}
                />
              ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block">
          {/* Shortcuts are only real if they are visible. Desktop-only, since
              the mobile card list has no focused row to act on. */}
          {jobs.length > 0 && (
            <p
              id={HOTKEY_LEGEND_ID}
              className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
            >
              <span className="inline-flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                move between rows
              </span>
              {JOB_HOTKEYS.map((hotkey) => (
                <span key={hotkey.key} className="inline-flex items-center gap-1">
                  <Kbd>{hotkey.key.toUpperCase()}</Kbd>
                  {hotkey.label}
                </span>
              ))}
            </p>
          )}
          <Table className="table-fixed" aria-describedby={jobs.length > 0 ? HOTKEY_LEGEND_ID : undefined}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[4%]">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all jobs"
                    className="size-4 accent-primary"
                  />
                </TableHead>
                <TableHead className="w-[20%]">Title</TableHead>
                <TableHead className="w-[12%]">Company</TableHead>
                <TableHead className="hidden w-[10%] md:table-cell">Location</TableHead>
                <TableHead className="hidden w-[8%] md:table-cell">Source</TableHead>
                <TableHead className="w-[12%]">Status</TableHead>
                <TableHead className="w-[8%]">Score</TableHead>
                <TableHead className="w-[26%] min-w-60">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody ref={bodyRef}>
              {jobs.map((job, index) => (
                <JobRow
                  key={job.id}
                  job={job}
                  statuses={statuses}
                  showStatusDropdown={showStatusDropdown}
                  selected={selected.has(job.id)}
                  onToggleSelect={toggleSelect}
                  expanded={expanded.has(job.id)}
                  onToggleExpand={toggleExpand}
                  tabIndex={index === (focusedIndex ?? 0) ? 0 : -1}
                  onFocusRow={() => setFocusedIndex(index)}
                  rowRef={(element) => {
                    rowRefs.current[index] = element;
                  }}
                />
              ))}
              {jobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    {emptyState}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
