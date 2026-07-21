"use client";

import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import type { JobStatus, JobWithScore } from "@/features/jobs/domain/types";
import { INELIGIBLE_REASON_LABELS } from "@/features/scoring/domain/classifyEligibility";
import { ApplicationDraftDialog } from "./ApplicationDraftDialog";
import { JobStatusSelect } from "./JobStatusSelect";

// Total column count, used for the expanded-reasoning row's colSpan:
// select, title, company, location, source, status, score, link.
const COLUMN_COUNT = 8;

function formatScore(score: number | null): string {
  return score === null ? "—" : `${Math.round(score * 100)}%`;
}

// AI score thresholds mirror scoring.md §3/§5: KEYWORD_THRESHOLD (0.25) and
// NOTIFY_THRESHOLD (0.75) define the meaningful bands for the AI score.
function ScoreBadge({
  aiScore,
  keywordScore,
  overallScoreReasons,
}: {
  aiScore: number | null;
  keywordScore: number | null;
  overallScoreReasons: string[] | null;
}) {
  if (aiScore === null) {
    return (
      <div className="flex flex-col gap-0.5">
        <Badge variant="outline">Pending</Badge>
        <span className="text-xs text-muted-foreground">Keyword: {formatScore(keywordScore)}</span>
      </div>
    );
  }

  const variant = aiScore >= 0.75 ? "success" : aiScore >= 0.4 ? "warning" : "outline";

  return (
    <div className="flex flex-col gap-0.5">
      <Badge variant={variant}>{formatScore(aiScore)}</Badge>
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
  selected,
  onToggleSelect,
}: {
  job: JobWithScore;
  statuses: JobStatus[];
  selected: boolean;
  onToggleSelect: (jobId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow>
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
            onClick={() => setOpen((value) => !value)}
            title={job.title}
            className="flex w-full min-w-0 items-center gap-1 text-left font-medium hover:underline"
          >
            {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
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
          <JobStatusSelect jobId={job.id} statusId={job.statusId} statuses={statuses} />
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-0.5">
            <ScoreBadge aiScore={job.aiScore} keywordScore={job.keywordScore} overallScoreReasons={job.overallScoreReasons} />
            {job.minYears !== null && (
              <span className="text-xs text-muted-foreground">{job.minYears}+ yrs</span>
            )}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center">
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
      {open && (
        <TableRow>
          <TableCell colSpan={COLUMN_COUNT} className="whitespace-normal text-sm text-muted-foreground">
            {job.aiReasoning ?? "AI review pending — keyword match score shown above."}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
