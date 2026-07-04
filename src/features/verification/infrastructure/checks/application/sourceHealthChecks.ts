import { SOURCE_HEALTH_CONFIG } from "@/features/sources/domain/sourceHealthConfig";
import type { SourceHealthSummary } from "@/features/sources/application/computeSourceHealthSummary";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";

/**
 * Wraps the existing getSourceHealthReport() output (docs/decisions.md
 * AD-24: source-health signals are surfaced, never re-derived or merged)
 * into two checks. `getReport` should be memoized by the caller so both
 * checks share a single underlying scrape_runs query.
 */
export function createSourceHealthChecks(getReport: () => Promise<SourceHealthSummary[]>): [Check, Check] {
  const sourceHealthCheck: Check = {
    id: "app.source-health",
    name: "Source scrape health",
    category: "application",
    severity: "high",
    async run(): Promise<CheckOutcome> {
      const report = await getReport();
      const threshold = SOURCE_HEALTH_CONFIG.disableAfterConsecutiveFailures;
      const details = report.map((s) => `${s.source}: ${s.recommendation}`);
      const atThreshold = report.filter((s) => s.consecutiveFailures >= threshold);

      if (atThreshold.length > 0) {
        return {
          status: "fail",
          summary: `${atThreshold.length} source(s) at/above the disable threshold (${threshold} consecutive failures)`,
          details,
          recommendation: "Investigate failing sources via `npm run report:sources` and `npm run validate-sources`.",
        };
      }
      const unhealthy = report.filter((s) => s.consecutiveFailures > 0);
      if (unhealthy.length > 0) {
        return {
          status: "warning",
          summary: `${unhealthy.length} source(s) have recent failures but are below the disable threshold`,
          details,
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
      const details = report.map((s) => `${s.source}: hoursSinceLastRun=${s.hoursSinceLastRun ?? "n/a"}`);
      const stale = report.filter((s) => s.isStale);

      if (stale.length > 0) {
        return {
          status: "warning",
          summary: `${stale.length} source(s) have not run within the staleness window`,
          details,
          recommendation: `Confirm the scrape pipeline is actually running for: ${stale.map((s) => s.source).join(", ")}.`,
        };
      }
      return { status: "pass", summary: "No stale sources detected", details };
    },
  };

  return [sourceHealthCheck, staleSourcesCheck];
}
