import type { NewJobScore } from "./types";

export interface ScoreRepository {
  /**
   * Insert a job_scores row. Idempotent via unique(job_id, role_selection_id)
   * -- on-conflict-do-nothing (repositories.md §5).
   */
  insertScore(score: NewJobScore): Promise<void>;

  hasScore(jobId: string, roleSelectionId: string): Promise<boolean>;
}
