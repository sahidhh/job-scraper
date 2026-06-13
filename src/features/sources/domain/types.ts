import type { JobSource, ScrapeRunStatus } from "@/shared/domain/enums";

// Normalized output of every source adapter, before location tagging
// (filtering feature) and persistence (jobs feature). scrapers.md §3.
export interface RawJob {
  source: JobSource;
  sourceJobId: string; // stable id from the source, used for dedup
  companyId: string | null; // companies.id if known (greenhouse/lever/ashby), else null
  companyName: string;
  title: string;
  locationRaw: string; // "" if the source provides none -- never null
  description: string; // plain text, HTML stripped
  url: string;
  postedAt: string | null; // ISO 8601, or null if source doesn't provide it
}

// scrape_runs observability log (database.md §2).
export interface ScrapeRun {
  id: string;
  source: JobSource;
  status: ScrapeRunStatus;
  jobsFound: number;
  error: string | null;
  runAt: string; // ISO 8601
}

export interface NewScrapeRun {
  source: JobSource;
  status: ScrapeRunStatus;
  jobsFound: number;
  error?: string | null;
}
