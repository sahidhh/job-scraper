"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setJobStatusAction } from "@/features/jobs/actions";
import type { JobStatus } from "@/features/jobs/domain/types";

function StatusDot({ color }: { color: string }) {
  return <span aria-hidden className="inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

// Per-row status dropdown (P0). Assigns a single status to one job via the
// shared setJobStatusAction, then refreshes the route so the dashboard query
// re-runs (Archived rows drop out, etc.).
export function JobStatusSelect({
  jobId,
  statusId: initialStatusId,
  statuses,
}: {
  jobId: string;
  statusId: string | null;
  statuses: JobStatus[];
}) {
  const router = useRouter();
  const [optimisticStatusId, setOptimisticStatusId] = useState(initialStatusId);
  const [isPending, startTransition] = useTransition();

  function onChange(value: string) {
    const previousStatusId = optimisticStatusId;
    setOptimisticStatusId(value);
    startTransition(async () => {
      const result = await setJobStatusAction([jobId], value);
      if (!result.ok) {
        setOptimisticStatusId(previousStatusId);
      }
      router.refresh();
    });
  }

  return (
    <Select value={optimisticStatusId ?? undefined} onValueChange={onChange} disabled={isPending}>
      <SelectTrigger className="h-8 w-full min-w-0">
        <SelectValue placeholder="Set status" />
      </SelectTrigger>
      <SelectContent>
        {statuses.map((status) => (
          <SelectItem key={status.id} value={status.id}>
            <span className="flex items-center gap-2">
              <StatusDot color={status.color} />
              {status.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
