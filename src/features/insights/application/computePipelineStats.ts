import type { ScrapeRunStatRow } from "@/features/insights/domain/MatchedJobsRepository";
import type { PipelineStats } from "@/features/insights/domain/types";

/**
 * Pipeline-level reliability stats across every scrape_runs row, any status
 * (Phase 4 Task 13) -- complements the success-only jobs-over-time/by-source
 * charts, which would otherwise hide failures/duplicates entirely.
 */
export function computePipelineStats(rows: readonly ScrapeRunStatRow[]): PipelineStats {
  const totalRuns = rows.length;
  const failedRuns = rows.filter((row) => row.status === "failed").length;
  const totalDuplicates = rows.reduce((sum, row) => sum + (row.duplicateCount ?? 0), 0);

  const durations = rows.map((row) => row.durationMs).filter((ms): ms is number => ms !== null);
  const avgDurationMs = durations.length === 0 ? null : durations.reduce((a, b) => a + b, 0) / durations.length;

  return { totalRuns, failedRuns, totalDuplicates, avgDurationMs };
}
