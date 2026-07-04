import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Check, CheckOutcome } from "@/features/verification/domain/types";

export function inconsistentAiScoresCheck(client: TypedSupabaseClient | null): Check {
  return {
    id: "data-quality.inconsistent-ai-scores",
    name: "Inconsistent AI/overall scores",
    category: "data-quality",
    severity: "medium",
    async run(): Promise<CheckOutcome> {
      if (!client) return { status: "warning", summary: "Skipped — Supabase client unavailable" };

      const { data, error } = await client.from("job_scores").select("id, ai_score, overall_score").not("ai_score", "is", null);
      if (error) return { status: "fail", summary: `Query failed: ${error.message}` };

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
          recommendation: "Review computeOverallScore.ts and upsert_job_score for the affected rows.",
        };
      }
      return { status: "pass", summary: "AI/overall scores are internally consistent" };
    },
  };
}
