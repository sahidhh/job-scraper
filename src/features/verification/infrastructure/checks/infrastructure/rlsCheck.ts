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
        // Already a critical fail on infra.env-vars -- don't double-count it here.
        return {
          status: "warning",
          summary: "Skipped — NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY not set",
          suggestedFix: "See the \"Environment variables\" check for the underlying cause.",
          affectedSubsystem: "Web app authentication/RLS",
          severityOverride: "low",
        };
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
            probableCause: "RLS is disabled on the `jobs` table, or its policy grants access beyond the `authenticated` role.",
            suggestedFix: "Re-enable RLS and the authenticated-only policy on every table.",
            affectedSubsystem: "Web app authentication/RLS",
            docReference: "design/security.md §2",
          };
        }
        return { status: "pass", summary: "Unauthenticated request returned zero rows" };
      } catch (err) {
        return {
          status: "warning",
          summary: `Could not verify RLS: ${err instanceof Error ? err.message : String(err)}`,
          probableCause: "The anon-key client failed to construct or the probe query threw an unexpected network/auth error.",
          suggestedFix: "Re-run this check; if it persists, verify NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY are valid.",
          affectedSubsystem: "Web app authentication/RLS",
        };
      }
    },
  };
}
