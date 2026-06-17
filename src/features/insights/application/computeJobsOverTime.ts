import type {
  ScrapeRunDataPoint,
  JobsOverTimePoint,
} from "@/features/insights/domain/types";

export function computeJobsOverTime(
  runs: readonly ScrapeRunDataPoint[],
): JobsOverTimePoint[] {
  const dateMap = new Map<string, number>();

  for (const run of runs) {
    const date = run.runAt.slice(0, 10);
    dateMap.set(date, (dateMap.get(date) ?? 0) + run.jobsFound);
  }

  return [...dateMap.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
