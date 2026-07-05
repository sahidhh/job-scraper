import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";
import { SKIPPED_NO_SUPABASE_CLIENT } from "../skipOutcomes";

const REQUIRED_FIELDS = ["title", "url", "company_name", "source_job_id"] as const;

export function missingRequiredFieldsCheck(client: TypedSupabaseClient | null): Check {
  return {
    id: "data-quality.missing-required-fields",
    name: "Missing required fields",
    category: "data-quality",
    severity: "high",
    async run(): Promise<CheckOutcome> {
      if (!client) return SKIPPED_NO_SUPABASE_CLIENT;

      const details: string[] = [];
      let total = 0;
      for (const field of REQUIRED_FIELDS) {
        const { count, error } = await client
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .eq(field, "");
        if (error) {
          return {
            status: "fail",
            summary: `Query failed on ${field}: ${error.message}`,
            affectedSubsystem: "Scraping pipeline (job ingest)",
          };
        }
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
          probableCause: "An ATS adapter returned a posting with a missing field that normalize()/ingestJobs.ts didn't reject, or an upstream API response shape changed.",
          suggestedFix: "Check `npm run report:sources` for which source(s) recently ingested rows, then inspect that adapter's normalize step.",
          affectedSubsystem: "Scraping pipeline (job ingest)",
          docReference: "design/architecture.md §4",
        };
      }
      return { status: "pass", summary: "No active jobs missing a required field" };
    },
  };
}
