import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";

const HTTP_URL_PATTERN = /^https?:\/\//i;

/**
 * Format-only validation of discovered career page URLs
 * (company_career_pages). Deliberately does not live-fetch each URL --
 * that would be an unbounded number of outbound requests, against this
 * framework's "lightweight, no unnecessary requests" budget (mission
 * Phase 4). Reachability is a candidate for a separate, heavier, opt-in
 * check if it's ever needed.
 */
export function brokenCareerUrlsCheck(client: TypedSupabaseClient | null): Check {
  return {
    id: "data-quality.career-urls",
    name: "Broken career page URLs",
    category: "data-quality",
    severity: "low",
    async run(): Promise<CheckOutcome> {
      if (!client) return { status: "warning", summary: "Skipped — Supabase client unavailable" };

      const { data, error } = await client.from("company_career_pages").select("canonical_company_name, career_page_url");
      if (error) return { status: "fail", summary: `Query failed: ${error.message}` };

      const invalid = (data ?? []).filter((r) => !HTTP_URL_PATTERN.test(r.career_page_url));
      if (invalid.length > 0) {
        return {
          status: "warning",
          summary: `${invalid.length} career page URL(s) are not well-formed http(s) URLs`,
          details: invalid.map((r) => r.canonical_company_name),
          recommendation: "This check validates URL format only, not reachability, to avoid unbounded outbound requests.",
        };
      }
      return { status: "pass", summary: "All discovered career page URLs are well-formed" };
    },
  };
}
