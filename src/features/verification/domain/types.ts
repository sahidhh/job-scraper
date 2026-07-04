// Generic production-verification framework (v1.4). This layer knows
// nothing about jobs/scoring/sources/etc — every concrete check lives in
// infrastructure/ and is composed by a script (composition root). Mirrors
// the JobSourceScraper pattern: a domain interface, implementations
// elsewhere (design/architecture.md §1).

export type CheckStatus = "pass" | "warning" | "fail";

// Determines how much a failing/warning check moves the health score and
// whether it can single-handedly block a "ready" verdict (computeHealthScore.ts).
export type CheckSeverity = "critical" | "high" | "medium" | "low";

export type CheckCategory = "infrastructure" | "application" | "external" | "data-quality";

export interface CheckOutcome {
  status: CheckStatus;
  summary: string;
  // Optional line-by-line detail (raw counts, per-item findings) kept
  // separate from `summary` so reporters can show it only when useful
  // (e.g. markdown detail list, omitted from a one-line console pass).
  details?: string[];
  // Actionable next step, shown only for non-pass results.
  recommendation?: string;
}

export interface Check {
  readonly id: string;
  readonly name: string;
  readonly category: CheckCategory;
  readonly severity: CheckSeverity;
  run(): Promise<CheckOutcome>;
}

export interface CheckResult extends CheckOutcome {
  id: string;
  name: string;
  category: CheckCategory;
  severity: CheckSeverity;
  durationMs: number;
}
