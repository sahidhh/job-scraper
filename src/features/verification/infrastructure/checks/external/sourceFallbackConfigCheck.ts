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

      // jsearch/adzuna (merge-workspace Phase 5): both auto-disable when
      // their API credentials are unset (same "unconfigured = clean skip"
      // convention as Wellfound/RemoteOK), so the only real contradiction
      // worth flagging is credentials present alongside an explicit disable.
      const rapidApiKey = process.env.RAPIDAPI_KEY;
      const jsearchDisabled = isTruthyFlag(process.env.JSEARCH_DISABLED);
      if (rapidApiKey && jsearchDisabled) {
        status = "warning";
        details.push("RAPIDAPI_KEY is set but JSEARCH_DISABLED is also true — JSearch will not run despite having a key");
      } else {
        details.push(`JSearch: ${rapidApiKey ? (jsearchDisabled ? "explicitly disabled" : "enabled") : "no API key configured"}`);
      }

      const adzunaConfigured = Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
      const adzunaDisabled = isTruthyFlag(process.env.ADZUNA_DISABLED);
      if (adzunaConfigured && adzunaDisabled) {
        status = "warning";
        details.push("ADZUNA_APP_ID/ADZUNA_APP_KEY are set but ADZUNA_DISABLED is also true — Adzuna will not run despite having credentials");
      } else {
        details.push(`Adzuna: ${adzunaConfigured ? (adzunaDisabled ? "explicitly disabled" : "enabled") : "no API credentials configured"}`);
      }

      return {
        status,
        summary: status === "pass" ? "Source fallback configuration is consistent" : "Source fallback configuration has a contradiction",
        details,
        probableCause:
          status === "warning"
            ? "A source's credentials/feed URL and its explicit *_DISABLED flag were set independently, likely by different people/sessions, without checking for a conflict."
            : undefined,
        suggestedFix:
          status === "warning"
            ? "Either unset the *_DISABLED flag to actually use the configured credentials, or remove the credentials if the source is meant to stay off."
            : undefined,
        affectedSubsystem: status === "warning" ? "Scraping pipeline (feed-based sources)" : undefined,
        docReference: status === "warning" ? "docs/sources/wellfound.md" : undefined,
      };
    },
  };
}
