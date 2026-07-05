// Generic production-verification framework (v1.4, refined in the v1.x
// operational-excellence pass). This layer knows nothing about jobs/
// scoring/sources/etc — every concrete check lives in infrastructure/ and
// is composed by a script (composition root). Mirrors the JobSourceScraper
// pattern: a domain interface, implementations elsewhere
// (design/architecture.md §1).

export type CheckStatus = "pass" | "warning" | "fail";

// Determines how much a failing/warning check moves the health score and
// whether it can single-handedly block a "ready" verdict
// (computeHealthScore.ts). Severity rubric (docs/operations/
// production-verification.md):
//   critical — broken deploy or security exposure; blocks "ready" outright
//   high     — broken core functionality, but usually self-healing/retried
//   medium   — real degraded operation that needs attention soon
//   low      — minor/cosmetic data-quality nit, or a symptom whose root
//              cause is already reported at higher severity elsewhere
export type CheckSeverity = "critical" | "high" | "medium" | "low";

export type CheckCategory = "infrastructure" | "application" | "external" | "data-quality";

export interface CheckOutcome {
  status: CheckStatus;
  summary: string;
  // Optional line-by-line detail (raw counts, per-item findings) kept
  // separate from `summary` so reporters can show it only when useful
  // (e.g. markdown detail list, omitted from a one-line console pass).
  details?: string[];
  // Structured diagnostics, populated on non-pass results only (operational-
  // excellence pass, Phase 2) -- replaces one-line ad hoc prose with the
  // fields an operator actually needs when triaging:
  probableCause?: string;
  suggestedFix?: string;
  // The runtime subsystem this affects in product terms (e.g. "Scoring
  // pipeline", "Telegram notifications") -- deliberately distinct from
  // `category`, which is the verification framework's own taxonomy and
  // doesn't tell you *which* product subsystem broke.
  affectedSubsystem?: string;
  // A doc/decision reference the operator can jump to for more context
  // (e.g. "design/security.md §2", "docs/decisions.md AD-16"). Omitted
  // when there's no single canonical reference.
  docReference?: string;
  // Overrides the check's default severity for score-weighting purposes on
  // THIS outcome only. Use when an outcome is a downstream symptom of a
  // root cause already reported (at its own severity) by another check --
  // e.g. every "Supabase client unavailable" skip is a consequence of the
  // environment-variables check's critical fail, not a new finding, so it
  // is deliberately downgraded rather than compounding the same root cause
  // across a dozen checks. Absent = use the check's own severity.
  severityOverride?: CheckSeverity;
}

export interface Check {
  readonly id: string;
  readonly name: string;
  readonly category: CheckCategory;
  readonly severity: CheckSeverity;
  run(): Promise<CheckOutcome>;
}

export interface CheckResult extends Omit<CheckOutcome, "severityOverride"> {
  id: string;
  name: string;
  category: CheckCategory;
  // Resolved severity: outcome.severityOverride ?? check.severity (runChecks.ts).
  severity: CheckSeverity;
  durationMs: number;
}
