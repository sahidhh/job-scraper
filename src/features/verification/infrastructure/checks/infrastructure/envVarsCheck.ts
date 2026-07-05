import { checkOptionalVar, checkRequiredVar } from "@/shared/infrastructure/envCheck";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";

export interface OptionalVarSpec {
  name: string;
  fallback: string;
}

// The concrete variable names (design/tech-stack.md §3) are supplied by the
// composition root (scripts/verify-production.ts) rather than hardcoded
// here -- keeps this generic-framework file free of the service-role
// secret's env var name, which check:service-role-boundary (AD-12)
// restricts to scripts/** and supabaseClient.ts.
export function envVarsCheck(requiredVars: readonly string[], optionalVars: readonly OptionalVarSpec[]): Check {
  return {
    id: "infra.env-vars",
    name: "Environment variables",
    category: "infrastructure",
    severity: "critical",
    async run(): Promise<CheckOutcome> {
      const required = requiredVars.map(checkRequiredVar);
      const optional = optionalVars.map((v) => checkOptionalVar(v.name, v.fallback));
      const missing = required.filter((r) => r.status === "fail");
      const missingOptional = optional.filter((r) => r.status === "warning");
      const details = [...required, ...optional].map((r) => `${r.label}: ${r.detail}`);

      if (missing.length > 0) {
        return {
          status: "fail",
          summary: `${missing.length} required environment variable(s) missing: ${missing.map((m) => m.label).join(", ")}`,
          details,
          probableCause: "A required secret/config var was never set, or was set under a different name in this environment.",
          suggestedFix: `Set: ${missing.map((m) => m.label).join(", ")}.`,
          affectedSubsystem: "Whichever pipeline stage owns the missing var (cron scrape/score/notify, or the web app)",
          docReference: "design/tech-stack.md §3",
        };
      }
      if (missingOptional.length > 0) {
        return {
          status: "warning",
          summary: `All required environment variables set; ${missingOptional.length} optional var(s) relying on defaults`,
          details,
          // Relying on a documented default is expected, not a defect -- see
          // skipOutcomes.ts for the same "downstream, not a new finding"
          // rationale applied to unavailable-client skips.
          severityOverride: "low",
        };
      }
      return { status: "pass", summary: "All required and optional environment variables are set", details };
    },
  };
}
