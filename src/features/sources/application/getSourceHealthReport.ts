import { JOB_SOURCES, type JobSource } from "@/shared/domain/enums";
import type { ScrapeRunRepository } from "@/features/sources/domain/ScrapeRunRepository";
import { computeSourceHealthSummary, type SourceHealthSummary } from "./computeSourceHealthSummary";

const DEFAULT_RUN_WINDOW = 20;

/**
 * Health summary for registered (or enabled) sources -- covers board-token
 * sources (greenhouse/lever/ashby) and feed-based sources uniformly, since
 * it reads from scrape_runs rather than the companies table.
 */
export async function getSourceHealthReport(
  scrapeRunRepository: ScrapeRunRepository,
  runWindow: number = DEFAULT_RUN_WINDOW,
  enabledSources?: readonly JobSource[],
): Promise<SourceHealthSummary[]> {
  const sources = enabledSources
    ? JOB_SOURCES.filter((s) => enabledSources.includes(s))
    : JOB_SOURCES;

  return Promise.all(
    sources.map(async (source) => {
      const runs = await scrapeRunRepository.listRecentBySource(source, runWindow);
      return computeSourceHealthSummary(source, runs);
    }),
  );
}
