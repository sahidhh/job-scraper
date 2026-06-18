import type { JobRepository } from "@/features/jobs/domain/JobRepository";
import type {
  CreateStatusInput,
  Job,
  JobFilters,
  JobsPage,
  JobStatus,
  JobWithScore,
  NormalizedJob,
  UpdateStatusInput,
  UpsertResult,
} from "@/features/jobs/domain/types";
import type { JobSource } from "@/shared/domain/enums";
import { buildRoleFilter } from "@/shared/infrastructure/roleFilter";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Database } from "../../../../supabase/database.types";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type JobInsertRow = Database["public"]["Tables"]["jobs"]["Insert"];
type JobStatusRow = Database["public"]["Tables"]["job_statuses"]["Row"];

const ARCHIVED_STATUS_LABEL = "Archived";

// findForDashboard doesn't select `description` (P1 #4) -- never rendered
// by JobRow, and dropping it shrinks the dashboard's RSC payload.
interface DashboardJobRow extends Omit<JobRow, "description"> {
  job_scores: { keyword_score: number; ai_score: number | null; ai_reasoning: string | null }[];
  // job_state.job_id is a PK referencing jobs, so PostgREST returns at most
  // one embedded row; treated as an array for parity with job_scores.
  job_state: { status_id: string | null; job_statuses: { id: string; label: string; color: string } | null }[];
}

// Columns selected in findForDashboard; mirrors DashboardJobRow but without
// the embedded foreign-table columns (those are added by PostgREST).
const DASHBOARD_SELECT =
  "id, source, source_job_id, company_id, company_name, title, location_raw, location_tags, url, posted_at, first_seen_at, last_seen_at, updated_at, is_active, inactive_reason, job_scores!left(keyword_score, ai_score, ai_reasoning, role_selection_id), job_state!left(status_id, job_statuses(id, label, color))";

const UPSERT_BATCH_SIZE = 500;

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    source: row.source,
    sourceJobId: row.source_job_id,
    companyId: row.company_id,
    companyName: row.company_name,
    title: row.title,
    locationRaw: row.location_raw,
    locationTags: row.location_tags,
    description: row.description,
    url: row.url,
    postedAt: row.posted_at,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    updatedAt: row.updated_at,
    isActive: row.is_active,
    inactiveReason: row.inactive_reason,
  };
}

function toDashboardJob(row: DashboardJobRow): JobWithScore {
  const score = row.job_scores[0] as DashboardJobRow["job_scores"][number] | undefined;
  const status = row.job_state?.[0]?.job_statuses ?? null;
  return {
    id: row.id,
    source: row.source,
    sourceJobId: row.source_job_id,
    companyId: row.company_id,
    companyName: row.company_name,
    title: row.title,
    locationRaw: row.location_raw,
    locationTags: row.location_tags,
    url: row.url,
    postedAt: row.posted_at,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    updatedAt: row.updated_at,
    isActive: row.is_active,
    inactiveReason: row.inactive_reason,
    keywordScore: score?.keyword_score ?? null,
    aiScore: score?.ai_score ?? null,
    aiReasoning: score?.ai_reasoning ?? null,
    statusId: status?.id ?? null,
    statusLabel: status?.label ?? null,
    statusColor: status?.color ?? null,
  };
}

function toJobStatus(row: Pick<JobStatusRow, "id" | "label" | "color" | "sort_order">): JobStatus {
  return { id: row.id, label: row.label, color: row.color, sortOrder: row.sort_order };
}

// `excluded.first_seen_at` is never written, so the existing value (or the
// `first_seen_at` column default on insert) is preserved on conflict.
// `last_seen_at` IS always written -- it stamps the current scrape run on
// every touch (new or existing job), which is what the expiration sweep reads.
function toUpsertRow(job: NormalizedJob): JobInsertRow {
  const now = new Date().toISOString();
  return {
    source: job.source,
    source_job_id: job.sourceJobId,
    company_id: job.companyId,
    company_name: job.companyName,
    title: job.title,
    location_raw: job.locationRaw,
    location_tags: job.locationTags,
    description: job.description,
    url: job.url,
    posted_at: job.postedAt,
    updated_at: now,
    last_seen_at: now,
    is_active: true,
    min_years: job.minYears ?? null,
  };
}

