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
      p_overall_score: score.overallScore ?? null,
      p_overall_score_reasons: score.overallScoreReasons ?? null,
      p_embedding_score: score.embeddingScore ?? null,
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
    const rows = data ?? [];
    if (rows.length === 0) return [];

    // A job_scores row can outlive the job it references: if the job
    // expires (jobs.is_active flips false) while still awaiting an AI
    // score, it can never be retried again -- findUnscored() only ever
    // considers active jobs (jobs.is_active = true,
    // SupabaseJobRepository.ts:358) -- so it would otherwise show up here
    // as permanently "stuck" with no cron run able to resolve it. Exclude
    // rows whose job is no longer active, chunked the same way
    // findUnscored's own candidate query is (8 KB gateway URL limit guard,
    // docs/reports/findUnscored-regression-fix.md).
    const jobIds = rows.map((row) => row.job_id);
    const activeIdSet = new Set<string>();
    const CHUNK_SIZE = 100;
    for (let i = 0; i < jobIds.length; i += CHUNK_SIZE) {
      const chunk = jobIds.slice(i, i + CHUNK_SIZE);
      const { data: activeRows, error: activeError } = await this.client
        .from("jobs")
        .select("id")
        .eq("is_active", true)
        .in("id", chunk);
      if (activeError) throw toAppError(activeError);
      for (const row of activeRows ?? []) activeIdSet.add(row.id);
    }

    return rows
      .filter((row) => activeIdSet.has(row.job_id))
      .map((row) => ({
        jobId: row.job_id,
        scoredAt: row.scored_at,
        retryCount: row.retry_count,
      }));
  }
}
