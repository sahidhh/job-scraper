import type { SalaryRow } from "@/features/insights/domain/MatchedJobsRepository";
import type { SalaryStatsEntry } from "@/features/insights/domain/types";

/**
 * Average min/max salary per currency (Phase 4 Task 13) -- grouped by
 * currency rather than blended, since different currencies are not
 * comparable without a conversion rate this codebase doesn't have.
 * Rows missing currency or min are excluded (nothing usable to average).
 */
export function computeSalaryStats(rows: readonly SalaryRow[]): SalaryStatsEntry[] {
  const groups = new Map<string, { count: number; sumMin: number; sumMax: number }>();

  for (const row of rows) {
    if (!row.currency || row.min === null) continue;

    const group = groups.get(row.currency) ?? { count: 0, sumMin: 0, sumMax: 0 };
    group.count += 1;
    group.sumMin += row.min;
    group.sumMax += row.max ?? row.min;
    groups.set(row.currency, group);
  }

  return [...groups.entries()]
    .map(([currency, { count, sumMin, sumMax }]) => ({
      currency,
      count,
      avgMin: sumMin / count,
      avgMax: sumMax / count,
    }))
    .sort((a, b) => b.count - a.count);
}
