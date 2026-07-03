import type { AwaitingScoreJob, NewJobScore } from "./types";

export interface ScoreRepository {
  /**
   * Upsert a job_scores row keyed on unique(job_id, role_selection_id,
   * resume_version) via the upsert_job_score RPC. On conflict, the
   * existing row is UPDATED (keyword_score, ai_score, ai_reasoning, ...)
   * rather than ignored -- this makes a previously-failed AI call
   * (ai_score left null) retryable on a later run (scoring.md §3,
   * decisions.md AD-07 follow-up). retry_count is incremented atomically
   * by the RPC whenever ai_score is still null after the write (Phase 1
   * Task 6) -- never decremented, and untouched once ai_score succeeds.
   */
  insertScore(score: NewJobScore): Promise<void>;

  hasScore(jobId: string, roleSelectionId: string, resumeVersion: number): Promise<boolean>;

  /**
   * job_scores rows for (roleSelectionId, resumeVersion) that passed the
   * keyword gate but have no ai_score yet -- the AI-retry queue -- ordered
   * oldest scoredAt first (Phase 1 Task 6, feeds
   * computeScoringQueueSummary/getScoringQueueReport).
   */
  findAwaitingAi(roleSelectionId: string, resumeVersion: number, keywordThreshold: number): Promise<AwaitingScoreJob[]>;
}
