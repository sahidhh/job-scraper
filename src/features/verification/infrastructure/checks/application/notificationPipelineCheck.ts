import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";
import { SKIPPED_NO_SUPABASE_CLIENT } from "../skipOutcomes";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Reachability + informational activity check for the notification
 * pipeline. Deliberately does not try to infer "should have notified but
 * didn't" -- NotificationPreferences (role/skill/location/experience/
 * source/exclude filters) can legitimately suppress a job above threshold,
 * so a stricter check would produce false positives. Severity is "medium"
 * (not "low") because this is the only check that touches
 * `notifications_log` at all -- a failure here is not redundant with any
 * other check's signal.
 */
export function notificationPipelineCheck(client: TypedSupabaseClient | null): Check {
  return {
    id: "app.notification-pipeline",
    name: "Notification pipeline",
    category: "application",
    severity: "medium",
    async run(): Promise<CheckOutcome> {
      if (!client) return SKIPPED_NO_SUPABASE_CLIENT;

      const since24h = new Date(Date.now() - DAY_MS).toISOString();
      const since7d = new Date(Date.now() - 7 * DAY_MS).toISOString();

      const { count: last24h, error: e1 } = await client
        .from("notifications_log")
        .select("id", { count: "exact", head: true })
        .gte("sent_at", since24h);
      if (e1) {
        return {
          status: "fail",
          summary: `notifications_log unreachable: ${e1.message}`,
          probableCause: "The `notifications_log` table is missing, RLS-blocked for the service role, or the Supabase project is unreachable.",
          suggestedFix: "Check the Supabase connectivity and migrations checks above; this is the only check that queries notifications_log directly.",
          affectedSubsystem: "Telegram notifications",
        };
      }

      const { count: last7d, error: e2 } = await client
        .from("notifications_log")
        .select("id", { count: "exact", head: true })
        .gte("sent_at", since7d);
      if (e2) {
        return {
          status: "fail",
          summary: `notifications_log unreachable: ${e2.message}`,
          probableCause: "The `notifications_log` table is missing, RLS-blocked for the service role, or the Supabase project is unreachable.",
          suggestedFix: "Check the Supabase connectivity and migrations checks above; this is the only check that queries notifications_log directly.",
          affectedSubsystem: "Telegram notifications",
        };
      }

      return {
        status: "pass",
        summary: `notifications_log reachable — ${last24h ?? 0} sent in last 24h, ${last7d ?? 0} in last 7d`,
      };
    },
  };
}
