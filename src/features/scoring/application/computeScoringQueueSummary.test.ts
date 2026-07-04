import { describe, expect, it } from "vitest";
import type { AwaitingScoreJob } from "@/features/scoring/domain/types";
import { computeScoringQueueSummary } from "./computeScoringQueueSummary";

const NOW = new Date("2026-01-10T00:00:00Z");

function makeJob(overrides: Partial<AwaitingScoreJob> = {}): AwaitingScoreJob {
  return { jobId: "job-1", scoredAt: "2026-01-09T00:00:00Z", retryCount: 1, ...overrides };
}

describe("computeScoringQueueSummary", () => {
  it("returns zeroed output for an empty queue", () => {
    const result = computeScoringQueueSummary([], 48, NOW);
    expect(result).toEqual({
      awaitingAiCount: 0,
      oldestPendingScoredAt: null,
      oldestPendingAgeHours: null,
      stuckJobs: [],
      maxRetryCount: 0,
      avgRetryCount: 0,
    });
  });

  it("computes oldestPendingAgeHours from the earliest scoredAt regardless of input order", () => {
    const jobs = [
      makeJob({ jobId: "recent", scoredAt: "2026-01-09T12:00:00Z" }),
      makeJob({ jobId: "oldest", scoredAt: "2026-01-08T00:00:00Z" }),
    ];
    const result = computeScoringQueueSummary(jobs, 48, NOW);
    expect(result.oldestPendingScoredAt).toBe("2026-01-08T00:00:00Z");
    expect(result.oldestPendingAgeHours).toBeCloseTo(48, 5);
  });

  it("flags jobs at or past the stuck threshold, and only those", () => {
    const jobs = [
      makeJob({ jobId: "fresh", scoredAt: "2026-01-09T12:00:00Z" }), // 12h old
      makeJob({ jobId: "stuck", scoredAt: "2026-01-07T00:00:00Z" }), // 72h old
    ];
    const result = computeScoringQueueSummary(jobs, 48, NOW);
    expect(result.stuckJobs.map((j) => j.jobId)).toEqual(["stuck"]);
  });

  it("computes max and average retry count", () => {
    const jobs = [makeJob({ retryCount: 1 }), makeJob({ retryCount: 5 }), makeJob({ retryCount: 3 })];
    const result = computeScoringQueueSummary(jobs, 48, NOW);
    expect(result.maxRetryCount).toBe(5);
    expect(result.avgRetryCount).toBeCloseTo(3, 5);
    expect(result.awaitingAiCount).toBe(3);
  });
});
