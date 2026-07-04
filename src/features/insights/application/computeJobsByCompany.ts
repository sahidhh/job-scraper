import type { JobsByCompanyEntry } from "@/features/insights/domain/types";

const TOP_N = 10;

/** Top N companies by active job count, descending (Phase 4 Task 13). */
export function computeJobsByCompany(rows: readonly { companyName: string }[]): JobsByCompanyEntry[] {
  const countMap = new Map<string, number>();

  for (const row of rows) {
    countMap.set(row.companyName, (countMap.get(row.companyName) ?? 0) + 1);
  }

  return [...countMap.entries()]
    .map(([company, count]) => ({ company, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N);
}
