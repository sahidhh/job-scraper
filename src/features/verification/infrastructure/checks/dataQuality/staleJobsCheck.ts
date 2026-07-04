import { optionalEnv } from "@/shared/infrastructure/env";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";

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
      if (!client) return { status: "warning", summary: "Skipped — Supabase client unavailable" };

      const expirationDays = Number(optionalEnv("JOB_EXPIRATION_DAYS", "14"));
      const graceDays = expirationDays * GRACE_MULTIPLIER;
      const cutoff = new Date(Date.now() - graceDays * DAY_MS).toISOString();

      const { count, error } = await client
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .lt("last_seen_at", cutoff);
      if (error) return { status: "fail", summary: `Query failed: ${error.message}` };

      if ((count ?? 0) > 0) {
        return {
          status: "warning",
          summary: `${count} active job(s) last seen over ${graceDays} days ago — expected to have been swept inactive`,
          recommendation: "Verify scrape.ts's markExpiredJobs sweep is running (design/architecture.md §4).",
        };
      }
      return { status: "pass", summary: "No stale active jobs beyond the expiration grace window" };
    },
  };
}
