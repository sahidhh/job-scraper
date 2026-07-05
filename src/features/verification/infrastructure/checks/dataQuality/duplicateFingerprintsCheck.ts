import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";
import { SKIPPED_NO_SUPABASE_CLIENT } from "../skipOutcomes";

/**
 * Data-quality metric: how many active jobs share a fingerprint that
 * should have routed later arrivals into `job_duplicates` instead
 * (design/erd.md) -- distinct from app.duplicate-detection-pipeline, which
 * only checks that fingerprints are populated at all.
 */
export function duplicateFingerprintsCheck(client: TypedSupabaseClient | null): Check {
  return {
    id: "data-quality.duplicate-fingerprints",
    name: "Duplicate fingerprints",
    category: "data-quality",
    severity: "medium",
    async run(): Promise<CheckOutcome> {
      if (!client) return SKIPPED_NO_SUPABASE_CLIENT;

      const { data, error } = await client.from("jobs").select("fingerprint").eq("is_active", true).neq("fingerprint", "");
      if (error) {
        return {
          status: "fail",
          summary: `Query failed: ${error.message}`,
          affectedSubsystem: "Duplicate detection",
        };
      }

      const counts = new Map<string, number>();
      for (const row of data ?? []) counts.set(row.fingerprint, (counts.get(row.fingerprint) ?? 0) + 1);
      const duplicateGroupSizes = [...counts.values()].filter((n) => n > 1);
      const excessRows = duplicateGroupSizes.reduce((sum, n) => sum + (n - 1), 0);

      if (duplicateGroupSizes.length > 0) {
        return {
          status: "warning",
          summary: `${duplicateGroupSizes.length} fingerprint group(s) with ${excessRows} likely-duplicate active job row(s)`,
          probableCause: "Two jobs computed the same fingerprint but were inserted in the same scrape batch, or fingerprint normalization changed after some rows were already written (design/limitations.md §1.7).",
          suggestedFix: "Spot-check the affected fingerprints; if it's a within-batch collision it's a known, accepted limitation, not a bug to force-fix per row.",
          affectedSubsystem: "Duplicate detection",
          docReference: "design/limitations.md §1.7",
        };
      }
      return { status: "pass", summary: "No duplicate fingerprints among active jobs" };
    },
  };
}
