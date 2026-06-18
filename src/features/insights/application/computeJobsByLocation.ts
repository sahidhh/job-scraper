import type { JobsByLocationPoint } from "@/features/insights/domain/types";

export function computeJobsByLocation(
  rows: readonly { locationTags: string[] }[],
): JobsByLocationPoint[] {
  const countMap = new Map<string, number>();

  for (const row of rows) {
    for (const tag of row.locationTags) {
      countMap.set(tag, (countMap.get(tag) ?? 0) + 1);
    }
  }

  return [...countMap.entries()]
    .map(([location, count]) => ({ location, count }))
    .sort((a, b) => b.count - a.count);
}
