import type { ScoringQueueSummary } from "@/features/scoring/application/computeScoringQueueSummary";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";

/**
 * Wraps the existing getScoringQueueReport() output (Phase 1 Task 6).
 * `getQueue` resolves to null either because no Supabase client is
 * available or because there's no active resume/role selection yet --
 * both are benign "nothing to report" states, not new findings, so this
 * is always a low-severity skip rather than a fail.
 */
export function createScoringQueueCheck(getQueue: () => Promise<ScoringQueueSummary | null>): Check {
  return {
    id: "app.scoring-queue",
    name: "Pending scoring queue",
    category: "application",
    severity: "medium",
    async run(): Promise<CheckOutcome> {
      const queue = await getQueue();
      if (!queue) {
        return {
          status: "warning",
          summary: "Skipped — Supabase client unavailable, or no active resume/role selection",
          suggestedFix: "See the \"Environment variables\" check, or set an active resume and role selection.",
          affectedSubsystem: "Scoring pipeline",
          severityOverride: "low",
        };
      }

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
          probableCause: "OpenRouter calls have been failing repeatedly for these jobs (outage, invalid key, or rate limiting), or KEYWORD_THRESHOLD is gating them out before they can be scored.",
          suggestedFix: "Check OpenRouter status and OPENROUTER_API_KEY; retries happen automatically on the next `score.ts` run (AD-14), no manual re-trigger needed once the root cause is fixed.",
          affectedSubsystem: "Scoring pipeline",
          docReference: "docs/scoring.md",
        };
      }
      return { status: "pass", summary: `${queue.awaitingAiCount} job(s) awaiting AI score, none stuck`, details };
    },
  };
}
