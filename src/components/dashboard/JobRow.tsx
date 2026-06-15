"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import type { JobWithScore } from "@/features/jobs/domain/types";

function formatScore(score: number | null): string {
  return score === null ? "—" : `${Math.round(score * 100)}%`;
}

// AI score thresholds mirror scoring.md §3/§5: KEYWORD_THRESHOLD (0.25) and
// NOTIFY_THRESHOLD (0.75) define the meaningful bands for the AI score.
function ScoreBadge({ aiScore, keywordScore }: { aiScore: number | null; keywordScore: number | null }) {
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
    </div>
  );
}

export function JobRow({ job }: { job: JobWithScore }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow>
        <TableCell className="max-w-xs">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="flex items-center gap-1 text-left font-medium hover:underline"
          >
            {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
            <span className="truncate">{job.title}</span>
          </button>
        </TableCell>
        <TableCell>{job.companyName}</TableCell>
        <TableCell className="hidden space-x-1 md:table-cell">
          {job.locationTags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </TableCell>
        <TableCell className="hidden md:table-cell">
          <Badge variant="secondary">{job.source}</Badge>
        </TableCell>
        <TableCell>
          <ScoreBadge aiScore={job.aiScore} keywordScore={job.keywordScore} />
        </TableCell>
        <TableCell>
          <a href={job.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
            View
          </a>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={6} className="whitespace-normal text-sm text-muted-foreground">
            {job.aiReasoning ?? "AI review pending — keyword match score shown above."}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
