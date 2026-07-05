import type { Check, CheckResult } from "../domain/types";

export interface VerificationRun {
  generatedAt: string;
  results: CheckResult[];
}

/**
 * Executes every check sequentially (deterministic ordering, no surprise
 * concurrent load on external services) and times each one. A check that
 * throws is recorded as a "fail" rather than aborting the whole run --
 * one broken check must never hide the results of the others.
 */
export async function runChecks(checks: readonly Check[], now: () => Date = () => new Date()): Promise<VerificationRun> {
  const results: CheckResult[] = [];

  for (const check of checks) {
    const start = Date.now();
    try {
      const { severityOverride, ...outcome } = await check.run();
      results.push({
        id: check.id,
        name: check.name,
        category: check.category,
        severity: severityOverride ?? check.severity,
        durationMs: Date.now() - start,
        ...outcome,
      });
    } catch (err) {
      results.push({
        id: check.id,
        name: check.name,
        category: check.category,
        severity: check.severity,
        durationMs: Date.now() - start,
        status: "fail",
        summary: `Check threw an unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return { generatedAt: now().toISOString(), results };
}
