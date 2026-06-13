// Mirrors the `job_scores` table (database.md §2).
export interface JobScore {
  id: string;
  jobId: string;
  roleSelectionId: string;
  keywordScore: number; // [0,1] -- stage 1, always set (scoring.md §2)
  aiScore: number | null; // [0,1] -- stage 2, set only if keywordScore >= KEYWORD_THRESHOLD
  aiReasoning: string | null;
  scoredAt: string; // ISO 8601
}

export interface NewJobScore {
  jobId: string;
  roleSelectionId: string;
  keywordScore: number;
  aiScore?: number | null;
  aiReasoning?: string | null;
}
