import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";
import { SKIPPED_NO_SUPABASE_CLIENT } from "../skipOutcomes";

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
      if (!client) return SKIPPED_NO_SUPABASE_CLIENT;

      const { count, error } = await client
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("fingerprint", "");
      if (error) {
        return {
          status: "fail",
          summary: `Query failed: ${error.message}`,
          probableCause: "The `jobs` table is unreachable or the `fingerprint` column is missing.",
          suggestedFix: "Check the Supabase connectivity and migrations checks above.",
          affectedSubsystem: "Duplicate detection",
        };
      }

      if ((count ?? 0) > 0) {
        return {
          status: "warning",
          summary: `${count} active job(s) missing a fingerprint (pre-dedup rows)`,
          probableCause: "These rows were inserted before cross-source dedup (AD-16) shipped and have never been backfilled.",
          suggestedFix: "Run `npm run backfill:fingerprints` once.",
          affectedSubsystem: "Duplicate detection",
          docReference: "design/limitations.md §1.7",
        };
      }
      return { status: "pass", summary: "All active jobs have a fingerprint" };
    },
  };
}
