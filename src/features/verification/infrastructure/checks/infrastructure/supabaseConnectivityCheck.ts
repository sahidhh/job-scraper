import { checkSupabaseConnectivity } from "@/shared/infrastructure/connectivityCheck";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";
import { SKIPPED_NO_SUPABASE_CLIENT } from "../skipOutcomes";

export function supabaseConnectivityCheck(client: TypedSupabaseClient | null): Check {
  return {
    id: "infra.supabase-connectivity",
    name: "Supabase connectivity",
    category: "infrastructure",
    severity: "critical",
    async run(): Promise<CheckOutcome> {
      // Missing env vars are already a critical fail on infra.env-vars --
      // reporting the same root cause again here (at critical severity)
      // would double-count it, so this degrades to the shared low-severity
      // skip instead of its own fail.
      if (!client) return SKIPPED_NO_SUPABASE_CLIENT;

      const result = await checkSupabaseConnectivity(client);
      if (result.status === "fail") {
        return {
          status: "fail",
          summary: result.detail,
          probableCause: "The Supabase project is unreachable, paused, or the service-role key is invalid/rotated.",
          suggestedFix: "Confirm the Supabase project is running and the service-role key env var matches the current key in the Supabase dashboard.",
          affectedSubsystem: "Supabase database",
          docReference: "design/tech-stack.md §3",
        };
      }
      return { status: "pass", summary: result.detail };
    },
  };
}
