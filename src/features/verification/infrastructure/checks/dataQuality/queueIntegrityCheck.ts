import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";

// Beyond this many retries with no ai_score, a job is effectively
// permanently failing (AD-14 retries indefinitely, so this never
// self-resolves without intervention) rather than merely "stuck" on
// getScoringQueueReport's age-based definition.
const HIGH_RETRY_THRESHOLD = 20;

export function queueIntegrityCheck(client: TypedSupabaseClient | null): Check {
  return {
    id: "data-quality.queue-integrity",
    name: "Scoring queue integrity",
    category: "data-quality",
    severity: "low",
    async run(): Promise<CheckOutcome> {
      if (!client) return { status: "warning", summary: "Skipped — Supabase client unavailable" };

      const { count, error } = await client
        .from("job_scores")
        .select("id", { count: "exact", head: true })
        .gte("retry_count", HIGH_RETRY_THRESHOLD)
        .is("ai_score", null);
      if (error) return { status: "fail", summary: `Query failed: ${error.message}` };

      if ((count ?? 0) > 0) {
        return {
          status: "warning",
          summary: `${count} job_scores row(s) with retry_count >= ${HIGH_RETRY_THRESHOLD} and still no ai_score`,
          recommendation: "These jobs are permanently failing AI scoring (AD-14 retries indefinitely) — investigate OpenRouter errors for the affected postings.",
        };
      }
      return { status: "pass", summary: `No job_scores rows stuck above ${HIGH_RETRY_THRESHOLD} retries` };
    },
  };
}
