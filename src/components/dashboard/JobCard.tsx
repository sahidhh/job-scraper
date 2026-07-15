"use client";

import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { JobStatus, JobWithScore } from "@/features/jobs/domain/types";
import { ApplicationDraftDialog } from "./ApplicationDraftDialog";
import { JobStatusSheet } from "./JobStatusSheet";

function formatScore(score: number | null): string {
  return score === null ? "—" : `${Math.round(score * 100)}%`;
}

function ScorePill({ aiScore, keywordScore }: { aiScore: number | null; keywordScore: number | null }) {
  if (aiScore === null) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <Badge variant="outline" className="text-xs">Pending</Badge>
        {keywordScore !== null && (
          <span className="text-[10px] text-muted-foreground">{formatScore(keywordScore)} kw</span>
        )}
      </div>
    );
  }
  const variant = aiScore >= 0.75 ? "success" : aiScore >= 0.4 ? "warning" : "outline";
  return <Badge variant={variant}>{formatScore(aiScore)}</Badge>;
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
      {/* Tappable main area */}
      <button
        type="button"
        className="w-full p-4 text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelect(job.id);
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${job.title}`}
            className="mt-1 size-4 shrink-0 accent-primary"
          />

          {/* Title + meta */}
          <div className="min-w-0 flex-1 space-y-1">
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
          </div>
        </div>
      </button>

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
            onClick={(e) => e.stopPropagation()}
            className="inline-flex size-11 items-center justify-center rounded-md text-primary transition-opacity hover:opacity-70"
            aria-label={`View ${job.title}`}
          >
            <ExternalLink className="size-4" />
            <span className="sr-only">View job</span>
          </a>
          <div onClick={(e) => e.stopPropagation()}>
            <ApplicationDraftDialog jobId={job.id} jobTitle={job.title} />
          </div>
        </div>
      </div>
    </article>
  );
}
