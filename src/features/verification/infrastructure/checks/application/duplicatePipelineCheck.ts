import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";

/**
 * Operational check: is the cross-source dedup pipeline (design/erd.md
 * `jobs.fingerprint`) actually populated? An empty fingerprint means a row
 * predates the fingerprint migration and hasn't been backfilled
 * (design/limitations.md §1.7) -- distinct from data-quality.duplicate-
 * fingerprints, which measures true duplicate groups among populated rows.
 */
export function duplicatePipelineCheck(client: TypedSupabaseClient | null): Check {
  return {
    id: "app.duplicate-detection-pipeline",
    name: "Duplicate detection pipeline",
    category: "application",
    severity: "low",
    async run(): Promise<CheckOutcome> {
      if (!client) return { status: "warning", summary: "Skipped — Supabase client unavailable" };

      const { count, error } = await client
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("fingerprint", "");
      if (error) return { status: "fail", summary: `Query failed: ${error.message}` };

      if ((count ?? 0) > 0) {
        return {
          status: "warning",
          summary: `${count} active job(s) missing a fingerprint (pre-dedup rows)`,
          recommendation: "Run `npm run backfill:fingerprints`.",
        };
      }
      return { status: "pass", summary: "All active jobs have a fingerprint" };
    },
  };
}
