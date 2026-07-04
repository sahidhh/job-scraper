import { checkSupabaseConnectivity } from "@/shared/infrastructure/connectivityCheck";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";

export function supabaseConnectivityCheck(client: TypedSupabaseClient | null): Check {
  return {
    id: "infra.supabase-connectivity",
    name: "Supabase connectivity",
    category: "infrastructure",
    severity: "critical",
    async run(): Promise<CheckOutcome> {
      if (!client) {
        return {
          status: "fail",
          summary: "Supabase client unavailable — required Supabase environment variables are not set",
          recommendation: "Set the required Supabase environment variables (design/tech-stack.md §3).",
        };
      }

      const result = await checkSupabaseConnectivity(client);
      if (result.status === "fail") {
        return {
          status: "fail",
          summary: result.detail,
          recommendation: "Verify the Supabase project is reachable and the service role key is valid.",
        };
      }
      return { status: "pass", summary: result.detail };
    },
  };
}
