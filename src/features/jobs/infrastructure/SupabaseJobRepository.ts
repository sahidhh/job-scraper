import type { JobRepository } from "@/features/jobs/domain/JobRepository";
import type { Job, JobFilters, JobsPage, JobWithScore, NormalizedJob, UpsertResult } from "@/features/jobs/domain/types";
import type { JobSource } from "@/shared/domain/enums";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import type { Database } from "../../../../supabase/database.types";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type JobInsertRow = Database["public"]["Tables"]["jobs"]["Insert"];

// findForDashboard doesn't select `description` (P1 #4) -- never rendered
// by JobRow, and dropping it shrinks the dashboard's RSC payload.
interface DashboardJobRow extends Omit<JobRow, "description"> {
  job_scores: { keyword_score: number; ai_score: number | null; ai_reasoning: string | null }[];
}

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
    updatedAt: row.updated_at,
  };
}

function toDashboardJob(row: DashboardJobRow): JobWithScore {
  const score = row.job_scores[0] as DashboardJobRow["job_scores"][number] | undefined;
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
    updatedAt: row.updated_at,
    keywordScore: score?.keyword_score ?? null,
    aiScore: score?.ai_score ?? null,
    aiReasoning: score?.ai_reasoning ?? null,
  };
}

// `excluded.first_seen_at` is never written, so the existing value (or the
// `first_seen_at` column default on insert) is preserved on conflict.
function toUpsertRow(job: NormalizedJob): JobInsertRow {
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
    updated_at: new Date().toISOString(),
  };
}

function jobKey(source: JobSource, sourceJobId: string): string {
  return `${source}:${sourceJobId}`;
}

// PostgREST .or() filter syntax treats `,`, `.`, `(`, `)` as structural and
// `%`/`*` as wildcards -- strip them from role strings (which may originate
// from AI-expanded roles, scraper-audit.md #1) before interpolating into
// `title.ilike.%...%` clauses.
const FILTER_UNSAFE_CHARS = /[,.()%*]/g;

function sanitizeRoleForFilter(role: string): string {
  return role.replace(FILTER_UNSAFE_CHARS, "").trim();
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
    if (expandedRoles.length === 0) return [];

    const sanitizedRoles = expandedRoles.map(sanitizeRoleForFilter).filter((role) => role.length > 0);
    if (sanitizedRoles.length === 0) return [];

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

    // Match title OR description so this stays consistent with the
    // scrape-time role filter (jobMatchesRoles, decisions.md AD-15), which
    // also matches on description -- otherwise jobs ingested on a
    // description-only role match would never be selected for scoring.
    const roleFilter = sanitizedRoles
      .flatMap((role) => [`title.ilike.%${role}%`, `description.ilike.%${role}%`])
      .join(",");
    let query = this.client.from("jobs").select("*").or(roleFilter);
    if (aiScoredIds.length > 0) {
      query = query.not("id", "in", `(${aiScoredIds.join(",")})`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(toJob);
  }

  async findForDashboard(roleSelectionId: string, filters: JobFilters, limit: number): Promise<JobsPage> {
    let query = this.client
      .from("jobs")
      .select(
        "id, source, source_job_id, company_id, company_name, title, location_raw, location_tags, url, posted_at, first_seen_at, updated_at, job_scores!left(keyword_score, ai_score, ai_reasoning, role_selection_id)",
      )
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
}
