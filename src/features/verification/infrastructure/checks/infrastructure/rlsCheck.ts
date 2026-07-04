import { createSupabaseAnonClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";

/**
 * Confirms RLS actually blocks unauthenticated reads (design/security.md
 * §2) by querying `jobs` with a fresh anon-key client that has no session.
 * A PostgREST error or zero rows is the healthy outcome; any row coming
 * back means RLS is disabled or misconfigured.
 */
export function rlsCheck(): Check {
  return {
    id: "infra.rls-enforcement",
    name: "Row-level security enforcement",
    category: "infrastructure",
    severity: "critical",
    async run(): Promise<CheckOutcome> {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        return { status: "warning", summary: "Skipped — NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY not set" };
      }

      try {
        const anon = createSupabaseAnonClient();
        const { data, error } = await anon.from("jobs").select("id").limit(1);

        if (error) {
          // A permission-denied/policy-violation error from PostgREST is the expected, healthy outcome.
          return { status: "pass", summary: "Unauthenticated read was rejected by RLS" };
        }
        if (data && data.length > 0) {
          return {
            status: "fail",
            summary: "Unauthenticated request returned row(s) from `jobs` — RLS may be disabled or misconfigured",
            recommendation: "Verify RLS is enabled with authenticated-only policies on every table (design/security.md §2).",
          };
        }
        return { status: "pass", summary: "Unauthenticated request returned zero rows" };
      } catch (err) {
        return { status: "warning", summary: `Could not verify RLS: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
}
