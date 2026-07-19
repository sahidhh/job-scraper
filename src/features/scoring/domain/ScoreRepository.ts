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
   * Delete every job_scores row for (roleSelectionId, resumeVersion) and
   * return how many were removed. Used by the rescore script
   * (scripts/rescore.ts) to force a full re-score of the active corpus after a
   * scoring-prompt/constraint change: score.ts only (re)scores jobs that have
   * NO score row for the active (role_selection, resume_version), so the
   * existing rows must be cleared first for the new prompt to take effect on
   * already-scored jobs (see decisions.md AD-50, limitations.md §3.5).
   */
  deleteScores(roleSelectionId: string, resumeVersion: number): Promise<number>;

  /**
   * job_scores rows for (roleSelectionId, resumeVersion) that passed the
   * keyword gate but have no ai_score yet -- the AI-retry queue -- ordered
   * oldest scoredAt first (Phase 1 Task 6, feeds
   * computeScoringQueueSummary/getScoringQueueReport). Excludes rows whose
   * underlying job has since gone inactive (expired) -- such a row can
   * never be picked up again by findUnscored (which only ever considers
   * active jobs), so it would otherwise report as permanently, unfixably
   * "stuck" instead of just not being retried.
   */
  findAwaitingAi(roleSelectionId: string, resumeVersion: number, keywordThreshold: number): Promise<AwaitingScoreJob[]>;
}
