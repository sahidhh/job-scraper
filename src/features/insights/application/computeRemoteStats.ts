import type { RemoteStats } from "@/features/insights/domain/types";

/** Percentage of jobs tagged "remote" among all jobs (Phase 4 Task 13). */
export function computeRemoteStats(rows: readonly { locationTags: string[] }[]): RemoteStats {
  const totalCount = rows.length;
  const remoteCount = rows.filter((row) => row.locationTags.includes("remote")).length;

  return {
    remoteCount,
    totalCount,
    remotePercentage: totalCount === 0 ? 0 : (remoteCount / totalCount) * 100,
  };
}
