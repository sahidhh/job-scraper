import type { MatchedJob, MatchedJobsRepository } from "@/features/insights/domain/MatchedJobsRepository";
import { buildRoleFilter } from "@/shared/infrastructure/roleFilter";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";

interface MatchedJobRow {
  title: string;
  description: string;
  job_scores: { ai_score: number | null; role_selection_id: string }[];
}

export class SupabaseMatchedJobsRepository implements MatchedJobsRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async findRoleMatchedJobs(roleSelectionId: string, expandedRoles: string[]): Promise<MatchedJob[]> {
    const roleFilter = buildRoleFilter(expandedRoles);
    if (!roleFilter) return [];

    // Left-join job_scores scoped to the active role selection so unscored
    // matches still come back (aiScore null), mirroring findForDashboard.
    const { data, error } = await this.client
      .from("jobs")
      .select("title, description, job_scores!left(ai_score, role_selection_id)")
      .eq("job_scores.role_selection_id", roleSelectionId)
      .or(roleFilter)
      .returns<MatchedJobRow[]>();
    if (error) throw error;

    return (data ?? []).map((row) => ({
      title: row.title,
      description: row.description,
      aiScore: row.job_scores[0]?.ai_score ?? null,
    }));
  }
}
