import type { JobSource } from "@/shared/domain/enums";
import type { FailureCategory } from "@/features/sources/domain/classifyScrapeFailure";
import { SOURCE_HEALTH_CONFIG } from "@/features/sources/domain/sourceHealthConfig";
import type { ScrapeRun } from "@/features/sources/domain/types";

export interface SourceHealthSummary {
  source: JobSource;
  totalRuns: number;
  successCount: number;
  failureCount: number;
  /** 0 when totalRuns is 0. */
  successRate: number;
  /** Average duration_ms across runs that recorded one; null if none did. */
  avgLatencyMs: number | null;
  /** Consecutive most-recent runs with status='failed'. Resets to 0 on any success. */
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastRunStatus: ScrapeRun["status"] | null;
  /** True when the most recent run succeeded immediately after >=1 failed runs. */
  recoveryDetected: boolean;
  /** Most frequent non-null failure_category across failed/empty_feed runs in the window. */
  topFailureCategory: FailureCategory | null;
  /** Hours since the most recent run of any status; null if the source has never run. */
  hoursSinceLastRun: number | null;
  /** True when hoursSinceLastRun exceeds SOURCE_HEALTH_CONFIG.staleAfterHours -- the
   * source has stopped running entirely, as opposed to running and failing. */
  isStale: boolean;
  /** Deterministic, rule-based operator guidance -- no AI (Phase 1 Task 7). */
  recommendation: string;
}

/**
 * Aggregates a source's recent scrape_runs into a health summary (Phase 1
 * Task 5/7). Works for every source, including feed-based ones with no
 * `companies` row (wellfound/remoteok/mycareersfuture), unlike the
 * `companies.health_status` tracking which only covers board-token sources.
 *
 * `runs` does not need to be pre-sorted -- this defensively sorts by runAt
 * descending so the result is correct regardless of repository ordering.
 */
const HOUR_MS = 60 * 60 * 1000;

export function computeSourceHealthSummary(
  source: JobSource,
  runs: readonly ScrapeRun[],
  now: Date = new Date(),
): SourceHealthSummary {
  const sorted = [...runs].sort((a, b) => new Date(b.runAt).getTime() - new Date(a.runAt).getTime());

  const totalRuns = sorted.length;
  const successCount = sorted.filter((r) => r.status === "success").length;
  const failureCount = sorted.filter((r) => r.status === "failed").length;
  const successRate = totalRuns === 0 ? 0 : successCount / totalRuns;

  const latencies = sorted.map((r) => r.durationMs).filter((ms): ms is number => ms !== null);
  const avgLatencyMs = latencies.length === 0 ? null : Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);

  const lastSuccessAt = sorted.find((r) => r.status === "success")?.runAt ?? null;
  const lastFailureAt = sorted.find((r) => r.status === "failed")?.runAt ?? null;
  const lastRunStatus = sorted[0]?.status ?? null;

  let consecutiveFailures = 0;
  for (const run of sorted) {
    if (run.status !== "failed") break;
    consecutiveFailures += 1;
  }

  // The run immediately before the latest one was a failure, and the latest
  // one succeeded -- a just-happened failing-to-healthy transition.
  const recoveryDetected = lastRunStatus === "success" && sorted[1]?.status === "failed";

  const categoryCounts = new Map<FailureCategory, number>();
  for (const run of sorted) {
    if (!run.failureCategory) continue;
    categoryCounts.set(run.failureCategory, (categoryCounts.get(run.failureCategory) ?? 0) + 1);
  }
  let topFailureCategory: FailureCategory | null = null;
  let topCount = 0;
  for (const [category, count] of categoryCounts) {
    if (count > topCount) {
      topFailureCategory = category;
      topCount = count;
    }
  }

  const hoursSinceLastRun = sorted[0] ? (now.getTime() - new Date(sorted[0].runAt).getTime()) / HOUR_MS : null;
  const isStale = hoursSinceLastRun !== null && hoursSinceLastRun >= SOURCE_HEALTH_CONFIG.staleAfterHours;

  const recommendation = buildRecommendation({
    totalRuns,
    consecutiveFailures,
    lastRunStatus,
    topFailureCategory,
    hoursSinceLastRun,
    isStale,
  });

  return {
    source,
    totalRuns,
    successCount,
    failureCount,
    successRate,
    avgLatencyMs,
    consecutiveFailures,
    lastSuccessAt,
    lastFailureAt,
    lastRunStatus,
    recoveryDetected,
    topFailureCategory,
    hoursSinceLastRun,
    isStale,
    recommendation,
  };
}

function buildRecommendation(input: {
  totalRuns: number;
  consecutiveFailures: number;
  lastRunStatus: ScrapeRun["status"] | null;
  topFailureCategory: FailureCategory | null;
  hoursSinceLastRun: number | null;
  isStale: boolean;
}): string {
  const { totalRuns, consecutiveFailures, lastRunStatus, topFailureCategory, hoursSinceLastRun, isStale } = input;
  const threshold = SOURCE_HEALTH_CONFIG.disableAfterConsecutiveFailures;

  if (totalRuns === 0) return "No scrape history yet.";

  // Staleness (hasn't run at all) is a distinct, more urgent signal than a
  // healthy or failing-but-still-running source -- surface it first.
  if (isStale && hoursSinceLastRun !== null) {
    return `Stale -- no run in ${Math.round(hoursSinceLastRun)}h (expected every ~2h). Check the scrape workflow is still including this source.`;
  }

  if (consecutiveFailures === 0) {
    if (lastRunStatus === "success" && topFailureCategory === "empty_feed") {
      return "Recovering, but recent runs included empty-feed results -- confirm the board/feed still returns postings.";
    }
    return "Healthy.";
  }

  const categoryText = topFailureCategory ? ` (${topFailureCategory})` : "";

  if (consecutiveFailures >= threshold) {
    return `Failing${categoryText} for ${consecutiveFailures} consecutive runs -- at or past the ${threshold}-failure disable threshold. Investigate before re-enabling.`;
  }

  return `Failing${categoryText} for ${consecutiveFailures} consecutive run(s) -- ${threshold - consecutiveFailures} more before auto-disable.`;
}
