import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";
import { SKIPPED_NO_SUPABASE_CLIENT } from "../skipOutcomes";

/**
 * Spot-checks the "exactly one active row" invariant enforced by the
 * `resumes`/`role_selections` partial unique indexes (design/erd.md) --
 * more than one active row would mean the invariant was somehow violated
 * (e.g. a manual DB edit bypassing the RPCs); zero is a valid "not set up
 * yet" state, not a bug, so it's downgraded to low severity rather than
 * inheriting this check's "high" (which describes the >1 case).
 */
export function activeSingletonsCheck(client: TypedSupabaseClient | null): Check {
  return {
    id: "app.active-singletons",
    name: "Active resume/role invariants",
    category: "application",
    severity: "high",
    async run(): Promise<CheckOutcome> {
      if (!client) return SKIPPED_NO_SUPABASE_CLIENT;

      const { count: resumeCount, error: e1 } = await client
        .from("resumes")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);
      if (e1) return { status: "fail", summary: `resumes query failed: ${e1.message}`, affectedSubsystem: "Resume management" };

      const { count: roleCount, error: e2 } = await client
        .from("role_selections")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);
      if (e2) return { status: "fail", summary: `role_selections query failed: ${e2.message}`, affectedSubsystem: "Role selection" };

      const details = [`active resumes=${resumeCount ?? 0}`, `active role_selections=${roleCount ?? 0}`];

      if ((resumeCount ?? 0) > 1 || (roleCount ?? 0) > 1) {
        return {
          status: "fail",
          summary: "More than one active resume or role_selection found — violates the single-active invariant",
          details,
          probableCause: "A row was inserted/updated directly against the table, bypassing the set_active_resume/set_active_role_selection RPC that atomically deactivates the previous row.",
          suggestedFix: "Manually deactivate all but the intended active row, then always go through the RPC going forward.",
          affectedSubsystem: "Resume management / Role selection",
          docReference: "design/erd.md",
        };
      }
      if ((resumeCount ?? 0) === 0 || (roleCount ?? 0) === 0) {
        return {
          status: "warning",
          summary: "No active resume and/or role selection — scoring pipeline will skip",
          details,
          probableCause: "This is a fresh setup that hasn't uploaded a resume and/or chosen a role yet.",
          suggestedFix: "Upload a resume via /resume and set a target role via /roles.",
          affectedSubsystem: "Resume management / Role selection",
          severityOverride: "low",
        };
      }
      return { status: "pass", summary: "Exactly one active resume and role selection", details };
    },
  };
}
