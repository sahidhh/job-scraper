import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";

const BASIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function invalidEmailsCheck(client: TypedSupabaseClient | null): Check {
  return {
    id: "data-quality.invalid-emails",
    name: "Invalid contact emails",
    category: "data-quality",
    severity: "low",
    async run(): Promise<CheckOutcome> {
      if (!client) return { status: "warning", summary: "Skipped — Supabase client unavailable" };

      const { data, error } = await client
        .from("jobs")
        .select("id, contact_email")
        .eq("is_active", true)
        .not("contact_email", "is", null);
      if (error) return { status: "fail", summary: `Query failed: ${error.message}` };

      const invalid = (data ?? []).filter((r) => r.contact_email && !BASIC_EMAIL_PATTERN.test(r.contact_email));
      if (invalid.length > 0) {
        return {
          status: "warning",
          summary: `${invalid.length} job(s) with a malformed contact_email value`,
          recommendation: "Review extractContactEmail.ts — a stored value should always match a basic email shape.",
        };
      }
      return { status: "pass", summary: "All stored contact emails match a basic email shape" };
    },
  };
}
