import type { HealthScore } from "./computeHealthScore";
import type { VerificationRun } from "./runChecks";

export interface JsonReport extends VerificationRun {
  health: HealthScore;
}

export function formatJsonReport(run: VerificationRun, health: HealthScore): string {
  const report: JsonReport = { ...run, health };
  return JSON.stringify(report, null, 2);
}
