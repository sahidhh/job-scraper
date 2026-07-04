export const SOURCE_HEALTH_CONFIG = {
  disableAfterConsecutiveFailures: parseInt(
    process.env.SOURCE_DISABLE_THRESHOLD ?? "7",
    10,
  ),
  minimumHealthyCount: parseInt(
    process.env.MIN_HEALTHY_SOURCE_COUNT ?? "3",
    10,
  ),
  // scrape.ts runs on a ~2-hour cadence (architecture.md §11); a source with
  // no run at all in 3x that window has stopped running entirely, distinct
  // from "running but failing" -- e.g. removed from the workflow, a crashed
  // job that silently skipped a source, or a mis-registered JOB_SOURCES entry.
  staleAfterHours: parseInt(
    process.env.SOURCE_STALE_HOURS ?? "6",
    10,
  ),
} as const;
