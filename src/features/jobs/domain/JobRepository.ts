import type { Job, JobFilters, JobWithScore, NormalizedJob, UpsertResult } from "./types";

export interface JobRepository {
  /**
   * Upsert on (source, sourceJobId). Preserves firstSeenAt on conflict,
   * bumps updatedAt. Batched internally by the implementation
   * (repositories.md §2).
   */
  upsertMany(jobs: NormalizedJob[]): Promise<UpsertResult>;

  /**
   * Jobs with no job_scores row for roleSelectionId, whose title matches
   * one of expandedRoles. Feeds scripts/score.ts (architecture.md §3.2).
   */
  findUnscored(roleSelectionId: string, expandedRoles: string[]): Promise<Job[]>;

  /**
   * Jobs joined with job_scores for roleSelectionId, filtered/sorted for
   * the /dashboard table (repositories.md §2).
   */
  findForDashboard(roleSelectionId: string, filters: JobFilters): Promise<JobWithScore[]>;
}
