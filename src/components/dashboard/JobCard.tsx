"use client";

import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { JobStatus, JobWithScore } from "@/features/jobs/domain/types";
import { ApplicationDraftDialog } from "./ApplicationDraftDialog";
import { JobStatusSheet } from "./JobStatusSheet";
import { formatScore, pendingScoreLabel, scoreBadgeVariant } from "./jobScore";

function ScorePill({ aiScore, keywordScore }: { aiScore: number | null; keywordScore: number | null }) {
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
  selected,
  onToggleSelect,
}: {
  job: JobWithScore;
  statuses: JobStatus[];
  selected: boolean;
  onToggleSelect: (jobId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

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
              <ScorePill aiScore={job.aiScore} keywordScore={job.keywordScore} />
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
            {job.aiReasoning ?? `AI review pending — keyword match: ${formatScore(job.keywordScore)}`}
          </p>
          {job.overallScoreReasons && job.overallScoreReasons.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Ranking bonus: {job.overallScoreReasons.join(", ")}
            </p>
          )}
        </div>
      )}

      {/* Bottom bar: status + view link */}
      <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-2.5">
        <JobStatusSheet jobId={job.id} statusId={job.statusId} statuses={statuses} />
        <div className="flex items-center gap-1">
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
