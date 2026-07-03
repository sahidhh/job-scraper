import type { AwaitingScoreJob, NewJobScore } from "@/features/scoring/domain/types";
import type { ScoreRepository } from "@/features/scoring/domain/ScoreRepository";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import { toAppError } from "@/shared/infrastructure/supabaseError";

// repositories.md §5.
export class SupabaseScoreRepository implements ScoreRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  // Atomic upsert + retry_count increment via the upsert_job_score RPC
  // (Phase 1 Task 6, decisions.md AD-19) -- a plain client-side .upsert()
  // can't express "increment only when ai_score is still null" in one
  // round trip.
  async insertScore(score: NewJobScore): Promise<void> {
    const { error } = await this.client.rpc("upsert_job_score", {
      p_job_id: score.jobId,
      p_role_selection_id: score.roleSelectionId,
      p_resume_version: score.resumeVersion,
      p_keyword_score: score.keywordScore,
      p_ai_score: score.aiScore ?? null,
      p_ai_reasoning: score.aiReasoning ?? null,
      p_model: score.model ?? null,
      p_tokens_input: score.tokensInput ?? null,
      p_tokens_output: score.tokensOutput ?? null,
      p_estimated_cost_usd: score.estimatedCostUsd ?? null,
    });

    if (error) throw toAppError(error);
  }

  async hasScore(jobId: string, roleSelectionId: string, resumeVersion: number): Promise<boolean> {
    const { count, error } = await this.client
      .from("job_scores")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId)
      .eq("role_selection_id", roleSelectionId)
      .eq("resume_version", resumeVersion);

    if (error) throw toAppError(error);
    return (count ?? 0) > 0;
  }

  async findAwaitingAi(roleSelectionId: string, resumeVersion: number, keywordThreshold: number): Promise<AwaitingScoreJob[]> {
    const { data, error } = await this.client
      .from("job_scores")
      .select("job_id, scored_at, retry_count")
      .eq("role_selection_id", roleSelectionId)
      .eq("resume_version", resumeVersion)
      .gte("keyword_score", keywordThreshold)
      .is("ai_score", null)
      .order("scored_at", { ascending: true });

    if (error) throw toAppError(error);

    return (data ?? []).map((row) => ({
      jobId: row.job_id,
      scoredAt: row.scored_at,
      retryCount: row.retry_count,
    }));
  }
}
