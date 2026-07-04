import type { JobRepository } from "@/features/jobs/domain/JobRepository";
import type {
  CreateStatusInput,
  Job,
  JobFilters,
  JobStats,
  JobsPage,
  JobStatus,
  JobWithScore,
  NormalizedJob,
  UpdateStatusInput,
  UpsertResult,
} from "@/features/jobs/domain/types";
import { computeFingerprint } from "@/features/jobs/application/computeFingerprint";
import { normalizeCompanyName } from "@/features/companies/domain/normalizeCompanyName";
import type { JobSource } from "@/shared/domain/enums";
import { buildRoleFilter, sanitizeRoleForFilter } from "@/shared/infrastructure/roleFilter";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import { toAppError } from "@/shared/infrastructure/supabaseError";
import type { Database } from "../../../../supabase/database.types";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type JobInsertRow = Database["public"]["Tables"]["jobs"]["Insert"];
type JobStatusRow = Database["public"]["Tables"]["job_statuses"]["Row"];
type JobDuplicateInsertRow = Database["public"]["Tables"]["job_duplicates"]["Insert"];

const ARCHIVED_STATUS_LABEL = "Archived";

// findForDashboard doesn't select `description` (P1 #4) -- never rendered
// by JobRow, and dropping it shrinks the dashboard's RSC payload.
interface DashboardJobRow extends Omit<JobRow, "description"> {
  job_scores: {
    keyword_score: number;
    ai_score: number | null;
    ai_reasoning: string | null;
    overall_score: number | null;
    overall_score_reasons: string[] | null;
  }[];
  // job_state.job_id is a PK referencing jobs, so PostgREST returns at most
  // one embedded row; treated as an array for parity with job_scores.
  job_state: { status_id: string | null; job_statuses: { id: string; label: string; color: string } | null }[];
}

// Columns selected in findForDashboard; mirrors DashboardJobRow but without
// the embedded foreign-table columns (those are added by PostgREST).
const DASHBOARD_SELECT =
  "id, source, source_job_id, company_id, company_name, title, location_raw, location_tags, url, min_years, posted_at, first_seen_at, last_seen_at, updated_at, is_active, inactive_reason, job_scores!left(keyword_score, ai_score, ai_reasoning, overall_score, overall_score_reasons, role_selection_id), job_state!left(status_id, job_statuses(id, label, color))";

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
    minYears: row.min_years ?? null,
    canonicalCompanyName: row.canonical_company_name,
    fingerprint: row.fingerprint,
    contactEmail: row.contact_email,
    contactEmailCategory: row.contact_email_category as Job["contactEmailCategory"],
    contactEmailConfidence: row.contact_email_confidence as Job["contactEmailConfidence"],
    salaryCurrency: row.salary_currency,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    salaryPeriod: row.salary_period as Job["salaryPeriod"],
    salaryConfidence: row.salary_confidence as Job["salaryConfidence"],
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
    overallScore: score?.overall_score ?? null,
    overallScoreReasons: score?.overall_score_reasons ?? null,
    minYears: row.min_years ?? null,
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
function toUpsertRow(job: NormalizedJob, fingerprint: string): JobInsertRow {
  const now = new Date().toISOString();
  return {
    source: job.source,
    source_job_id: job.sourceJobId,
    company_id: job.companyId,
    company_name: job.companyName,
    canonical_company_name: normalizeCompanyName(job.companyName),
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
    fingerprint,
    contact_email: job.contactEmail ?? null,
    contact_email_category: job.contactEmailCategory ?? null,
    contact_email_confidence: job.contactEmailConfidence ?? null,
    salary_currency: job.salaryCurrency ?? null,
    salary_min: job.salaryMin ?? null,
    salary_max: job.salaryMax ?? null,
    salary_period: job.salaryPeriod ?? null,
    salary_confidence: job.salaryConfidence ?? null,
  };
}

function jobKey(source: JobSource, sourceJobId: string): string {
  return `${source}:${sourceJobId}`;
}

function toDuplicateRow(job: NormalizedJob, canonicalJobId: string): JobDuplicateInsertRow {
  const now = new Date().toISOString();
  return {
    canonical_job_id: canonicalJobId,
    source: job.source,
    source_job_id: job.sourceJobId,
    url: job.url,
    last_seen_at: now,
  };
}

// repositories.md §2.
export class SupabaseJobRepository implements JobRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async upsertMany(jobs: NormalizedJob[]): Promise<UpsertResult> {
    let inserted = 0;
    let updated = 0;
    let duplicates = 0;

