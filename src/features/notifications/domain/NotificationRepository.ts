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

  /**
   * Batch form of markNotified -- one round trip for every id, so a single
   * digest message (one Telegram send covering many jobs) can't end up
   * half-marked if a later individual write in a per-item loop were to fail
   * (Phase 1 Task 4 notification-idempotency verification). No-op for an
   * empty array. Same idempotency guarantee as markNotified.
   */
  markManyNotified(jobIds: string[]): Promise<void>;

  /** Most recently sent notifications, joined with their job, for /settings. */
  listRecent(limit: number): Promise<NotificationLogItem[]>;
}
