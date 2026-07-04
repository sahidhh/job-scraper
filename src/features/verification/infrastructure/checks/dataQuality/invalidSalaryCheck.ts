import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";

export function invalidSalaryDataCheck(client: TypedSupabaseClient | null): Check {
  return {
    id: "data-quality.invalid-salary",
    name: "Invalid salary data",
    category: "data-quality",
    severity: "low",
    async run(): Promise<CheckOutcome> {
      if (!client) return { status: "warning", summary: "Skipped — Supabase client unavailable" };

      const { data, error } = await client
        .from("jobs")
        .select("id, salary_min, salary_max")
        .eq("is_active", true)
        .not("salary_min", "is", null)
        .not("salary_max", "is", null);
      if (error) return { status: "fail", summary: `Query failed: ${error.message}` };

      const invalid = (data ?? []).filter((r) => (r.salary_min ?? 0) > (r.salary_max ?? 0) || (r.salary_min ?? 0) < 0);
      if (invalid.length > 0) {
        return {
          status: "warning",
          summary: `${invalid.length} job(s) with salary_min > salary_max or a negative value`,
          recommendation: "Review extractSalary.ts parsing for the affected postings.",
        };
      }
      return { status: "pass", summary: "No invalid salary ranges detected" };
    },
  };
}
