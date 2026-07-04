import type {
  JobsBySourceEntry,
  ScrapeRunDataPoint,
  StatusBreakdownEntry,
  TokenUsageStats,
} from "@/features/insights/domain/types";

export interface ExperienceRow {
  minYears: number | null;
}

export interface LocationRow {
  locationTags: string[];
}

export interface CompanyNameRow {
  companyName: string;
}

export interface SalaryRow {
  currency: string | null;
  min: number | null;
  max: number | null;
}

// One row per scrape_runs entry, any status -- unlike ScrapeRunDataPoint
// (success-only, feeds jobs-over-time/by-source charts), this feeds
// pipeline-level failure/duplicate/latency stats (Phase 4 Task 13).
export interface ScrapeRunStatRow {
  status: string;
  durationMs: number | null;
  duplicateCount: number | null;
}

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

  /** min_years for all jobs (nullable). Used for experience distribution chart. */
  getJobsExperienceData(): Promise<ExperienceRow[]>;

  /** location_tags arrays for all jobs. Used for location distribution chart. */
  getJobsLocationData(): Promise<LocationRow[]>;

  /** Aggregate token and cost totals across all job_scores rows. */
  getTokenUsageStats(): Promise<TokenUsageStats>;

  /** Count of distinct AI-scored jobs per source for the given role selection. */
  getScoredJobsBySource(roleSelectionId: string): Promise<JobsBySourceEntry[]>;

  // Phase 4 Task 13 analytics aggregations

  /** company_name for all active jobs. Used for the jobs-by-company chart. */
  getJobsCompanyData(): Promise<CompanyNameRow[]>;

  /** salary_currency/min/max for all jobs. Used for the salary stats cards. */
  getJobsSalaryData(): Promise<SalaryRow[]>;

  /** status/duration_ms/duplicate_count for every scrape_runs row, any status. Used for pipeline stats. */
  getScrapeRunStats(): Promise<ScrapeRunStatRow[]>;
}
