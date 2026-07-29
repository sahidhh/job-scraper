"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { setJobStatusAction } from "@/features/jobs/actions";
import type { JobStatus } from "@/features/jobs/domain/types";

function StatusDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

// Mobile counterpart of JobStatusSelect. Same contract: the sheet is
// controlled so picking a status closes it, the trigger shows the new value
// immediately, and a failed action puts the old value back.
export function JobStatusSheet({
  jobId,
  statusId,
  statuses,
}: {
  jobId: string;
  statusId: string | null;
  statuses: JobStatus[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [optimisticStatusId, setOptimisticStatusId] = useState(statusId);
  const [isPending, startTransition] = useTransition();

  // JobCard doesn't remount on router.refresh(), so a status changed elsewhere
  // would otherwise never reach this trigger's local state.
  useEffect(() => {
    setOptimisticStatusId(statusId);
  }, [statusId]);

  const current = statuses.find((s) => s.id === optimisticStatusId);

  function select(id: string) {
    const previousStatusId = optimisticStatusId;
    setOptimisticStatusId(id);
    setOpen(false);
    startTransition(async () => {
      const result = await setJobStatusAction([jobId], id);
      if (!result.ok) {
        setOptimisticStatusId(previousStatusId);
      }
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          disabled={isPending}
          className="flex items-center gap-2 text-sm font-medium transition-opacity disabled:opacity-50"
        >
          {current ? (
            <>
              <StatusDot color={current.color} />
              <span>{current.label}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Set status</span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl pb-8">
        <SheetHeader className="pb-1">
          <SheetTitle>Set status</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col pt-2">
          {statuses.map((status) => (
            <button
              key={status.id}
              type="button"
              onClick={() => select(status.id)}
              className="flex items-center gap-3 px-2 py-3.5 text-sm font-medium transition-colors hover:bg-accent active:bg-accent/80"
            >
              <StatusDot color={status.color} />
              {status.label}
              {status.id === optimisticStatusId && (
                <span className="ml-auto text-xs text-muted-foreground">Current</span>
              )}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
