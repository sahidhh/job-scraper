import type { NewJobScore } from "@/features/scoring/domain/types";
import type { ScoreRepository } from "@/features/scoring/domain/ScoreRepository";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import { toAppError } from "@/shared/infrastructure/supabaseError";

// repositories.md §5.
export class SupabaseScoreRepository implements ScoreRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async insertScore(score: NewJobScore): Promise<void> {
    const { error } = await this.client.from("job_scores").upsert(
      {
        job_id: score.jobId,
        role_selection_id: score.roleSelectionId,
        resume_version: score.resumeVersion,
        keyword_score: score.keywordScore,
        ai_score: score.aiScore ?? null,
        ai_reasoning: score.aiReasoning ?? null,
      },
      { onConflict: "job_id,role_selection_id,resume_version", ignoreDuplicates: false },
    );

    if (error) throw toAppError(error);
  }

  async hasScore(jobId: string, roleSelectionId: string): Promise<boolean> {
    const { count, error } = await this.client
      .from("job_scores")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId)
      .eq("role_selection_id", roleSelectionId);

    if (error) throw toAppError(error);
    return (count ?? 0) > 0;
  }
}
