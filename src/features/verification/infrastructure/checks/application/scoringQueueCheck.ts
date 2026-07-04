import type { ScoringQueueSummary } from "@/features/scoring/application/computeScoringQueueSummary";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";

/** Wraps the existing getScoringQueueReport() output (Phase 1 Task 6). */
export function createScoringQueueCheck(getQueue: () => Promise<ScoringQueueSummary | null>): Check {
  return {
    id: "app.scoring-queue",
    name: "Pending scoring queue",
    category: "application",
    severity: "medium",
    async run(): Promise<CheckOutcome> {
      const queue = await getQueue();
      if (!queue) return { status: "warning", summary: "Skipped — no active resume and/or role selection" };

      const details = [
        `awaiting=${queue.awaitingAiCount}`,
        `oldestPendingAgeHours=${queue.oldestPendingAgeHours?.toFixed(1) ?? "n/a"}`,
        `stuck=${queue.stuckJobs.length}`,
        `maxRetryCount=${queue.maxRetryCount}`,
      ];

      if (queue.stuckJobs.length > 0) {
        return {
          status: "warning",
          summary: `${queue.stuckJobs.length} job(s) stuck awaiting AI scoring`,
          details,
          recommendation: "Investigate stuck jobs — see docs/scoring.md and job_scores.retry_count.",
        };
      }
      return { status: "pass", summary: `${queue.awaitingAiCount} job(s) awaiting AI score, none stuck`, details };
    },
  };
}
