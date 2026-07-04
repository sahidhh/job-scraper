import type { JobSource } from "@/shared/domain/enums";
import type { NewScrapeRun, ScrapeRun } from "./types";

export interface ScrapeRunRepository {
  /** One row per source per cron run (scrapers.md §4). */
  recordRun(run: NewScrapeRun): Promise<void>;

  /** Most recent runs first, for the /settings observability view. */
  listRecent(limit: number): Promise<ScrapeRun[]>;

  /**
   * Most recent runs for a single source, most recent first (Phase 1 Task
   * 5/7: feeds computeSourceHealthSummary/getFailedSourceReport). Unlike
   * listRecent, this covers company-config-free sources (wellfound,
   * remoteok, mycareersfuture) too, since scrape_runs is written per source
   * regardless of whether it has `companies` rows.
   */
  listRecentBySource(source: JobSource, limit: number): Promise<ScrapeRun[]>;
}
