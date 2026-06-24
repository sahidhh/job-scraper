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
