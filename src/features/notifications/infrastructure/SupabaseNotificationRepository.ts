import type { JobSource, LocationTag } from "@/shared/domain/enums";
import type { NotificationRepository } from "@/features/notifications/domain/NotificationRepository";
import type { JobMatch, NotificationLogItem } from "@/features/notifications/domain/types";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import { toAppError } from "@/shared/infrastructure/supabaseError";

// Shape returned by the embedded select in findUnnotifiedMatches --
// `job_scores!inner` narrows to jobs with a matching score row, and
// `notifications_log` is embedded (left join) so we can filter out jobs
// already notified.
interface UnnotifiedMatchRow {
  id: string;
  title: string;
  company_name: string;
  location_tags: LocationTag[];
  source: JobSource;
  url: string;
  description: string;
  min_years: number | null;
  job_scores: { ai_score: number | null; ai_reasoning: string | null }[];
  notifications_log: { id: string }[] | null;
}

// Shape returned by the embedded select in listRecent -- `jobs` is a
// to-one embed (notifications_log.job_id has a unique FK to jobs.id).
interface NotificationLogRow {
  id: string;
  job_id: string;
  sent_at: string;
  jobs: { title: string; company_name: string; source: JobSource } | null;
}

// repositories.md §6.
export class SupabaseNotificationRepository implements NotificationRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async findUnnotifiedMatches(roleSelectionId: string, threshold: number, resumeVersion: number): Promise<JobMatch[]> {
    const { data, error } = await this.client
      .from("jobs")
      .select(
        "id, title, company_name, location_tags, source, url, description, min_years, job_scores!inner(ai_score, ai_reasoning), notifications_log(id)",
      )
      .eq("job_scores.role_selection_id", roleSelectionId)
      .eq("job_scores.resume_version", resumeVersion)
      .gte("job_scores.ai_score", threshold)
      .returns<UnnotifiedMatchRow[]>();

    if (error) throw toAppError(error);

    return (data ?? [])
      .filter((row) => (row.notifications_log?.length ?? 0) === 0)
      .map((row) => {
        // non-null: `job_scores!inner` guarantees at least one matching row.
        const score = row.job_scores[0]!;
        return {
          jobId: row.id,
          title: row.title,
          companyName: row.company_name,
          locationTags: row.location_tags,
          source: row.source,
          url: row.url,
          aiScore: score.ai_score!, // non-null: filtered by the gte("job_scores.ai_score", threshold) clause
          aiReasoning: score.ai_reasoning,
          description: row.description,
          minYears: row.min_years,
        };
      });
  }

  async markNotified(jobId: string): Promise<void> {
    const { error } = await this.client
      .from("notifications_log")
      .upsert({ job_id: jobId }, { onConflict: "job_id", ignoreDuplicates: true });

    if (error) throw toAppError(error);
  }

  async listRecent(limit: number): Promise<NotificationLogItem[]> {
    const { data, error } = await this.client
      .from("notifications_log")
      .select("id, job_id, sent_at, jobs(title, company_name, source)")
      .order("sent_at", { ascending: false })
      .limit(limit)
      .returns<NotificationLogRow[]>();

    if (error) throw toAppError(error);

    return (data ?? [])
      .filter((row) => row.jobs !== null)
      .map((row) => ({
        id: row.id,
        jobId: row.job_id,
        jobTitle: row.jobs!.title,
        companyName: row.jobs!.company_name,
        source: row.jobs!.source,
        sentAt: row.sent_at,
      }));
  }
}
