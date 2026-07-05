import { SOURCE_HEALTH_CONFIG } from "@/features/sources/domain/sourceHealthConfig";
import type { SourceHealthSummary } from "@/features/sources/application/computeSourceHealthSummary";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";
import { SKIPPED_NO_SUPABASE_CLIENT } from "../skipOutcomes";

/**
 * Wraps the existing getSourceHealthReport() output (docs/decisions.md
 * AD-24: source-health signals are surfaced, never re-derived or merged)
 * into two checks. `getReport` should be memoized by the caller so both
 * checks share a single underlying scrape_runs query; it resolves to `null`
 * when no Supabase client is available, so these checks always appear in
 * the report (as a consistent skip) instead of silently disappearing --
 * matching every other client-dependent check's behavior.
 */
export function createSourceHealthChecks(getReport: () => Promise<SourceHealthSummary[] | null>): [Check, Check] {
  const sourceHealthCheck: Check = {
    id: "app.source-health",
    name: "Source scrape health",
    category: "application",
    severity: "high",
    async run(): Promise<CheckOutcome> {
      const report = await getReport();
      if (!report) return SKIPPED_NO_SUPABASE_CLIENT;

      const threshold = SOURCE_HEALTH_CONFIG.disableAfterConsecutiveFailures;
      const details = report.map((s) => `${s.source}: ${s.recommendation}`);
      const atThreshold = report.filter((s) => s.consecutiveFailures >= threshold);

      if (atThreshold.length > 0) {
        return {
          status: "fail",
          summary: `${atThreshold.length} source(s) at/above the disable threshold (${threshold} consecutive failures)`,
          details,
          probableCause: "One or more ATS boards are consistently unreachable or returning errors (dead board token, ToS/IP block, or an upstream API change).",
          suggestedFix: "Run `npm run report:sources` for the failure history, then `npm run validate-sources` to confirm which board tokens are dead.",
          affectedSubsystem: "Scraping pipeline",
          docReference: "docs/operations/source-validation.md",
        };
      }
      const unhealthy = report.filter((s) => s.consecutiveFailures > 0);
      if (unhealthy.length > 0) {
        return {
          status: "warning",
          summary: `${unhealthy.length} source(s) have recent failures but are below the disable threshold`,
          details,
          probableCause: "A source has failed its last one or more scrape attempts but hasn't crossed the auto-disable threshold yet.",
          suggestedFix: "Run `npm run report:sources` to see the specific error(s); often self-resolves on the next scheduled run.",
          affectedSubsystem: "Scraping pipeline",
          docReference: "docs/operations/observability.md",
        };
      }
      return { status: "pass", summary: "All sources healthy", details };
    },
  };

  const staleSourcesCheck: Check = {
    id: "app.stale-sources",
    name: "Stale sources",
    category: "application",
    severity: "medium",
    async run(): Promise<CheckOutcome> {
      const report = await getReport();
      if (!report) return SKIPPED_NO_SUPABASE_CLIENT;

      const details = report.map((s) => `${s.source}: hoursSinceLastRun=${s.hoursSinceLastRun ?? "n/a"}`);
      const stale = report.filter((s) => s.isStale);

      if (stale.length > 0) {
        return {
          status: "warning",
          summary: `${stale.length} source(s) have not run within the staleness window`,
          details,
          probableCause: "The source was dropped from JOB_SOURCES/the workflow, or a crashed scrape run silently skipped it entirely.",
          suggestedFix: `Confirm the scrape pipeline is actually running for: ${stale.map((s) => s.source).join(", ")}.`,
          affectedSubsystem: "Scraping pipeline",
          docReference: "design/architecture.md §5",
        };
      }
      return { status: "pass", summary: "No stale sources detected", details };
    },
  };

  return [sourceHealthCheck, staleSourcesCheck];
}
