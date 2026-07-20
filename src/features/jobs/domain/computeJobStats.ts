import type { JobStats, JobWithScore } from "./types";

type StatsRow = Pick<JobWithScore, "keywordScore" | "aiScore" | "ineligibleReason" | "retryCount">;

/**
 * Partitions a filtered dashboard result set into the five scoring buckets
 * the stats row reports (AD-50, AD-51). Pure and page-independent: callers
 * pass the whole matched set, not the visible slice, so the numbers don't
 * drift as the user pages.
 *
 * The distinctions that matter are between the one bucket that still costs
 * money and the three that don't. `awaitingAiCount` is the real retry queue --
 * score.ts picks these up again and pays for another API call each time.
 * `lowMatchCount` (skipped at the keyword gate), `abandonedCount` (retry cap
 * reached) and `ineligibleCount` (hard-excluded) are all terminal. All four
 * store ai_score = null, and conflating them is what made the dashboard claim
 * 258 jobs were "awaiting AI review" indefinitely.
 */
export function computeJobStats(
  rows: readonly StatsRow[],
  keywordThreshold: number,
  maxAiRetries: number,
): JobStats {
  let scoredCount = 0;
  let awaitingAiCount = 0;
  let abandonedCount = 0;
  let lowMatchCount = 0;
  let ineligibleCount = 0;

  for (const row of rows) {
    if (row.aiScore !== null) {
      scoredCount += 1;
    } else if (row.ineligibleReason !== null || row.keywordScore === null) {
      // Hard-excluded, or no job_scores row at all for this (role, resume).
      ineligibleCount += 1;
    } else if (row.keywordScore < keywordThreshold) {
      lowMatchCount += 1;
    } else if ((row.retryCount ?? 0) >= maxAiRetries) {
      abandonedCount += 1;
    } else {
      awaitingAiCount += 1;
    }
  }

  return { scoredCount, awaitingAiCount, abandonedCount, lowMatchCount, ineligibleCount, total: rows.length };
}
