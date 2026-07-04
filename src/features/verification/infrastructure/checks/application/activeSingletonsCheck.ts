import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";

/**
 * Spot-checks the "exactly one active row" invariant enforced by the
 * `resumes`/`role_selections` partial unique indexes (design/erd.md) --
 * more than one active row would mean the invariant was somehow violated
 * (e.g. a manual DB edit bypassing the RPCs); zero is a valid "not set up
 * yet" state, not a bug.
 */
export function activeSingletonsCheck(client: TypedSupabaseClient | null): Check {
  return {
    id: "app.active-singletons",
    name: "Active resume/role invariants",
    category: "application",
    severity: "high",
    async run(): Promise<CheckOutcome> {
      if (!client) return { status: "warning", summary: "Skipped — Supabase client unavailable" };

      const { count: resumeCount, error: e1 } = await client
        .from("resumes")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);
      if (e1) return { status: "fail", summary: `resumes query failed: ${e1.message}` };

      const { count: roleCount, error: e2 } = await client
        .from("role_selections")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);
      if (e2) return { status: "fail", summary: `role_selections query failed: ${e2.message}` };

      const details = [`active resumes=${resumeCount ?? 0}`, `active role_selections=${roleCount ?? 0}`];

      if ((resumeCount ?? 0) > 1 || (roleCount ?? 0) > 1) {
        return {
          status: "fail",
          summary: "More than one active resume or role_selection found — violates the single-active invariant",
          details,
          recommendation: "Investigate — this should be impossible under the unique partial index (design/erd.md).",
        };
      }
      if ((resumeCount ?? 0) === 0 || (roleCount ?? 0) === 0) {
        return { status: "warning", summary: "No active resume and/or role selection — scoring pipeline will skip", details };
      }
      return { status: "pass", summary: "Exactly one active resume and role selection", details };
    },
  };
}
