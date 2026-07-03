// Mirrors the `job_scores` table (database.md §2).
export interface JobScore {
  id: string;
  jobId: string;
  roleSelectionId: string;
  keywordScore: number; // [0,1] -- stage 1, always set (scoring.md §2)
  aiScore: number | null; // [0,1] -- stage 2, set only if keywordScore >= KEYWORD_THRESHOLD
  aiReasoning: string | null;
  model: string | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  estimatedCostUsd: number | null;
  scoredAt: string; // ISO 8601
  /**
   * Number of times this row was (re-)written while ai_score stayed null
   * (Phase 1 Task 6). Incremented atomically by the upsert_job_score RPC --
   * never reset, so it reflects total failed-AI-attempt history even after
   * the job eventually scores successfully.
   */
  retryCount: number;
}

/**
 * A job_scores row that passed the keyword gate but has no ai_score yet --
 * the AI-retry queue (Phase 1 Task 6, ScoreRepository.findAwaitingAi).
 */
export interface AwaitingScoreJob {
  jobId: string;
  scoredAt: string;
  retryCount: number;
}

export interface NewJobScore {
  jobId: string;
  roleSelectionId: string;
  resumeVersion: number;
  keywordScore: number;
  aiScore?: number | null;
  aiReasoning?: string | null;
  model?: string | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  estimatedCostUsd?: number | null;
}
