import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";
import { SKIPPED_NO_SUPABASE_CLIENT } from "../skipOutcomes";

export function invalidSalaryDataCheck(client: TypedSupabaseClient | null): Check {
  return {
    id: "data-quality.invalid-salary",
    name: "Invalid salary data",
    category: "data-quality",
    severity: "low",
    async run(): Promise<CheckOutcome> {
      if (!client) return SKIPPED_NO_SUPABASE_CLIENT;

      const { data, error } = await client
        .from("jobs")
        .select("id, salary_min, salary_max")
        .eq("is_active", true)
        .not("salary_min", "is", null)
        .not("salary_max", "is", null);
      if (error) {
        return {
          status: "fail",
          summary: `Query failed: ${error.message}`,
          affectedSubsystem: "Salary extraction",
        };
      }

      const invalid = (data ?? []).filter((r) => (r.salary_min ?? 0) > (r.salary_max ?? 0) || (r.salary_min ?? 0) < 0);
      if (invalid.length > 0) {
        return {
          status: "warning",
          summary: `${invalid.length} job(s) with salary_min > salary_max or a negative value`,
          probableCause: "extractSalary.ts misparsed an unusual salary phrasing (design/limitations.md §1.10) for these specific postings.",
          suggestedFix: "Inspect the affected jobs' raw description text against extractSalary.ts's PATTERNS; this is a known false-positive-avoidance tradeoff, not necessarily a bug.",
          affectedSubsystem: "Salary extraction",
          docReference: "design/limitations.md §1.10",
        };
      }
      return { status: "pass", summary: "No invalid salary ranges detected" };
    },
  };
}
