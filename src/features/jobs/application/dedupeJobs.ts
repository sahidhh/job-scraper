import type { NormalizedJob } from "@/features/jobs/domain/types";

/**
 * Collapses jobs with the same (source, sourceJobId) to one entry,
 * keeping the data from the LAST occurrence (most recently scraped
 * within this run) while preserving the position of the FIRST
 * occurrence -- deterministic ordering for upsertMany batching.
 */
export function dedupeJobs(jobs: readonly NormalizedJob[]): NormalizedJob[] {
  const byKey = new Map<string, NormalizedJob>();

  for (const job of jobs) {
    byKey.set(dedupeKey(job), job);
  }

  return Array.from(byKey.values());
}

function dedupeKey(job: NormalizedJob): string {
  return `${job.source}:${job.sourceJobId}`;
}
