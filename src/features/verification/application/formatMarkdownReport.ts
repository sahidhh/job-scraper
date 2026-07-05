import type { CheckCategory, CheckResult } from "../domain/types";
import type { HealthScore, Verdict } from "./computeHealthScore";
import type { VerificationRun } from "./runChecks";

const STATUS_LABEL: Record<CheckResult["status"], string> = { pass: "PASS", warning: "WARNING", fail: "FAIL" };
const VERDICT_LABEL: Record<Verdict, string> = {
  ready: "✅ Ready",
  needs_attention: "🟡 Needs Attention",
  not_ready: "🔴 Not Ready",
};
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

export function formatMarkdownReport(run: VerificationRun, health: HealthScore): string {
  const lines: string[] = [];
  lines.push("# Production Verification Report");
  lines.push("");
  lines.push(`Generated: ${run.generatedAt}`);
  lines.push("");
  lines.push(`## Verdict: ${VERDICT_LABEL[health.verdict]}`);
  lines.push("");
  lines.push(`Health score: **${health.score}/100**`);
  lines.push("");
  lines.push(
    `| Pass | Warning | Fail | Critical Failures |\n|---|---|---|---|\n` +
      `| ${health.totals.pass} | ${health.totals.warning} | ${health.totals.fail} | ${health.criticalFailures} |`,
  );

  const grouped = groupByCategory(run.results);
  for (const category of CATEGORY_ORDER) {
    const results = grouped.get(category) ?? [];
    if (results.length === 0) continue;

    lines.push("");
    lines.push(`## ${CATEGORY_LABEL[category]}`);
    lines.push("");
    lines.push("| Status | Check | Severity | Summary | Duration |");
    lines.push("|---|---|---|---|---|");
    for (const r of results) {
      lines.push(`| ${STATUS_LABEL[r.status]} | ${r.name} | ${r.severity} | ${r.summary} | ${r.durationMs}ms |`);
    }

    const needsDiagnostics = results.filter(
      (r) => r.status !== "pass" && (r.probableCause || r.suggestedFix || r.affectedSubsystem || r.docReference || (r.details && r.details.length > 0)),
    );
    for (const r of needsDiagnostics) {
      lines.push("");
      lines.push(`<details><summary>${r.name} — diagnostics</summary>`);
      lines.push("");
      if (r.affectedSubsystem) lines.push(`- **Affected subsystem:** ${r.affectedSubsystem}`);
      if (r.probableCause) lines.push(`- **Probable cause:** ${r.probableCause}`);
      if (r.suggestedFix) lines.push(`- **Suggested fix:** ${r.suggestedFix}`);
      if (r.docReference) lines.push(`- **Docs:** ${r.docReference}`);
      if (r.details && r.details.length > 0) {
        lines.push("- **Details:**");
        for (const line of r.details) lines.push(`  - ${line}`);
      }
      lines.push("");
      lines.push("</details>");
    }
  }

  if (health.recommendations.length > 0) {
    lines.push("");
    lines.push("## Recommendations");
    lines.push("");
    for (const rec of health.recommendations) lines.push(`- ${rec}`);
  }

  return lines.join("\n") + "\n";
}
