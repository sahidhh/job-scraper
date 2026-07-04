import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";

export function storageCheck(client: TypedSupabaseClient | null): Check {
  return {
    id: "infra.storage",
    name: "Storage bucket",
    category: "infrastructure",
    severity: "medium",
    async run(): Promise<CheckOutcome> {
      if (!client) return { status: "warning", summary: "Skipped — Supabase client unavailable" };

      const { data, error } = await client.storage.getBucket("resumes");
      if (error || !data) {
        return {
          status: "fail",
          summary: `resumes bucket not reachable: ${error?.message ?? "not found"}`,
          recommendation: "Create the `resumes` storage bucket (design/security.md §4).",
        };
      }
      if (data.public) {
        return {
          status: "warning",
          summary: "resumes bucket exists but is PUBLIC (expected private)",
          recommendation: "Set the resumes bucket to private in Supabase Storage settings.",
        };
      }
      return { status: "pass", summary: "resumes bucket exists and is private" };
    },
  };
}
