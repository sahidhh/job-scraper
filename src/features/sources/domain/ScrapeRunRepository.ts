import type { NewScrapeRun, ScrapeRun } from "./types";

export interface ScrapeRunRepository {
  /** One row per source per cron run (scrapers.md §4). */
  recordRun(run: NewScrapeRun): Promise<void>;

  /** Most recent runs first, for the /settings observability view. */
  listRecent(limit: number): Promise<ScrapeRun[]>;
}
