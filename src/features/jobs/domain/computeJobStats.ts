import { isAboveShrug } from "@/features/scoring/domain/scoreBands";
import type { JobStats, JobWithScore } from "./types";

type StatsRow = Pick<
  JobWithScore,
  "keywordScore" | "aiScore" | "ineligibleReason" | "retryCount" | "manualScore"
>;

/**
 * The score a row is actually ranked and judged by, on the 0-1 AI scale.
 * `claude_routine` rows never get a job_scores row (AD-67) and carry a 0-100
 * `manual_score` instead, so they normalise onto the same scale -- the same
 * thing `manualScoreBadgeVariant` does for the badge. Exported because the
 * dashboard repository applies the weak-match cut with it and must agree with
 * the count reported here, row for row.
 */
export function judgedScore(row: Pick<StatsRow, "aiScore" | "manualScore">): number | null {
  if (row.aiScore !== null) return row.aiScore;
  return row.manualScore === null ? null : row.manualScore / 100;
}

/**
 * Partitions a filtered dashboard result set into the five scoring buckets
 * the stats row reports (AD-51, AD-52). Pure and page-independent: callers
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
  let weakMatchCount = 0;
  let awaitingAiCount = 0;
  let abandonedCount = 0;
  let lowMatchCount = 0;
  let ineligibleCount = 0;

  for (const row of rows) {
    // Counted independently of the partition below: a weak match is a subset
    // of `scoredCount`, not a sixth bucket. `claude_routine` rows have a null
    // aiScore but a real manual_score, so they reach this and skip the
    // ai-null partition entirely via judgedScore.
    if (!isAboveShrug(judgedScore(row))) {
      weakMatchCount += 1;
    }

    if (row.aiScore !== null) {
      scoredCount += 1;
    } else if (row.manualScore !== null) {
      // claude_routine: judged, just not by the AI pipeline (AD-67).
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

  return {
    scoredCount,
    weakMatchCount,
    awaitingAiCount,
    abandonedCount,
    lowMatchCount,
    ineligibleCount,
    total: rows.length,
  };
}
