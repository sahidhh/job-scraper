import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";

const REQUIRED_FIELDS = ["title", "url", "company_name", "source_job_id"] as const;

export function missingRequiredFieldsCheck(client: TypedSupabaseClient | null): Check {
  return {
    id: "data-quality.missing-required-fields",
    name: "Missing required fields",
    category: "data-quality",
    severity: "high",
    async run(): Promise<CheckOutcome> {
      if (!client) return { status: "warning", summary: "Skipped — Supabase client unavailable" };

      const details: string[] = [];
      let total = 0;
      for (const field of REQUIRED_FIELDS) {
        const { count, error } = await client
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .eq(field, "");
        if (error) return { status: "fail", summary: `Query failed on ${field}: ${error.message}` };
        if ((count ?? 0) > 0) {
          details.push(`${field}: ${count} empty`);
          total += count ?? 0;
        }
      }

      if (total > 0) {
        return {
          status: "fail",
          summary: `${total} active job row(s) missing a required field`,
          details,
          recommendation: "Investigate the ingest path for the affected source(s) — required fields should never be empty.",
        };
      }
      return { status: "pass", summary: "No active jobs missing a required field" };
    },
  };
}
