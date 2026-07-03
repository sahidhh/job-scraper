import type { AwaitingScoreJob } from "@/features/scoring/domain/types";

export interface ScoringQueueSummary {
  /** Total job_scores rows awaiting an ai_score (keyword gate passed, AI not yet succeeded). */
  awaitingAiCount: number;
  /** scoredAt of the longest-waiting job, or null if the queue is empty. */
  oldestPendingScoredAt: string | null;
  oldestPendingAgeHours: number | null;
  /** Jobs waiting longer than the configured stuck threshold, oldest first. */
  stuckJobs: AwaitingScoreJob[];
  maxRetryCount: number;
  avgRetryCount: number;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Aggregates the AI-scoring retry queue into operator-facing metrics
 * (Phase 1 Task 6). `awaiting` must be jobs with keyword_score >= gate and
 * ai_score IS NULL (ScoreRepository.findAwaitingAi output) -- order doesn't
 * matter, this sorts defensively by scoredAt ascending.
 */
export function computeScoringQueueSummary(
  awaiting: readonly AwaitingScoreJob[],
  stuckThresholdHours: number,
  now: Date = new Date(),
): ScoringQueueSummary {
  const sorted = [...awaiting].sort((a, b) => new Date(a.scoredAt).getTime() - new Date(b.scoredAt).getTime());

  if (sorted.length === 0) {
    return {
      awaitingAiCount: 0,
      oldestPendingScoredAt: null,
      oldestPendingAgeHours: null,
      stuckJobs: [],
      maxRetryCount: 0,
      avgRetryCount: 0,
    };
  }

  const oldest = sorted[0]!;
  const oldestPendingAgeHours = (now.getTime() - new Date(oldest.scoredAt).getTime()) / HOUR_MS;

  const stuckJobs = sorted.filter((job) => (now.getTime() - new Date(job.scoredAt).getTime()) / HOUR_MS >= stuckThresholdHours);

  const retryCounts = sorted.map((job) => job.retryCount);
  const maxRetryCount = Math.max(...retryCounts);
  const avgRetryCount = retryCounts.reduce((sum, n) => sum + n, 0) / retryCounts.length;

  return {
    awaitingAiCount: sorted.length,
    oldestPendingScoredAt: oldest.scoredAt,
    oldestPendingAgeHours,
    stuckJobs,
    maxRetryCount,
    avgRetryCount,
  };
}
