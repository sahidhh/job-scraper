"use client";

import { Archive, Check, ChevronDown, ChevronRight, Eye, ExternalLink, ThumbsDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setJobStatusAction } from "@/features/jobs/actions";
import type { JobStatus, JobWithScore } from "@/features/jobs/domain/types";
import { ApplicationDraftDialog } from "./ApplicationDraftDialog";
import { JobStatusSheet } from "./JobStatusSheet";
import { StatusBadge } from "./StatusBadge";
import { formatScore, manualScoreBadgeVariant, pendingScoreLabel, scoreBadgeVariant } from "./jobScore";

function ScorePill({
  source,
  aiScore,
  manualScore,
  keywordScore,
}: {
  source: JobWithScore["source"];
  aiScore: number | null;
  manualScore: number | null;
  keywordScore: number | null;
}) {
  // claude_routine rows never enter the AI queue (AD-67) -- manual_score is
  // the truth for them, not "Pending".
  if (source === "claude_routine") {
    return manualScore === null ? (
      <Badge variant="outline" className="text-xs font-normal text-muted-foreground">—</Badge>
    ) : (
      <Badge variant={manualScoreBadgeVariant(manualScore)}>{manualScore}%</Badge>
    );
  }
  // Unscored reads as one self-describing pill carrying the keyword score that
  // stands in until the AI stage runs -- "Pending" alone was indistinguishable
  // at a glance from a genuinely low AI score (docs/decisions.md AD-56).
  if (aiScore === null) {
    return (
      <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
        {pendingScoreLabel(keywordScore)}
      </Badge>
    );
  }
  return <Badge variant={scoreBadgeVariant(aiScore)}>{formatScore(aiScore)}</Badge>;
}

export function JobCard({
  job,
  statuses,
  showStatusDropdown,
  selected,
  onToggleSelect,
}: {
  job: JobWithScore;
  statuses: JobStatus[];
  /** Settings → Workflow toggle. False renders a read-only badge instead of the sheet. */
  showStatusDropdown: boolean;
  selected: boolean;
  onToggleSelect: (jobId: string) => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const notInterestedStatus = statuses.find((s) => s.label === "Not Interested")?.id;
  const viewedStatus = statuses.find((s) => s.label === "Viewed")?.id;
  const appliedStatus = statuses.find((s) => s.label === "Applied")?.id;
  const archiveStatus = statuses.find((s) => s.label === "Archived")?.id;
  const currentStatus = statuses.find((s) => s.id === job.statusId);

  const onAction = async (statusId: string | undefined) => {
    if (!statusId) return;
    await setJobStatusAction([job.id], statusId);
    router.refresh();
  };

  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border bg-card transition-colors",
        selected ? "border-primary/40 bg-primary/5" : "border-border",
      )}
    >
      {/* The checkbox is a sibling of the expand button, never a descendant of
          it: a control nested inside a button is invalid HTML and screen
          readers fold it into the button's accessible name. */}
      <div className="flex items-start gap-1 p-4">
        <label className="-my-1.5 -ml-2.5 flex size-11 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(job.id)}
            aria-label={`Select ${job.title}`}
            className="size-4 accent-primary"
          />
        </label>

        <button
          type="button"
          className="min-w-0 flex-1 space-y-1 text-left"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 font-semibold leading-snug">{job.title}</p>
            <div className="flex shrink-0 items-center gap-1.5">
              <ScorePill
                source={job.source}
                aiScore={job.aiScore}
                manualScore={job.manualScore}
                keywordScore={job.keywordScore}
              />
              {expanded
                ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              }
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{job.companyName}</span>
            {job.minYears !== null && (
              <span className="text-xs text-muted-foreground">{job.minYears}+ yrs</span>
            )}
          </div>

          {(job.locationTags.length > 0 || job.source) && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {job.locationTags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-[11px]">{tag}</Badge>
              ))}
              <Badge variant="secondary" className="text-[11px]">{job.source}</Badge>
            </div>
          )}
        </button>
      </div>

      {/* Expanded AI reasoning */}
      {expanded && (
        <div className="border-t px-4 py-3 space-y-1">
          <p className="text-sm text-muted-foreground">
            {job.source === "claude_routine"
              ? job.manualStandout ?? "No standout notes from the Claude routine for this match."
              : job.aiReasoning ?? `AI review pending — keyword match: ${formatScore(job.keywordScore)}`}
          </p>
          {job.overallScoreReasons && job.overallScoreReasons.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Ranking bonus: {job.overallScoreReasons.join(", ")}
            </p>
          )}
        </div>
      )}

      {/* Bottom bar: status + quick actions + view link */}
      <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-2.5">
        {showStatusDropdown ? (
          <JobStatusSheet jobId={job.id} statusId={job.statusId} statuses={statuses} />
        ) : (
          <StatusBadge status={currentStatus} />
        )}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-11 text-primary hover:text-primary"
            onClick={() => onAction(notInterestedStatus)}
            aria-label={`Not interested in ${job.title}`}
            title="Not interested"
          >
            <ThumbsDown className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 text-primary hover:text-primary"
            onClick={() => onAction(viewedStatus)}
            aria-label={`Mark ${job.title} as viewed`}
            title="Mark viewed"
          >
            <Eye className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 text-primary hover:text-primary"
            onClick={() => onAction(appliedStatus)}
            aria-label={`Mark ${job.title} as applied`}
            title="Mark applied"
          >
            <Check className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 text-primary hover:text-primary"
            onClick={() => onAction(archiveStatus)}
            aria-label={`Archive ${job.title}`}
            title="Archive"
          >
            <Archive className="size-4" />
          </Button>
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              // 44px minimum tap target on mobile; this card only renders there.
              "size-11 text-primary hover:text-primary",
            )}
            aria-label={`View ${job.title}`}
          >
            <ExternalLink className="size-4" />
          </a>
          <ApplicationDraftDialog jobId={job.id} jobTitle={job.title} />
        </div>
      </div>
    </article>
  );
}
