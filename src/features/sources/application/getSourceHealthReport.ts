import { JOB_SOURCES } from "@/shared/domain/enums";
import type { ScrapeRunRepository } from "@/features/sources/domain/ScrapeRunRepository";
import { computeSourceHealthSummary, type SourceHealthSummary } from "./computeSourceHealthSummary";

const DEFAULT_RUN_WINDOW = 20;

/**
 * Health summary for every registered source (Phase 1 Task 5/7 operational
 * visibility) -- covers board-token sources (greenhouse/lever/ashby) and
 * feed-based sources (wellfound/remoteok/mycareersfuture) uniformly, since
 * it reads from scrape_runs rather than the companies table.
 */
export async function getSourceHealthReport(
  scrapeRunRepository: ScrapeRunRepository,
  runWindow: number = DEFAULT_RUN_WINDOW,
): Promise<SourceHealthSummary[]> {
  return Promise.all(
    JOB_SOURCES.map(async (source) => {
      const runs = await scrapeRunRepository.listRecentBySource(source, runWindow);
      return computeSourceHealthSummary(source, runs);
    }),
  );
}
