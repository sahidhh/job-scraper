import { describe, expect, it } from "vitest";
import { computePipelineStats } from "./computePipelineStats";

describe("computePipelineStats", () => {
  it("returns zeroed/null stats for no rows", () => {
    expect(computePipelineStats([])).toEqual({
      totalRuns: 0,
      failedRuns: 0,
      totalDuplicates: 0,
      avgDurationMs: null,
    });
  });

  it("counts failed runs, sums duplicates, and averages duration across runs that recorded one", () => {
    const rows = [
      { status: "success", durationMs: 1000, duplicateCount: 2 },
      { status: "failed", durationMs: 2000, duplicateCount: null },
      { status: "success", durationMs: null, duplicateCount: 3 },
    ];
    expect(computePipelineStats(rows)).toEqual({
      totalRuns: 3,
      failedRuns: 1,
      totalDuplicates: 5,
      avgDurationMs: 1500,
    });
  });
});