    for (let i = 0; i < jobs.length; i += UPSERT_BATCH_SIZE) {
      const batch = jobs.slice(i, i + UPSERT_BATCH_SIZE);
      const existingKeys = await this.findExistingKeys(batch);

      // Fingerprint computed once per job and reused below (partitioning,
      // duplicate lookup, upsert payload) instead of recomputing it per step.
      const withFingerprint = batch.map((job) => ({ job, fingerprint: computeFingerprint(job) }));

      // Jobs not already keyed by (source, source_job_id) are candidates for
      // a fresh insert. Before inserting, check whether their fingerprint
      // (normalized title + canonical company + location) already matches a
      // job from a DIFFERENT source -- if so, it's the same logical posting
      // rediscovered elsewhere, not a new job (Phase 1 Task 1). That job is
      // skipped from the upsert and recorded as provenance in job_duplicates
      // instead.
      const candidateNew = withFingerprint.filter(({ job }) => !existingKeys.has(jobKey(job.source, job.sourceJobId)));
      const canonicalByFingerprint = await this.findCanonicalByFingerprint(candidateNew.map((c) => c.fingerprint));

      const toUpsert: { job: NormalizedJob; fingerprint: string }[] = [];
      const duplicateRows: JobDuplicateInsertRow[] = [];
      const canonicalJobIdsSeen = new Set<string>();

      for (const entry of withFingerprint) {
        const { job, fingerprint } = entry;
        if (existingKeys.has(jobKey(job.source, job.sourceJobId))) {
          toUpsert.push(entry);
          continue;
        }

        const canonicalJobId = canonicalByFingerprint.get(fingerprint);
        if (canonicalJobId) {
          duplicateRows.push(toDuplicateRow(job, canonicalJobId));
          canonicalJobIdsSeen.add(canonicalJobId);
        } else {
          toUpsert.push(entry);
        }
      }

      if (toUpsert.length > 0) {
        const { error } = await this.client
          .from("jobs")
          .upsert(
            toUpsert.map(({ job, fingerprint }) => toUpsertRow(job, fingerprint)),
            { onConflict: "source,source_job_id" },
          );
        if (error) throw toAppError(error);
      }

      if (duplicateRows.length > 0) {
        await this.recordDuplicates(duplicateRows, canonicalJobIdsSeen);
      }

      for (const { job } of toUpsert) {
        if (existingKeys.has(jobKey(job.source, job.sourceJobId))) {
          updated += 1;
        } else {
          inserted += 1;
        }
      }
      duplicates += duplicateRows.length;
    }

