import { Badge } from "@/components/ui/badge";
import type { JobStatus } from "@/features/jobs/domain/types";

// Read-only stand-in for JobStatusSelect/JobStatusSheet when Settings →
// Workflow's "status dropdown" toggle is off. Status is still changed via
// the quick-action buttons (Not Interested/Viewed/Applied/Archive).
export function StatusBadge({ status }: { status: JobStatus | undefined }) {
  if (!status) {
    return <span className="text-sm text-muted-foreground">New</span>;
  }
  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <span aria-hidden className="inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
      {status.label}
    </Badge>
  );
}
