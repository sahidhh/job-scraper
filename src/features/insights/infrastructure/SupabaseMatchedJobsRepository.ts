import type { ExperienceRow, LocationRow, MatchedJob, MatchedJobsRepository } from "@/features/insights/domain/MatchedJobsRepository";
import type { ScrapeRunDataPoint, StatusBreakdownEntry } from "@/features/insights/domain/types";
import { buildRoleFilter } from "@/shared/infrastructure/roleFilter";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import { toAppError } from "@/shared/infrastructure/supabaseError";

interface MatchedJobRow {
  title: string;
  description: string;
  job_scores: { ai_score: number | null; role_selection_id: string }[];
}

interface ScrapeRunRow {
  run_at: string;
  found_count: number;
  source: string;
}

interface AiScoreRow {
  ai_score: number | null;
}

interface JobStateWithStatusRow {
  job_statuses: { label: string; color: string };
}

interface MinYearsRow {
  min_years: number | null;
}

interface LocationTagsRow {
  location_tags: string[] | null;
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
    if (error) throw toAppError(error);

    return (data ?? []).map((row) => ({
      title: row.title,
      description: row.description,
      aiScore: row.job_scores[0]?.ai_score ?? null,
    }));
  }

  async getScrapeRuns(): Promise<ScrapeRunDataPoint[]> {
    const { data, error } = await this.client
      .from("scrape_runs")
      .select("run_at, found_count, source")
      .eq("status", "success")
      .order("run_at", { ascending: true })
      .returns<ScrapeRunRow[]>();
    if (error) throw toAppError(error);

    return (data ?? []).map((row) => ({
      runAt: row.run_at,
      jobsFound: row.found_count,
      source: row.source,
    }));
  }

  async getAiScores(roleSelectionId: string): Promise<number[]> {
    const { data, error } = await this.client
      .from("job_scores")
      .select("ai_score")
      .eq("role_selection_id", roleSelectionId)
      .not("ai_score", "is", null)
      .returns<AiScoreRow[]>();
    if (error) throw toAppError(error);

    return (data ?? []).map((row) => row.ai_score as number);
  }

  async getStatusBreakdown(): Promise<StatusBreakdownEntry[]> {
    const { data: stateData, error: stateError } = await this.client
      .from("job_state")
      .select("job_statuses!inner(label, color)")
      .returns<JobStateWithStatusRow[]>();
    if (stateError) throw toAppError(stateError);

    const result = await this.client.from("jobs").select("*", { count: "exact", head: true });
    if (result.error) throw toAppError(result.error);

    const totalCount = result.count ?? 0;
    const rows = stateData ?? [];

    const map = new Map<string, StatusBreakdownEntry>();
    for (const row of rows) {
      const { label, color } = row.job_statuses;
      const existing = map.get(label);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(label, { label, color, count: 1 });
      }
    }

    const assignedCount = rows.length;
    const newCount = totalCount - assignedCount;
    if (newCount > 0) {
      map.set("New", { label: "New", color: "#E5E7EB", count: newCount });
    }

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }

  async getJobsExperienceData(): Promise<ExperienceRow[]> {
    const { data, error } = await this.client
      .from("jobs")
      .select("min_years")
      .returns<MinYearsRow[]>();
    if (error) throw toAppError(error);

    return (data ?? []).map((row) => ({ minYears: row.min_years }));
  }

  async getJobsLocationData(): Promise<LocationRow[]> {
    const { data, error } = await this.client
      .from("jobs")
      .select("location_tags")
      .returns<LocationTagsRow[]>();
    if (error) throw toAppError(error);

    return (data ?? []).map((row) => ({ locationTags: row.location_tags ?? [] }));
  }
}
