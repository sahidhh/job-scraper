import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";
import { SKIPPED_NO_SUPABASE_CLIENT } from "../skipOutcomes";

export function inconsistentAiScoresCheck(client: TypedSupabaseClient | null): Check {
  return {
    id: "data-quality.inconsistent-ai-scores",
    name: "Inconsistent AI/overall scores",
    category: "data-quality",
    severity: "medium",
    async run(): Promise<CheckOutcome> {
      if (!client) return SKIPPED_NO_SUPABASE_CLIENT;

      const { data, error } = await client.from("job_scores").select("id, ai_score, overall_score").not("ai_score", "is", null);
      if (error) {
        return {
          status: "fail",
          summary: `Query failed: ${error.message}`,
          affectedSubsystem: "Scoring pipeline",
        };
      }

      const rows = data ?? [];
      const outOfRange = rows.filter((r) => r.ai_score! < 0 || r.ai_score! > 1);
      // design/erd.md: overall_score is nullable "iff ai_score is null" -- so
      // any row with ai_score set but overall_score null violates the invariant.
      const invariantViolations = rows.filter((r) => r.overall_score == null);

      const problems: string[] = [];
      if (outOfRange.length > 0) problems.push(`${outOfRange.length} ai_score value(s) outside [0,1]`);
      if (invariantViolations.length > 0) {
        problems.push(`${invariantViolations.length} row(s) with ai_score set but overall_score null (violates design/erd.md invariant)`);
      }

      if (problems.length > 0) {
        return {
          status: "warning",
          summary: problems.join("; "),
          probableCause: outOfRange.length > 0
            ? "The OpenRouter response schema returned a score outside the expected [0,1] range without being rejected."
            : "A row was written by something other than upsert_job_score (which always sets overall_score whenever ai_score is set), or predates the ranking-score migration and was missed by its backfill.",
          suggestedFix: "Review computeOverallScore.ts and the upsert_job_score RPC for the affected rows; check migration 20260704000004_ranking_overall_score.sql's backfill.",
          affectedSubsystem: "Scoring pipeline",
          docReference: "docs/decisions.md AD-26",
        };
      }
      return { status: "pass", summary: "AI/overall scores are internally consistent" };
    },
  };
}
