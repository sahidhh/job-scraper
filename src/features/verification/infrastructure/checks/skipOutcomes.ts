import type { CheckOutcome } from "@/features/verification/domain/types";

/**
 * Shared "can't run, root cause already reported elsewhere" outcomes
 * (operational-excellence pass, Phase 1). Every check that depends on a
 * Supabase client returns exactly this when `client` is null instead of a
 * bespoke inline object -- consolidates ~15 near-duplicate skip messages
 * and, more importantly, gives them one consistent LOW severity: the
 * missing env var is already a critical/high finding on the
 * `infra.env-vars`/`infra.supabase-connectivity` checks, so every
 * downstream "can't query" skip would otherwise double-count that same
 * root cause at its own (often higher) severity.
 */
export const SKIPPED_NO_SUPABASE_CLIENT: CheckOutcome = {
  status: "warning",
  summary: "Skipped — Supabase client unavailable",
  probableCause: "The Supabase URL and/or service-role key env vars are not set in this environment.",
  suggestedFix: "See the \"Environment variables\" and \"Supabase connectivity\" checks for the underlying cause.",
  affectedSubsystem: "Supabase database",
  severityOverride: "low",
};

/** Same pattern for a missing external-service API credential (OpenRouter/Telegram). */
export function skippedMissingCredential(envVarName: string, affectedSubsystem: string): CheckOutcome {
  return {
    status: "warning",
    summary: `Skipped — ${envVarName} not set`,
    probableCause: `${envVarName} is not set in this environment.`,
    suggestedFix: `See the "Environment variables" check for the underlying cause; set ${envVarName} to enable this check.`,
    affectedSubsystem,
    severityOverride: "low",
  };
}
