import type { CheckCategory, CheckResult } from "../domain/types";
import type { HealthScore, Verdict } from "./computeHealthScore";
import type { VerificationRun } from "./runChecks";

const STATUS_ICON: Record<CheckResult["status"], string> = { pass: "✓", warning: "⚠", fail: "✗" };
const VERDICT_LABEL: Record<Verdict, string> = { ready: "READY", needs_attention: "NEEDS ATTENTION", not_ready: "NOT READY" };
const CATEGORY_LABEL: Record<CheckCategory, string> = {
  infrastructure: "Infrastructure",
  application: "Application",
  external: "External Services",
  "data-quality": "Data Quality",
};
const CATEGORY_ORDER: CheckCategory[] = ["infrastructure", "application", "external", "data-quality"];

function groupByCategory(results: readonly CheckResult[]): Map<CheckCategory, CheckResult[]> {
  const grouped = new Map<CheckCategory, CheckResult[]>();
  for (const category of CATEGORY_ORDER) grouped.set(category, []);
  for (const result of results) grouped.get(result.category)?.push(result);
  return grouped;
}

export function formatConsoleReport(run: VerificationRun, health: HealthScore): string {
  const lines: string[] = [];
  lines.push("Production Verification Report");
  lines.push(`Generated: ${run.generatedAt}`);
  lines.push("=".repeat(70));

  const grouped = groupByCategory(run.results);
  for (const category of CATEGORY_ORDER) {
    const results = grouped.get(category) ?? [];
    if (results.length === 0) continue;
    lines.push(`\n${CATEGORY_LABEL[category]}`);
    for (const r of results) {
      lines.push(`  ${STATUS_ICON[r.status]} ${r.name} (${r.durationMs}ms) — ${r.summary}`);
      if (r.recommendation) lines.push(`      → ${r.recommendation}`);
    }
  }

  lines.push(`\n${"=".repeat(70)}`);
  lines.push(
    `Checks: ${health.totals.pass} pass, ${health.totals.warning} warning, ${health.totals.fail} fail ` +
      `(${health.criticalFailures} critical)`,
  );
  lines.push(`Health score: ${health.score}/100`);
  lines.push(`Verdict: ${VERDICT_LABEL[health.verdict]}`);

  if (health.recommendations.length > 0) {
    lines.push("\nRecommendations:");
    for (const rec of health.recommendations) lines.push(`  - ${rec}`);
  }

  return lines.join("\n");
}
