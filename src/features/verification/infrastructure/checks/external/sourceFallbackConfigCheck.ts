import type { Check, CheckOutcome, CheckStatus } from "@/features/verification/domain/types";

function isTruthyFlag(value: string | undefined): boolean {
  return /^(true|1)$/i.test(value ?? "");
}

/**
 * Local, network-free consistency check for the feed-based sources'
 * disable/fallback flags (docs/sources/wellfound.md, scrape.yml) --
 * catches a contradiction like a configured feed URL alongside an explicit
 * disable flag, which would silently waste the configured URL.
 */
export function sourceFallbackConfigCheck(): Check {
  return {
    id: "external.source-fallback-config",
    name: "Source fallback configuration",
    category: "external",
    severity: "low",
    async run(): Promise<CheckOutcome> {
      const details: string[] = [];
      let status: CheckStatus = "pass";

      const wellfoundUrl = process.env.WELLFOUND_FEED_URL;
      const wellfoundDisabled = isTruthyFlag(process.env.WELLFOUND_DISABLED);
      if (wellfoundUrl && wellfoundDisabled) {
        status = "warning";
        details.push("WELLFOUND_FEED_URL is set but WELLFOUND_DISABLED is also true — Wellfound will not run despite having a feed URL");
      } else if (!wellfoundUrl) {
        details.push(`Wellfound: no feed URL configured (${wellfoundDisabled ? "explicitly disabled" : "adapter auto-disables"})`);
      } else {
        details.push("Wellfound: feed URL configured and enabled");
      }

      const remoteOkDisabled = isTruthyFlag(process.env.REMOTEOK_DISABLED);
      details.push(`RemoteOK: ${remoteOkDisabled ? "explicitly disabled" : "enabled"}`);

      return {
        status,
        summary: status === "pass" ? "Source fallback configuration is consistent" : "Source fallback configuration has a contradiction",
        details,
        probableCause: status === "warning" ? "WELLFOUND_FEED_URL and WELLFOUND_DISABLED were set independently, likely by different people/sessions, without checking for a conflict." : undefined,
        suggestedFix: status === "warning" ? "Either unset WELLFOUND_DISABLED to actually use the configured feed, or remove WELLFOUND_FEED_URL if Wellfound is meant to stay off." : undefined,
        affectedSubsystem: status === "warning" ? "Scraping pipeline (Wellfound source)" : undefined,
        docReference: status === "warning" ? "docs/sources/wellfound.md" : undefined,
      };
    },
  };
}
