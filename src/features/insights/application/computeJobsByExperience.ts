import type { JobsByExperiencePoint } from "@/features/insights/domain/types";

export function computeJobsByExperience(
  rows: readonly { minYears: number | null }[],
): JobsByExperiencePoint[] {
  const countMap = new Map<number | null, number>();

  for (const row of rows) {
    const key = row.minYears;
    countMap.set(key, (countMap.get(key) ?? 0) + 1);
  }

  return [...countMap.entries()]
    .map(([minYears, count]) => ({ minYears, count }))
    .sort((a, b) => {
      // null sorts last
      if (a.minYears === null && b.minYears === null) return 0;
      if (a.minYears === null) return 1;
      if (b.minYears === null) return -1;
      return a.minYears - b.minYears;
    });
}
