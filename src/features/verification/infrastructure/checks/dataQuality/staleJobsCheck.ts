import { optionalEnv } from "@/shared/infrastructure/env";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";
import { SKIPPED_NO_SUPABASE_CLIENT } from "../skipOutcomes";

const DAY_MS = 24 * 60 * 60 * 1000;
// 2x JOB_EXPIRATION_DAYS as a grace window before flagging -- a job right
// at the boundary is expected to still be active until the next sweep
// runs; this only fires when the sweep itself looks stuck.
const GRACE_MULTIPLIER = 2;

export function staleJobsCheck(client: TypedSupabaseClient | null): Check {
  return {
    id: "data-quality.stale-jobs",
    name: "Stale jobs not yet expired",
    category: "data-quality",
    severity: "low",
    async run(): Promise<CheckOutcome> {
      if (!client) return SKIPPED_NO_SUPABASE_CLIENT;

      const expirationDays = Number(optionalEnv("JOB_EXPIRATION_DAYS", "14"));
      const graceDays = expirationDays * GRACE_MULTIPLIER;
      const cutoff = new Date(Date.now() - graceDays * DAY_MS).toISOString();

      const { count, error } = await client
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .lt("last_seen_at", cutoff);
      if (error) {
        return {
          status: "fail",
          summary: `Query failed: ${error.message}`,
          affectedSubsystem: "Job expiration sweep",
        };
      }

      if ((count ?? 0) > 0) {
        return {
          status: "warning",
          summary: `${count} active job(s) last seen over ${graceDays} days ago — expected to have been swept inactive`,
          probableCause: "scrape.ts's markExpiredJobs sweep hasn't run recently (the cron pipeline may be stalled) or JOB_EXPIRATION_DAYS was changed after these jobs aged past the old threshold.",
          suggestedFix: "Check the scrape.yml Actions history for recent runs; verify markExpiredJobs executes on every scrape.ts run.",
          affectedSubsystem: "Job expiration sweep",
          docReference: "design/architecture.md §4",
        };
      }
      return { status: "pass", summary: "No stale active jobs beyond the expiration grace window" };
    },
  };
}
