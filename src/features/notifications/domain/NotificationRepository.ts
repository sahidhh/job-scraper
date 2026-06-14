import type { JobMatch, NotificationLogItem } from "./types";

export interface NotificationRepository {
  /**
   * Jobs scored for roleSelectionId with ai_score >= threshold and no
   * notifications_log row yet. ai_score IS NULL never qualifies
   * (scoring.md §4, decisions.md AD-08).
   */
  findUnnotifiedMatches(roleSelectionId: string, threshold: number): Promise<JobMatch[]>;

  /** Idempotent (unique(job_id), on-conflict-do-nothing). */
  markNotified(jobId: string): Promise<void>;

  /** Most recently sent notifications, joined with their job, for /settings. */
  listRecent(limit: number): Promise<NotificationLogItem[]>;
}
