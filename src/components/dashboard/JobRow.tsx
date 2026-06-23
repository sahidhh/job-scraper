"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import type { JobWithScore } from "@/features/jobs/domain/types";

function formatScore(score: number | null): string {
  return score === null ? "—" : `${Math.round(score * 100)}%`;
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
        <TableCell className="space-x-1">
          {job.locationTags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </TableCell>
        <TableCell>
          <Badge variant="secondary">{job.source}</Badge>
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-0.5">
            <span>{formatScore(job.aiScore ?? job.keywordScore)}</span>
            {job.minYears !== null && (
              <span className="text-xs text-muted-foreground">{job.minYears}+ yrs</span>
            )}
          </div>
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
            {job.aiReasoning ?? "No AI reasoning available yet."}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
