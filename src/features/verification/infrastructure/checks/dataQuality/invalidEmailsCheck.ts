import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";
import { SKIPPED_NO_SUPABASE_CLIENT } from "../skipOutcomes";

const BASIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function invalidEmailsCheck(client: TypedSupabaseClient | null): Check {
  return {
    id: "data-quality.invalid-emails",
    name: "Invalid contact emails",
    category: "data-quality",
    severity: "low",
    async run(): Promise<CheckOutcome> {
      if (!client) return SKIPPED_NO_SUPABASE_CLIENT;

      const { data, error } = await client
        .from("jobs")
        .select("id, contact_email")
        .eq("is_active", true)
        .not("contact_email", "is", null);
      if (error) {
        return {
          status: "fail",
          summary: `Query failed: ${error.message}`,
          affectedSubsystem: "Contact email extraction",
        };
      }

      const invalid = (data ?? []).filter((r) => r.contact_email && !BASIC_EMAIL_PATTERN.test(r.contact_email));
      if (invalid.length > 0) {
        return {
          status: "warning",
          summary: `${invalid.length} job(s) with a malformed contact_email value`,
          probableCause: "extractContactEmail.ts's regex matched something that isn't a valid email, or the column was written to by something other than that extractor.",
          suggestedFix: "Inspect the affected rows' contact_email values directly; a stored value should always match EMAIL_REGEX in extractContactEmail.ts.",
          affectedSubsystem: "Contact email extraction",
          docReference: "design/limitations.md §1.9",
        };
      }
      return { status: "pass", summary: "All stored contact emails match a basic email shape" };
    },
  };
}
