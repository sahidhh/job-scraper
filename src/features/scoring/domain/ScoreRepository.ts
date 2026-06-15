import type { NewJobScore } from "./types";

export interface ScoreRepository {
  /**
   * Upsert a job_scores row keyed on unique(job_id, role_selection_id).
   * On conflict, the existing row is UPDATED (keyword_score, ai_score,
   * ai_reasoning) rather than ignored -- this makes a previously-failed
   * AI call (ai_score left null) retryable on a later run (scoring.md §3,
   * decisions.md AD-07 follow-up).
   */
  insertScore(score: NewJobScore): Promise<void>;

  hasScore(jobId: string, roleSelectionId: string): Promise<boolean>;
}
