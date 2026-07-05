import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";
import { SKIPPED_NO_SUPABASE_CLIENT } from "../skipOutcomes";

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
      if (!client) return SKIPPED_NO_SUPABASE_CLIENT;

      const { data, error } = await client.from("company_career_pages").select("canonical_company_name, career_page_url");
      if (error) {
        return {
          status: "fail",
          summary: `Query failed: ${error.message}`,
          affectedSubsystem: "Career page discovery",
        };
      }

      const invalid = (data ?? []).filter((r) => !HTTP_URL_PATTERN.test(r.career_page_url));
      if (invalid.length > 0) {
        return {
          status: "warning",
          summary: `${invalid.length} career page URL(s) are not well-formed http(s) URLs`,
          details: invalid.map((r) => r.canonical_company_name),
          probableCause: "discoverAtsCareerPages.ts derived a URL from a board_token/company name in an unexpected way.",
          suggestedFix: "This check validates URL format only, not reachability, to avoid unbounded outbound requests. Manually spot-check the listed companies' career_page_url.",
          affectedSubsystem: "Career page discovery",
          docReference: "design/limitations.md §1.8",
        };
      }
      return { status: "pass", summary: "All discovered career page URLs are well-formed" };
    },
  };
}
