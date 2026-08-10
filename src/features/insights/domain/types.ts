// A skill the resume lacks but matched jobs ask for (P1, level-up list).
export interface SkillGap {
  skill: string;
  demandCount: number; // number of matched jobs mentioning this skill
}

// A skill's demand across matched jobs (P1, in-demand view).
export interface SkillDemand {
  skill: string;
  count: number; // number of matched jobs mentioning this skill
}

// Analytics types (P3)

export interface ScrapeRunDataPoint {
  runAt: string;    // ISO timestamp from scrape_runs.run_at
  jobsFound: number;
  source: string;
}

export interface JobsOverTimePoint {
  date: string;     // YYYY-MM-DD, aggregated from runAt
  count: number;    // sum of jobsFound for that date
}

export interface JobsBySourceEntry {
  source: string;
  count: number;    // total jobsFound across all runs for this source
}

// Buckets: "0–10", "10–20", ..., "90–100". All 10 always present.
export interface ScoreHistogramBucket {
  bucket: string;
  count: number;
}

export interface StatusBreakdownEntry {
  label: string;
  color: string;  // hex from job_statuses.color
  count: number;
}

export interface JobsByExperiencePoint {
  minYears: number | null;
  count: number;
}

export interface JobsByLocationPoint {
  location: string;
  count: number;
}

// P5A analytics types

export interface TokenUsageStats {
  totalTokensInput: number;
  totalTokensOutput: number;
  totalCostUsd: number;
  jobsScoredByAi: number;
}

// Phase 4 Task 13 analytics types

export interface JobsByCompanyEntry {
  company: string;
  count: number;
}

// One entry per currency actually present in salary_currency -- job
// postings quote pay in different currencies, so a single blended average
// would be meaningless.
export interface SalaryStatsEntry {
  currency: string;
  count: number;
  avgMin: number;
  avgMax: number;
}

export interface RemoteStats {
  remoteCount: number;
  totalCount: number;
  remotePercentage: number; // 0-100, 0 when totalCount is 0
}

// Aggregated from scrape_runs across all statuses (unlike getScrapeRuns,
// which is success-only for the jobs-over-time/by-source charts).
export interface PipelineStats {
  totalRuns: number;
  failedRuns: number;
  totalDuplicates: number;
  avgDurationMs: number | null;
}

// AD-66/67: source='claude_routine' has no scrape_runs rows (it's not a
// polled source, see AD-65 point 4) so it's invisible everywhere else in
// /analytics on purpose. This is the one place that visibility is restored,
// keyed off jobs.first_seen_at since there's no dedicated import-batch id.
export interface ManualMatchDayCount {
  date: string; // YYYY-MM-DD
  count: number;
  runCount: number; // distinct first_seen_at timestamps that day (proxy for import runs)
}

export interface ManualMatchStats {
  totalCount: number;
  lastAddedAt: string | null; // ISO timestamp, null when totalCount is 0
  recentDays: ManualMatchDayCount[]; // most recent days with >0 imports, newest first
}
