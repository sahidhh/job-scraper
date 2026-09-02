export const SOURCE_HEALTH_CONFIG = {
  disableAfterConsecutiveFailures: parseInt(
    process.env.SOURCE_DISABLE_THRESHOLD ?? "7",
    10,
  ),
  minimumHealthyCount: parseInt(
    process.env.MIN_HEALTHY_SOURCE_COUNT ?? "3",
    10,
  ),
  // scrape.ts runs twice daily, 06:00/14:00 UTC (scrape.yml, AD-70); a source
  // with no run at all in 3x that 12h cadence has stopped running entirely,
  // distinct from "running but failing" -- e.g. removed from the workflow, a
  // crashed job that silently skipped a source, or a mis-registered
  // JOB_SOURCES entry. This default MUST be re-derived whenever the cron
  // cadence changes: at the old 6-hourly cadence it was 6h, and leaving it
  // there after the cadence halved would have marked every source stale
  // between two healthy runs.
  staleAfterHours: parseInt(
    process.env.SOURCE_STALE_HOURS ?? "36",
    10,
  ),
} as const;
