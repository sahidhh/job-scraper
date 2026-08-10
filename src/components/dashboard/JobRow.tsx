"use client";

import { Archive, Check, ChevronDown, ChevronRight, Eye, ExternalLink, ThumbsDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { JobStatus, JobWithScore } from "@/features/jobs/domain/types";
import { INELIGIBLE_REASON_LABELS } from "@/features/scoring/domain/classifyEligibility";
import { ApplicationDraftDialog } from "./ApplicationDraftDialog";
import { CompanyHistoryPanel } from "./CompanyHistoryPanel";
import { JobStatusSelect } from "./JobStatusSelect";
import { StatusBadge } from "./StatusBadge";
import { setJobStatusAction } from "@/features/jobs/actions";
import { formatScore, manualScoreBadgeVariant, pendingScoreLabel, scoreBadgeVariant } from "./jobScore";
import { Button } from "@/components/ui/button";

// Total column count, used for the expanded-reasoning row's colSpan:
// select, title, company, location, source, status, score, link.
const COLUMN_COUNT = 8;

// The roving-focus cursor. A row is a reading position, not a control, so it
// gets a rail on its leading edge and a settled tint across the cells rather
// than the 3px ring the buttons use — the ring reads as "this is editable",
// which a row is not. Driven by :focus-within so it follows real DOM focus
// and clears itself, and painted on the cells because a <tr> background sits
// underneath them.
const FOCUS_CURSOR =
  "outline-none focus-within:[&>td]:bg-accent/50 focus-within:[&>td:first-child]:[box-shadow:inset_2px_0_0_0_var(--color-ring)]";

// AI score thresholds mirror scoring.md §3/§5 via jobScore.ts.
function ScoreBadge({
  source,
  aiScore,
  manualScore,
  keywordScore,
  overallScoreReasons,
}: {
  source: JobWithScore["source"];
  aiScore: number | null;
  manualScore: number | null;
  keywordScore: number | null;
  overallScoreReasons: string[] | null;
}) {
  // claude_routine rows never enter the AI queue (AD-67) -- manual_score is
  // the truth for them, not "Pending" (which would imply AI scoring is
  // coming; it never runs for this source).
  if (source === "claude_routine") {
    return manualScore === null ? (
      <Badge variant="outline" className="font-normal text-muted-foreground">—</Badge>
    ) : (
      <div className="flex flex-col gap-0.5">
        <Badge variant={manualScoreBadgeVariant(manualScore)}>{manualScore}%</Badge>
        <span className="text-xs text-muted-foreground">Claude routine score</span>
      </div>
    );
  }

  // Unscored reads as one self-describing pill carrying the keyword score that
  // stands in until the AI stage runs -- "Pending" over a separate "Keyword: N%"
  // caption was indistinguishable at a glance from a genuinely low AI score,
  // since both rendered as outlined pills (docs/decisions.md AD-56).
  if (aiScore === null) {
    return (
      <Badge variant="outline" className="font-normal text-muted-foreground">
        {pendingScoreLabel(keywordScore)}
      </Badge>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <Badge variant={scoreBadgeVariant(aiScore)}>{formatScore(aiScore)}</Badge>
      <span className="text-xs text-muted-foreground">AI score</span>
      {overallScoreReasons && overallScoreReasons.length > 0 && (
        <span
          className="block max-w-full truncate text-xs text-muted-foreground"
          title={`Ranking bonuses applied on top of the AI score: ${overallScoreReasons.join(", ")} -- see Settings → Ranking`}
        >
          + {overallScoreReasons.join(", ")}
        </span>
      )}
    </div>
  );
}

export function JobRow({
  job,
  statuses,
  showStatusDropdown,
  selected,
  onToggleSelect,
  expanded,
  onToggleExpand,
  tabIndex,
  onFocusRow,
  rowRef,
}: {
  job: JobWithScore;
  statuses: JobStatus[];
  /** Settings → Workflow toggle. False renders a read-only badge instead of the dropdown. */
  showStatusDropdown: boolean;
  selected: boolean;
  onToggleSelect: (jobId: string) => void;
  /** Detail row visibility. Owned by JobsTable so the `d` hotkey can reach it. */
  expanded: boolean;
  onToggleExpand: (jobId: string) => void;
  /** Roving tab index: 0 for the one row in the tab order, -1 for the rest. */
  tabIndex: number;
  onFocusRow: () => void;
  rowRef: (element: HTMLTableRowElement | null) => void;
}) {
  const router = useRouter();
  const notInterestedStatus = statuses.find(s => s.label === "Not Interested")?.id;
  const viewedStatus = statuses.find(s => s.label === "Viewed")?.id;
  const appliedStatus = statuses.find(s => s.label === "Applied")?.id;
  const archiveStatus = statuses.find(s => s.label === "Archived")?.id;

  // Optimistic status, same contract as JobStatusSelect: shows the new value
  // immediately (row color/badge/pressed-icon all update before the request
  // resolves) and reverts if the action fails, instead of leaving the click
  // looking like it did nothing until router.refresh() completes.
  const [optimisticStatusId, setOptimisticStatusId] = useState(job.statusId);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setOptimisticStatusId(job.statusId);
  }, [job.statusId]);

  const currentStatus = statuses.find(s => s.id === optimisticStatusId);

  function onAction(statusId: string | undefined) {
    if (!statusId) return;
    const previousStatusId = optimisticStatusId;
    setOptimisticStatusId(statusId);
    startTransition(async () => {
      const result = await setJobStatusAction([job.id], statusId);
      if (!result.ok) setOptimisticStatusId(previousStatusId);
      router.refresh();
    });
  }

  return (
    <>
      <TableRow ref={rowRef} tabIndex={tabIndex} onFocus={onFocusRow} className={FOCUS_CURSOR}>
        <TableCell className="w-8">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(job.id)}
            aria-label={`Select ${job.title}`}
            className="size-4 accent-primary"
          />
        </TableCell>
        <TableCell>
          <button
            type="button"
            onClick={() => onToggleExpand(job.id)}
            aria-expanded={expanded}
            title={job.title}
            className="flex w-full min-w-0 items-center gap-1 text-left font-medium hover:underline"
          >
            {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
            <span className="min-w-0 flex-1 truncate">{job.title}</span>
          </button>
        </TableCell>
        <TableCell>
          <span className="block truncate" title={job.companyName}>
            {job.companyName}
          </span>
        </TableCell>
        <TableCell className="hidden overflow-hidden md:table-cell">
          <div className="flex flex-wrap gap-1">
            {job.locationTags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
            {/* Only reachable with "Hide jobs I can't apply to" unticked, so the
                badge explains why the row is normally absent (AD-51). Sits
                inside the same flex-wrap as the location tags so it wraps with
                them rather than overflowing the cell (#82). */}
            {job.ineligibleReason && (
              <Badge variant="warning" title="You can't apply to this one -- shown because the eligibility filter is off">
                {INELIGIBLE_REASON_LABELS[job.ineligibleReason]}
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell className="hidden overflow-hidden md:table-cell">
          <Badge variant="secondary" className="max-w-full truncate" title={job.source}>
            {job.source}
          </Badge>
        </TableCell>
        <TableCell>
          {showStatusDropdown ? (
            <JobStatusSelect jobId={job.id} statusId={optimisticStatusId} statuses={statuses} />
          ) : (
            <StatusBadge status={currentStatus} />
          )}
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-0.5">
            <ScoreBadge
              source={job.source}
              aiScore={job.aiScore}
              manualScore={job.manualScore}
              keywordScore={job.keywordScore}
              overallScoreReasons={job.overallScoreReasons}
            />
            {job.minYears !== null && (
              <span className="text-xs text-muted-foreground">{job.minYears}+ yrs</span>
            )}
          </div>
        </TableCell>
        <TableCell className="min-w-60">
            <div className={cn("flex flex-wrap items-center gap-1", isPending && "opacity-60")}>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={isPending}
                className={cn(
                  "text-primary hover:text-primary",
                  optimisticStatusId === notInterestedStatus && "bg-accent text-foreground",
                )}
                onClick={() => onAction(notInterestedStatus)}
                aria-label={`Not interested in ${job.title}`}
                aria-pressed={optimisticStatusId === notInterestedStatus}
                title="Not interested"
              >
                <ThumbsDown className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={isPending}
                className={cn(
                  "text-primary hover:text-primary",
                  optimisticStatusId === viewedStatus && "bg-accent text-foreground",
                )}
                onClick={() => onAction(viewedStatus)}
                aria-label={`Mark ${job.title} as viewed`}
                aria-pressed={optimisticStatusId === viewedStatus}
                title="Mark viewed"
              >
                <Eye className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={isPending}
                className={cn(
                  "text-primary hover:text-primary",
                  optimisticStatusId === appliedStatus && "bg-accent text-foreground",
                )}
                onClick={() => onAction(appliedStatus)}
                aria-label={`Mark ${job.title} as applied`}
                aria-pressed={optimisticStatusId === appliedStatus}
                title="Mark applied"
              >
                <Check className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={isPending}
                className={cn(
                  "text-primary hover:text-primary",
                  optimisticStatusId === archiveStatus && "bg-accent text-foreground",
                )}
                onClick={() => onAction(archiveStatus)}
                aria-label={`Archive ${job.title}`}
                aria-pressed={optimisticStatusId === archiveStatus}
                title="Archive"
              >
                <Archive className="size-4" />
              </Button>
              <a
                href={job.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex size-8 items-center justify-center rounded-md text-primary transition-opacity hover:opacity-70"
                aria-label={`View ${job.title}`}
              >
                <ExternalLink className="size-4" />
              </a>
              <ApplicationDraftDialog jobId={job.id} jobTitle={job.title} />
            </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={COLUMN_COUNT} className="space-y-4 whitespace-normal p-4 text-sm">
            <div className="text-muted-foreground">
              {job.source === "claude_routine"
                ? job.manualStandout ?? "No standout notes from the Claude routine for this match."
                : job.aiReasoning ?? "AI review pending — keyword match score shown above."}
            </div>
            <div className="font-semibold">Company History</div>
            <CompanyHistoryPanel companyName={job.companyName} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
