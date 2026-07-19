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
  /**
   * [0,1] -- stage 2, local embedding cosine similarity (continuous
   * (sim+1)/2 mapping, decisions.md AD-31), set only if keywordScore >=
   * KEYWORD_THRESHOLD and an EmbeddingScoreProvider was supplied. Null
   * whenever the provider was omitted, had no text to embed, or failed
   * (logged by the provider -- jobhunt bug #7). Informational only -- not
   * part of overallScore's ranking blend.
   */
  embeddingScore: number | null;
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
  // Local embedding cosine similarity, continuously mapped to [0,1]
  // (decisions.md AD-31). Null when no EmbeddingScoreProvider was supplied,
  // there was no text to embed, or the provider failed.
  embeddingScore?: number | null;
  // Deterministic composite ranking score (aiScore + configurable bonuses,
  // see computeOverallScore.ts). Null whenever aiScore is null -- an
  // unscored/gate-failed job has no base to blend bonuses onto, same as the
  // dashboard's existing `ai_score desc nulls last` behaviour.
  overallScore?: number | null;
  // Human-readable reasons the bonuses in overallScore were applied (e.g.
  // "preferred company"), for display next to the score. Null/empty when no
  // bonus applied.
  overallScoreReasons?: string[] | null;
}

// Configurable weights for the deterministic composite ranking score
// (Theme 1 continuous-improvement pass). Stored as one JSON value in
// app_settings under the "ranking_preferences" key (RankingPreferencesRepository),
// same pattern as NotificationPreferences. All fields optional; absence means
// "use the default" for bonus amounts, or "no preference" for the lists/flags.
export interface RankingPreferences {
  /** Company name (case-insensitive substring match against canonicalCompanyName). */
  preferredCompanies?: string[];
  /** Apply remoteBonus to jobs tagged "remote". */
  preferRemote?: boolean;
  /** Added when the job's company matches preferredCompanies. Default 0.05. */
  companyBonus?: number;
  /** Added when preferRemote is true and the job is tagged remote. Default 0.03. */
  remoteBonus?: number;
  /** Added when the job has a parsed salary (min or max). Default 0.02. */
  salaryBonus?: number;
  /**
   * Added when the job explicitly offers visa sponsorship
   * (jobs.visa_sponsorship === true, extracted at ingest). For an
   * India-based candidate targeting abroad roles, an explicit sponsorship
   * signal is a strong positive the AI match score doesn't already weight.
   * Default 0.04.
   */
  sponsorshipBonus?: number;
}
