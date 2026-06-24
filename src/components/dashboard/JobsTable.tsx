"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setJobStatusAction } from "@/features/jobs/actions";
import type { JobStatus, JobWithScore } from "@/features/jobs/domain/types";
import { JobCard } from "./JobCard";
import { JobRow } from "./JobRow";

export function JobsTable({ jobs, statuses }: { jobs: JobWithScore[]; statuses: JobStatus[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatusId, setBulkStatusId] = useState<string>("");
  const [isPending, startTransition] = useTransition();

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

      {/* Mobile card list */}
      <div className="flex flex-col gap-2.5 md:hidden">
        {jobs.length === 0
          ? emptyState
          : jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                statuses={statuses}
                selected={selected.has(job.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all jobs"
                  className="size-4 accent-primary"
                />
              </TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Company</TableHead>
              <TableHead className="hidden md:table-cell">Location</TableHead>
              <TableHead className="hidden md:table-cell">Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Link</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                statuses={statuses}
                selected={selected.has(job.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
            {jobs.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No jobs match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
