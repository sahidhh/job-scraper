import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";
import { SKIPPED_NO_SUPABASE_CLIENT } from "../skipOutcomes";

export function storageCheck(client: TypedSupabaseClient | null): Check {
  return {
    id: "infra.storage",
    name: "Storage bucket",
    category: "infrastructure",
    severity: "medium",
    async run(): Promise<CheckOutcome> {
      if (!client) return SKIPPED_NO_SUPABASE_CLIENT;

      const { data, error } = await client.storage.getBucket("resumes");
      if (error || !data) {
        return {
          status: "fail",
          summary: `resumes bucket not reachable: ${error?.message ?? "not found"}`,
          probableCause: "The `resumes` storage bucket was never created on this Supabase project.",
          suggestedFix: "Create the `resumes` storage bucket in Supabase Storage.",
          affectedSubsystem: "Resume upload",
          docReference: "design/security.md §4",
        };
      }
      if (data.public) {
        return {
          status: "warning",
          summary: "resumes bucket exists but is PUBLIC (expected private)",
          probableCause: "The bucket's visibility was set to public, either at creation or by a later Storage settings change.",
          suggestedFix: "Set the resumes bucket to private in Supabase Storage settings.",
          affectedSubsystem: "Resume upload",
          docReference: "design/security.md §4",
        };
      }
      return { status: "pass", summary: "resumes bucket exists and is private" };
    },
  };
}
