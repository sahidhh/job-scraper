import type { CheckResult, CheckStatus } from "../domain/types";

export type Verdict = "ready" | "needs_attention" | "not_ready";

export interface HealthScore {
  // 0-100, informational only -- the verdict below is what gates a deploy
  // decision, so the score is never itself a threshold to tune.
  score: number;
  verdict: Verdict;
  totals: Record<CheckStatus, number>;
  criticalFailures: number;
  recommendations: string[];
}

const SEVERITY_WEIGHT: Record<CheckResult["severity"], number> = {
  critical: 25,
  high: 15,
  medium: 8,
  low: 3,
};

/**
 * Deterministic aggregation of check results into a single go/no-go signal
 * (Phase 6). The verdict is rule-based, not score-threshold-based, so it
 * stays easy to reason about: any critical-severity failure blocks
 * "ready" outright regardless of how well everything else scored.
 */
export function computeHealthScore(results: readonly CheckResult[]): HealthScore {
  const totals: Record<CheckStatus, number> = { pass: 0, warning: 0, fail: 0 };
  // Dedup by exact text -- several checks legitimately share one root cause
  // (e.g. every "Supabase client unavailable" skip points at the same fix),
  // and repeating that advice a dozen times in the summary is noise, not
  // diagnostics (operational-excellence pass, Phase 1).
  const recommendations = new Set<string>();
  let score = 100;
  let criticalFailures = 0;

  for (const result of results) {
    totals[result.status] += 1;

    if (result.status === "fail") {
      score -= SEVERITY_WEIGHT[result.severity];
      if (result.severity === "critical") criticalFailures += 1;
    } else if (result.status === "warning") {
      score -= SEVERITY_WEIGHT[result.severity] / 2;
    }

    if (result.status !== "pass" && result.suggestedFix) {
      recommendations.add(result.suggestedFix);
    }
  }

  score = Math.max(0, Math.round(score));

  const verdict: Verdict =
    criticalFailures > 0 ? "not_ready" : totals.fail > 0 || totals.warning > 0 ? "needs_attention" : "ready";

  return { score, verdict, totals, criticalFailures, recommendations: [...recommendations] };
}
