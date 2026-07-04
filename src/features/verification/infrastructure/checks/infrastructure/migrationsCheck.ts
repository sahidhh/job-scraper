import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";

// A representative column from each of the more recent migrations
// (design/erd.md) -- if PostgREST rejects the select, the column (and
// therefore the migration that added it) is missing. Cheap: `head: true`
// avoids fetching any rows.
const EXPECTATIONS: Array<{ table: "job_scores" | "scrape_runs"; columns: string; migration: string }> = [
  { table: "job_scores", columns: "retry_count", migration: "20260703000003_job_scores_retry_tracking.sql" },
  { table: "job_scores", columns: "overall_score,overall_score_reasons", migration: "20260704000004_ranking_overall_score.sql" },
  { table: "scrape_runs", columns: "failure_category", migration: "20260703000002_scrape_run_failure_category.sql" },
  { table: "scrape_runs", columns: "duplicate_count", migration: "20260619000001_scrape_run_metrics.sql" },
];

export function migrationsCheck(client: TypedSupabaseClient | null): Check {
  return {
    id: "infra.migrations",
    name: "Database migrations",
    category: "infrastructure",
    severity: "high",
    async run(): Promise<CheckOutcome> {
      if (!client) return { status: "warning", summary: "Skipped — Supabase client unavailable" };

      const missing: string[] = [];
      for (const expectation of EXPECTATIONS) {
        const { error } = await client.from(expectation.table).select(expectation.columns).limit(1);
        if (error) missing.push(`${expectation.table}(${expectation.columns}) — expected from ${expectation.migration}`);
      }

      if (missing.length > 0) {
        return {
          status: "fail",
          summary: `${missing.length} expected schema change(s) not detected`,
          details: missing,
          recommendation: "Run `supabase db push` (or the migrate.yml workflow) to apply pending migrations.",
        };
      }
      return { status: "pass", summary: "All expected schema columns from recent migrations are present" };
    },
  };
}
