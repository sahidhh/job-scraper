import type {
  ScrapeRunDataPoint,
  JobsBySourceEntry,
} from "@/features/insights/domain/types";

export function computeJobsBySource(
  runs: readonly ScrapeRunDataPoint[],
): JobsBySourceEntry[] {
  const sourceMap = new Map<string, number>();

  for (const run of runs) {
    sourceMap.set(run.source, (sourceMap.get(run.source) ?? 0) + run.jobsFound);
  }

  return [...sourceMap.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}
