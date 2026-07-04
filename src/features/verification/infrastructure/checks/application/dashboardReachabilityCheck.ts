import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";

const CORE_TABLES = ["jobs", "job_scores", "scrape_runs", "role_selections", "resumes"] as const;

/** Smoke-tests the tables the dashboard/analytics pages query on every load. */
export function dashboardReachabilityCheck(client: TypedSupabaseClient | null): Check {
  return {
    id: "app.dashboard-reachability",
    name: "Dashboard & analytics query reachability",
    category: "application",
    severity: "high",
    async run(): Promise<CheckOutcome> {
      if (!client) return { status: "warning", summary: "Skipped — Supabase client unavailable" };

      const failures: string[] = [];
      for (const table of CORE_TABLES) {
        const { error } = await client.from(table).select("*", { count: "exact", head: true });
        if (error) failures.push(`${table}: ${error.message}`);
      }

      if (failures.length > 0) {
        return {
          status: "fail",
          summary: `${failures.length} table(s) unreachable`,
          details: failures,
          recommendation: "Verify migrations are applied and RLS/service-role permissions are correct.",
        };
      }
      return { status: "pass", summary: "All dashboard/analytics tables reachable" };
    },
  };
}
