import type { JobSource, ScrapeRunStatus } from "@/shared/domain/enums";
import type { FailureCategory } from "./classifyScrapeFailure";

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

// scrape_runs observability log (docs/operations/observability.md).
export interface ScrapeRun {
  id: string;
  source: JobSource;
  status: ScrapeRunStatus;
  /** Raw jobs returned by the adapter before any filtering. */
  foundCount: number;
  /** Jobs that passed the location filter (null for runs before migration). */
  keptCount: number | null;
  /** Jobs inserted as new rows (null for runs before migration). */
  insertedCount: number | null;
  /** Jobs updated via upsert (null for runs before migration). */
  updatedCount: number | null;
  /** Jobs skipped as cross-source fingerprint duplicates (null for runs before migration). */
  duplicateCount: number | null;
  /** Processing errors within the run (0 when the whole source failed). */
  failedCount: number;
  /**
   * Deterministic failure classification (Phase 1 Task 5/7,
   * classifyScrapeFailure.ts). Set when status='failed' (why the adapter
   * threw), or 'empty_feed' on an otherwise-successful run that found zero
   * jobs. Null when the run succeeded normally.
   */
  failureCategory: FailureCategory | null;
  startedAt: string | null; // ISO 8601
  completedAt: string | null; // ISO 8601
  durationMs: number | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
  runAt: string; // ISO 8601 — set by DB default, used for ordering
}

export interface NewScrapeRun {
  source: JobSource;
  status: ScrapeRunStatus;
  foundCount: number;
  keptCount?: number | null;
  insertedCount?: number | null;
  updatedCount?: number | null;
  duplicateCount?: number | null;
  failedCount?: number;
  failureCategory?: FailureCategory | null;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
}