function jobKey(source: JobSource, sourceJobId: string): string {
  return `${source}:${sourceJobId}`;
}

// repositories.md §2.
export class SupabaseJobRepository implements JobRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async upsertMany(jobs: NormalizedJob[]): Promise<UpsertResult> {
    let inserted = 0;
    let updated = 0;

    for (let i = 0; i < jobs.length; i += UPSERT_BATCH_SIZE) {
      const batch = jobs.slice(i, i + UPSERT_BATCH_SIZE);
      const existingKeys = await this.findExistingKeys(batch);

      const { error } = await this.client
        .from("jobs")
        .upsert(batch.map(toUpsertRow), { onConflict: "source,source_job_id" });
      if (error) throw error;

      for (const job of batch) {
        if (existingKeys.has(jobKey(job.source, job.sourceJobId))) {
          updated += 1;
        } else {
          inserted += 1;
        }
      }
    }

    return { inserted, updated };
  }

  // (source, source_job_id) pairs already in `jobs`, queried one source at
  // a time so the upsert's inserted/updated split can be computed without a
  // PostgREST `or()` filter (which is awkward to build safely from
  // arbitrary source_job_id values).
  private async findExistingKeys(jobs: NormalizedJob[]): Promise<Set<string>> {
    const idsBySource = new Map<JobSource, string[]>();
    for (const job of jobs) {
      const ids = idsBySource.get(job.source) ?? [];
      ids.push(job.sourceJobId);
      idsBySource.set(job.source, ids);
    }

    const keys = new Set<string>();
    for (const [source, sourceJobIds] of idsBySource) {
      const { data, error } = await this.client
        .from("jobs")
        .select("source_job_id")
        .eq("source", source)
        .in("source_job_id", sourceJobIds);
      if (error) throw error;

      for (const row of data ?? []) {
        keys.add(jobKey(source, row.source_job_id));
      }
    }

    return keys;
  }

  async findUnscored(roleSelectionId: string, expandedRoles: string[]): Promise<Job[]> {
    const roleFilter = buildRoleFilter(expandedRoles);
    if (!roleFilter) return [];

    // Jobs with a job_scores row whose ai_score is already set are fully
    // scored for this role selection and excluded. Jobs with NO row, or a
    // row with ai_score IS NULL (stage 2 never ran or failed), are
    // included so the AI step gets (re)tried (scoring.md §3, decisions.md
    // AD-07 follow-up).
    const { data: aiScored, error: scoredError } = await this.client
      .from("job_scores")
      .select("job_id")
      .eq("role_selection_id", roleSelectionId)
      .not("ai_score", "is", null);
    if (scoredError) throw scoredError;

    const aiScoredIds = (aiScored ?? []).map((row) => row.job_id);

    let query = this.client.from("jobs").select("*").eq("is_active", true).or(roleFilter);
    if (aiScoredIds.length > 0) {
      query = query.not("id", "in", `(${aiScoredIds.join(",")})`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(toJob);
  }

  async countMatchingExpandedRoles(expandedRoles: string[]): Promise<number> {
    const roleFilter = buildRoleFilter(expandedRoles);
    if (!roleFilter) return 0;

    const { count, error } = await this.client
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .or(roleFilter);
    if (error) throw error;
    return count ?? 0;
  }

  async findForDashboard(roleSelectionId: string, filters: JobFilters, limit: number): Promise<JobsPage> {
    // Status filtering is resolved to a set of job ids first (mirrors the
    // aiScored-exclusion pattern in findUnscored): PostgREST filters on an
    // embedded resource only null out the embedding, they don't drop the
    // parent row, so status restrict/exclude must constrain `jobs.id`.
    const statusScope = await this.resolveStatusScope(filters);
    if (statusScope.restrictToIds && statusScope.restrictToIds.length === 0) {
      return { jobs: [], hasMore: false };
    }

    let query = this.client
      .from("jobs")
      .select(DASHBOARD_SELECT)
      .eq("is_active", true)
      .eq("job_scores.role_selection_id", roleSelectionId);

    if (filters.locationTags && filters.locationTags.length > 0) {
      query = query.overlaps("location_tags", filters.locationTags);
    }
    if (filters.sources && filters.sources.length > 0) {
      query = query.in("source", filters.sources);
    }
    if (filters.minAiScore !== undefined) {
      query = query.gte("job_scores.ai_score", filters.minAiScore);
    }
    if (filters.maxYears !== undefined) {
      // Soft: NULL min_years ("unknown") always passes, never excluded.
      query = query.or(`min_years.is.null,min_years.lte.${filters.maxYears}`);
    }
    if (statusScope.restrictToIds) {
      query = query.in("id", statusScope.restrictToIds);
    }
    if (statusScope.excludeIds && statusScope.excludeIds.length > 0) {
      query = query.not("id", "in", `(${statusScope.excludeIds.join(",")})`);
    }

    query = query
      .order("ai_score", { ascending: false, nullsFirst: false, foreignTable: "job_scores" })
      .order("posted_at", { ascending: false })
      .limit(limit + 1);

    const { data, error } = await query.returns<DashboardJobRow[]>();
    if (error) throw error;

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const jobs = rows.slice(0, limit).map(toDashboardJob);

    return { jobs, hasMore };
  }

  // Translates the status filter into job-id constraints:
  //  - statusIds given  -> restrict to jobs currently in those statuses.
  //  - otherwise, unless includeArchived -> exclude jobs in the Archived
  //    status. Jobs with no job_state row are never Archived, so they stay.
  private async resolveStatusScope(
    filters: JobFilters,
  ): Promise<{ restrictToIds?: string[]; excludeIds?: string[] }> {
    if (filters.statusIds && filters.statusIds.length > 0) {
      return { restrictToIds: await this.jobIdsWithStatuses(filters.statusIds) };
    }

    if (!filters.includeArchived) {
      const archivedId = await this.statusIdByLabel(ARCHIVED_STATUS_LABEL);
      if (archivedId) {
        return { excludeIds: await this.jobIdsWithStatuses([archivedId]) };
      }
    }

    return {};
  }

  private async jobIdsWithStatuses(statusIds: string[]): Promise<string[]> {
    const { data, error } = await this.client.from("job_state").select("job_id").in("status_id", statusIds);
    if (error) throw error;
    return (data ?? []).map((row) => row.job_id);
  }

  private async statusIdByLabel(label: string): Promise<string | null> {
    const { data, error } = await this.client.from("job_statuses").select("id").eq("label", label).maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
  }

  async listStatuses(): Promise<JobStatus[]> {
    const { data, error } = await this.client
      .from("job_statuses")
      .select("id, label, color, sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toJobStatus);
  }

  async setJobStatus(jobIds: string[], statusId: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.client
      .from("job_state")
      .upsert(
        jobIds.map((jobId) => ({ job_id: jobId, status_id: statusId, updated_at: now })),
        { onConflict: "job_id" },
      );
    if (error) throw error;
  }

  async createStatus(input: CreateStatusInput): Promise<JobStatus> {
    const { data: maxData, error: maxError } = await this.client
      .from("job_statuses")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxError) throw maxError;
    const nextSortOrder = (maxData?.sort_order ?? 0) + 1;

    const { data, error } = await this.client
      .from("job_statuses")
      .insert({ label: input.label, color: input.color, sort_order: nextSortOrder })
      .select("id, label, color, sort_order")
      .single();
    if (error) throw error;
    return toJobStatus(data);
  }

  async updateStatus(id: string, input: UpdateStatusInput): Promise<JobStatus> {
    const updates: Partial<{ label: string; color: string }> = {};
    if (input.label !== undefined) updates.label = input.label;
    if (input.color !== undefined) updates.color = input.color;

    const { data, error } = await this.client
      .from("job_statuses")
      .update(updates)
      .eq("id", id)
      .select("id, label, color, sort_order")
      .single();
    if (error) throw error;
    return toJobStatus(data);
  }

  async deleteStatus(id: string): Promise<void> {
    const { error: nullifyError } = await this.client
      .from("job_state")
      .update({ status_id: null })
      .eq("status_id", id);
    if (nullifyError) throw nullifyError;

    const { error } = await this.client
      .from("job_statuses")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }

  async markExpiredJobs(thresholdDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await this.client
      .from("jobs")
      .update({ is_active: false, inactive_reason: "expired" })
      .eq("is_active", true)
      .lt("last_seen_at", cutoff)
      .select("id");
    if (error) throw error;
    return (data ?? []).length;
  }
}
