import type { JobMatch, NotificationLogItem } from "./types";

export interface NotificationRepository {
  /**
   * Jobs scored for roleSelectionId at resumeVersion with ai_score >= threshold
   * and no notifications_log row yet. ai_score IS NULL never qualifies
   * (scoring.md §4, decisions.md AD-08).
   *
   * resumeVersion scopes the inner join to the active resume's score rows,
   * preventing duplicate results when a job has been scored against multiple
   * resume versions (decisions.md AD-08, resume-versioning migration).
   */
  findUnnotifiedMatches(roleSelectionId: string, threshold: number, resumeVersion: number): Promise<JobMatch[]>;

  /** Idempotent (unique(job_id), on-conflict-do-nothing). */
  markNotified(jobId: string): Promise<void>;

  /** Most recently sent notifications, joined with their job, for /settings. */
  listRecent(limit: number): Promise<NotificationLogItem[]>;
}
