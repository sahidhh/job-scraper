import type { NewJobScore } from "@/features/scoring/domain/types";
import type { ScoreRepository } from "@/features/scoring/domain/ScoreRepository";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";

// repositories.md §5.
export class SupabaseScoreRepository implements ScoreRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async insertScore(score: NewJobScore): Promise<void> {
    const { error } = await this.client.from("job_scores").upsert(
      {
        job_id: score.jobId,
        role_selection_id: score.roleSelectionId,
        keyword_score: score.keywordScore,
        ai_score: score.aiScore ?? null,
        ai_reasoning: score.aiReasoning ?? null,
      },
      { onConflict: "job_id,role_selection_id", ignoreDuplicates: false },
    );

    if (error) throw error;
  }

  async hasScore(jobId: string, roleSelectionId: string): Promise<boolean> {
    const { count, error } = await this.client
      .from("job_scores")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId)
      .eq("role_selection_id", roleSelectionId);

    if (error) throw error;
    return (count ?? 0) > 0;
  }
}
