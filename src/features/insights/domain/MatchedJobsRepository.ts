import type {
  ScrapeRunDataPoint,
  StatusBreakdownEntry,
} from "@/features/insights/domain/types";

// A job that matches the active role selection, reduced to the fields the
// insights use-cases need: text to extract skills from, and the AI score
// (for optional weighting / "high-confidence demand" views).
export interface MatchedJob {
  title: string;
  description: string;
  aiScore: number | null;
}

export interface MatchedJobsRepository {
  /**
   * Jobs whose title or description matches one of `expandedRoles` (same
   * predicate as JobRepository.findUnscored / countMatchingExpandedRoles,
   * decisions.md AD-15), each with its ai_score for `roleSelectionId`
   * (null if unscored). Feeds the skill-gap and demand use-cases (P1).
   */
  findRoleMatchedJobs(roleSelectionId: string, expandedRoles: string[]): Promise<MatchedJob[]>;

  // P3 analytics aggregations

  /** All successful scrape runs, ordered by run_at asc. */
  getScrapeRuns(): Promise<ScrapeRunDataPoint[]>;

  /** All non-null ai_scores for the given role selection. */
  getAiScores(roleSelectionId: string): Promise<number[]>;

  /**
   * Count of jobs per status. Jobs with no job_state row are counted under
   * the "New" label (matching the dashboard's default display).
   */
  getStatusBreakdown(): Promise<StatusBreakdownEntry[]>;
}
