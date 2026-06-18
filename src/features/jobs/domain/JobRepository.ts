import type { CreateStatusInput, Job, JobFilters, JobsPage, JobStatus, NormalizedJob, UpdateStatusInput, UpsertResult } from "./types";

export interface JobRepository {
  /**
   * All configured statuses ordered by sortOrder (job_statuses table, P0).
   * Drives the per-row status dropdown and the dashboard status filter.
   */
  listStatuses(): Promise<JobStatus[]>;

  /**
   * Create a new status entry in job_statuses (P3 settings CRUD).
   */
  createStatus(input: CreateStatusInput): Promise<JobStatus>;

  /**
   * Update an existing status's label and/or color by id (P3).
   */
  updateStatus(id: string, input: UpdateStatusInput): Promise<JobStatus>;

  /**
   * Delete a status. Nullifies any job_state rows referencing it first (P3).
   */
  deleteStatus(id: string): Promise<void>;

  /**
   * Assign `statusId` to every job in `jobIds` (upsert into job_state on
   * job_id). Used by the per-row dropdown (single id) and the bulk-select
   * action bar (many ids). "Archive" is just setting the Archived status.
   */
  setJobStatus(jobIds: string[], statusId: string): Promise<void>;

  /**
   * Upsert on (source, sourceJobId). Preserves firstSeenAt on conflict,
   * bumps updatedAt. Batched internally by the implementation
   * (repositories.md §2).
   */
  upsertMany(jobs: NormalizedJob[]): Promise<UpsertResult>;

  /**
   * Jobs whose title matches one of expandedRoles, and which either have
   * no job_scores row for roleSelectionId, or have one with ai_score IS
   * NULL (stage 2 never ran or previously failed -- retried). Feeds
   * scripts/score.ts (architecture.md §3.2, scoring.md §3).
   */
  findUnscored(roleSelectionId: string, expandedRoles: string[]): Promise<Job[]>;

  /**
   * Jobs joined with job_scores for roleSelectionId, filtered/sorted for
   * the /dashboard table, capped at `limit` rows (repositories.md §2).
   * `hasMore` indicates whether additional rows exist beyond `limit`.
   */
  findForDashboard(roleSelectionId: string, filters: JobFilters, limit: number): Promise<JobsPage>;

  /**
   * Count of jobs whose title or description matches at least one of
   * expandedRoles (same predicate as findUnscored), regardless of scoring
   * status. Lets the dashboard show how many of the jobs it lists are
   * actually eligible for scoring under the active role selection
   * (reports/dashboard-scoring-discrepancy.md).
   */
  countMatchingExpandedRoles(expandedRoles: string[]): Promise<number>;
}