    return { inserted, updated, duplicates };
  }

  // Fingerprints that already belong to a persisted job, regardless of
  // source or active status -- the cross-source duplicate check. Returns a
  // fingerprint -> canonical job id map. Cheap: one indexed IN-list query,
  // no per-row comparison (avoid expensive comparisons, Phase 1 Task 1).
  // Deliberately matches inactive (expired) jobs too -- recordDuplicates
  // reactivates the canonical row, since a source rediscovering it means
  // the posting is objectively still live.
  private async findCanonicalByFingerprint(fingerprints: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const uniqueFingerprints = [...new Set(fingerprints)];
    if (uniqueFingerprints.length === 0) return result;

    const { data, error } = await this.client.from("jobs").select("id, fingerprint").in("fingerprint", uniqueFingerprints);
    if (error) throw toAppError(error);

    for (const row of data ?? []) {
      if (!result.has(row.fingerprint)) result.set(row.fingerprint, row.id);
    }
    return result;
  }

  // Persists provenance for duplicate rows and reactivates the canonical
  // job (last_seen_at refreshed, is_active restored) so a job that had
  // expired under its original source doesn't stay hidden from the
  // dashboard/scoring forever while still being listed elsewhere under a
  // different source (Phase 1 Task 1).
  private async recordDuplicates(duplicateRows: JobDuplicateInsertRow[], canonicalJobIds: Set<string>): Promise<void> {
    const { error: duplicateError } = await this.client
      .from("job_duplicates")
      .upsert(duplicateRows, { onConflict: "source,source_job_id" });
    if (duplicateError) throw toAppError(duplicateError);

    const { error: touchError } = await this.client
      .from("jobs")
      .update({ last_seen_at: new Date().toISOString(), is_active: true, inactive_reason: null })
      .in("id", [...canonicalJobIds]);
    if (touchError) throw toAppError(touchError);
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
      if (error) throw toAppError(error);

      for (const row of data ?? []) {
        keys.add(jobKey(source, row.source_job_id));
      }
    }

    return keys;
  }

  async findUnscored(roleSelectionId: string, expandedRoles: string[], resumeVersion: number, keywordThreshold: number): Promise<Job[]> {
    const roleFilter = buildRoleFilter(expandedRoles);
    if (!roleFilter) return [];

    // Query 1: fetch "done" IDs from job_scores.
    // A job is "done" for this (role_selection, resume_version) and must be
    // excluded from the scoring queue if either:
    //   (a) ai_score IS NOT NULL — fully scored, or
    //   (b) keyword_score < keywordThreshold — intentionally skipped at the
    //       keyword gate (ai_score is null by design, not by failure).
    // Rows with keyword_score >= keywordThreshold AND ai_score IS NULL are NOT
    // excluded — they represent genuine AI call failures that should be retried.
    const { data: doneRows, error: doneError } = await this.client
      .from("job_scores")
      .select("job_id")
      .eq("role_selection_id", roleSelectionId)
      .eq("resume_version", resumeVersion)
      .or(`ai_score.not.is.null,keyword_score.lt.${keywordThreshold}`);
    if (doneError) throw toAppError(doneError);
    const doneIdSet = new Set((doneRows ?? []).map((row) => row.job_id));

    // Query 2: fetch IDs of all active candidate jobs matching the role filter.
    // Selecting only `id` keeps this query URL small regardless of how large
    // the done set grows (fixes the 414 URI Too Long regression introduced when
    // the scoring-loop fix expanded doneIds from ~50 to ~400+ entries).
    const { data: candidateRows, error: candidateError } = await this.client
      .from("jobs")
      .select("id")
      .eq("is_active", true)
      .or(roleFilter);
    if (candidateError) throw toAppError(candidateError);

    // Set difference in memory: candidates not already done.
    const eligibleIds = (candidateRows ?? [])
      .map((row) => (row as { id: string }).id)
      .filter((id) => !doneIdSet.has(id));
    if (eligibleIds.length === 0) return [];

    // Query 3+: fetch full job rows for eligible IDs in bounded chunks so that
    // no single IN list URL exceeds the 8 KB gateway limit.
    const CHUNK_SIZE = 100;
    const jobs: Job[] = [];
    for (let i = 0; i < eligibleIds.length; i += CHUNK_SIZE) {
      const chunk = eligibleIds.slice(i, i + CHUNK_SIZE);
      const { data, error } = await this.client.from("jobs").select("*").in("id", chunk);
      if (error) throw toAppError(error);
      jobs.push(...(data ?? []).map(toJob));
    }
    return jobs;
  }

  async countMatchingExpandedRoles(expandedRoles: string[]): Promise<number> {
    const roleFilter = buildRoleFilter(expandedRoles);
    if (!roleFilter) return 0;

    const { count, error } = await this.client
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .or(roleFilter);
    if (error) throw toAppError(error);
    return count ?? 0;
  }

  async countJobStats(roleSelectionId: string, _filters: JobFilters, resumeVersion: number): Promise<JobStats> {
    // Q1: scored — ai_score IS NOT NULL for this (role, version)
    const { count: scoredCount, error: scoredError } = await this.client
      .from("job_scores")
      .select("job_id", { count: "exact", head: true })
      .eq("role_selection_id", roleSelectionId)
      .eq("resume_version", resumeVersion)
      .not("ai_score", "is", null);
    if (scoredError) throw toAppError(scoredError);

    // Q2: awaiting review — keyword_score IS NOT NULL, ai_score IS NULL
    const { count: awaitingCount, error: awaitingError } = await this.client
      .from("job_scores")
      .select("job_id", { count: "exact", head: true })
      .eq("role_selection_id", roleSelectionId)
      .eq("resume_version", resumeVersion)
      .not("keyword_score", "is", null)
      .is("ai_score", null);
    if (awaitingError) throw toAppError(awaitingError);

    // Q3: total active jobs (full dataset, not page-scoped)
    const { count: total, error: totalError } = await this.client
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    if (totalError) throw toAppError(totalError);

    const scored = scoredCount ?? 0;
    const awaitingReview = awaitingCount ?? 0;
    const totalJobs = total ?? 0;
    // notEligible = active jobs with no score row for this role+version
    const notEligible = Math.max(0, totalJobs - scored - awaitingReview);

    return {
      scoredCount: scored,
      awaitingReviewCount: awaitingReview,
      notEligibleCount: notEligible,
      pendingCount: awaitingReview + notEligible,
      total: totalJobs,
    };
  }

  async findForDashboard(roleSelectionId: string, filters: JobFilters, limit: number, resumeVersion: number): Promise<JobsPage> {
    // Status filtering is resolved to a set of job ids first (mirrors the
    // aiScored-exclusion pattern in findUnscored): PostgREST filters on an
    // embedded resource only null out the embedding, they don't drop the
    // parent row, so status restrict/exclude must constrain `jobs.id`.
    const statusScope = await this.resolveStatusScope(filters);
    if (statusScope.restrictToIds && statusScope.restrictToIds.length === 0) {
      return { jobs: [], hasMore: false };
    }

    // When minAiScore is set, use !inner so jobs without a qualifying score are
    // excluded from the result. When minAiScore is absent, keep !left so
    // unscored jobs remain visible on the dashboard (existing behaviour).
    const joinType = filters.minAiScore !== undefined ? "inner" : "left";
    const selectStr = DASHBOARD_SELECT.replace("job_scores!left", `job_scores!${joinType}`);

    let query = this.client
      .from("jobs")
      .select(selectStr)
      .eq("is_active", true)
      .eq("job_scores.role_selection_id", roleSelectionId)
      .eq("job_scores.resume_version", resumeVersion);

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
    if (filters.search) {
      const term = sanitizeRoleForFilter(filters.search);
      if (term.length > 0) {
        query = query.or(`title.ilike.%${term}%,company_name.ilike.%${term}%`);
      }
    }
    if (filters.excludeCompanies && filters.excludeCompanies.length > 0) {
      // Each .not() call ANDs together -- a job is kept only if its company
      // name matches none of the muted terms (De Morgan's over the OR a
      // human would phrase this as: "hide if it matches ANY muted company").
      for (const company of filters.excludeCompanies) {
        const term = sanitizeRoleForFilter(company);
        if (term.length > 0) {
          query = query.not("company_name", "ilike", `%${term}%`);
        }
      }
    }
    if (statusScope.restrictToIds) {
      query = query.in("id", statusScope.restrictToIds);
    }
    if (statusScope.excludeIds && statusScope.excludeIds.length > 0) {
      query = query.not("id", "in", `(${statusScope.excludeIds.join(",")})`);
    }

    query = query
      // Composite ranking score (aiScore + configurable bonuses, Theme 1)
      // drives the default sort; posted_at remains the tiebreaker, which
      // already covers "freshness" without double-weighting it into the
      // bonus formula itself. Rows written before this column existed are
      // backfilled to overall_score = ai_score (migration 20260704000003),
      // so this never silently demotes older scored jobs.
      .order("overall_score", { ascending: false, nullsFirst: false, foreignTable: "job_scores" })
      .order("posted_at", { ascending: false })
      .limit(limit + 1);

    const { data, error } = await query.returns<DashboardJobRow[]>();
    if (error) throw toAppError(error);

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
    if (error) throw toAppError(error);
    return (data ?? []).map((row) => row.job_id);
  }

  private async statusIdByLabel(label: string): Promise<string | null> {
    const { data, error } = await this.client.from("job_statuses").select("id").eq("label", label).maybeSingle();
    if (error) throw toAppError(error);
    return data?.id ?? null;
  }

  async listStatuses(): Promise<JobStatus[]> {
    const { data, error } = await this.client
      .from("job_statuses")
      .select("id, label, color, sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw toAppError(error);
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
    if (error) throw toAppError(error);
  }

  async createStatus(input: CreateStatusInput): Promise<JobStatus> {
    const { data: maxData, error: maxError } = await this.client
      .from("job_statuses")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxError) throw toAppError(maxError);
    const nextSortOrder = (maxData?.sort_order ?? 0) + 1;

    const { data, error } = await this.client
      .from("job_statuses")
      .insert({ label: input.label, color: input.color, sort_order: nextSortOrder })
      .select("id, label, color, sort_order")
      .single();
    if (error) throw toAppError(error);
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
    if (error) throw toAppError(error);
    return toJobStatus(data);
  }

  async deleteStatus(id: string): Promise<void> {
    const { error: nullifyError } = await this.client
      .from("job_state")
      .update({ status_id: null })
      .eq("status_id", id);
    if (nullifyError) throw toAppError(nullifyError);

    const { error } = await this.client
      .from("job_statuses")
      .delete()
      .eq("id", id);
    if (error) throw toAppError(error);
  }

  async markExpiredJobs(thresholdDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await this.client
      .from("jobs")
      .update({ is_active: false, inactive_reason: "expired" })
      .eq("is_active", true)
      .lt("last_seen_at", cutoff)
      .select("id");
    if (error) throw toAppError(error);
    return (data ?? []).length;
  }
}
