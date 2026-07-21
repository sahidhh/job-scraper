import { describe, expect, it } from "vitest";
import { computeJobStats } from "./computeJobStats";

type Row = Parameters<typeof computeJobStats>[0][number];

function row(overrides: Partial<Row> = {}): Row {
  return { keywordScore: 0.5, aiScore: null, ineligibleReason: null, retryCount: 0, ...overrides };
}

describe("computeJobStats", () => {
  it("counts an AI-scored job as scored", () => {
    const stats = computeJobStats([row({ aiScore: 0.8 })], 0.25, 3);
    expect(stats).toEqual({
      scoredCount: 1,
      awaitingAiCount: 0,
      abandonedCount: 0,
      lowMatchCount: 0,
      ineligibleCount: 0,
      total: 1,
    });
  });

  it("separates the genuine AI-retry queue from jobs skipped below the keyword gate", () => {
    // The distinction the old dashboard collapsed: both rows have ai_score
    // null, but only the first will ever be picked up by score.ts again.
    const stats = computeJobStats([row({ keywordScore: 0.4 }), row({ keywordScore: 0.1 })], 0.25, 3);
    expect(stats.awaitingAiCount).toBe(1);
    expect(stats.lowMatchCount).toBe(1);
  });

  it("treats a keyword score exactly at the threshold as queued, matching scoreJob's >= gate", () => {
    expect(computeJobStats([row({ keywordScore: 0.25 })], 0.25, 3).awaitingAiCount).toBe(1);
  });

  it("counts a hard-excluded job as ineligible even when it cleared the keyword gate", () => {
    const stats = computeJobStats([row({ keywordScore: 0.9, ineligibleReason: "geo_locked" })], 0.25, 3);
    expect(stats.ineligibleCount).toBe(1);
    expect(stats.awaitingAiCount).toBe(0);
  });

  it("counts a job with no score row at all as ineligible, not as queued", () => {
    expect(computeJobStats([row({ keywordScore: null })], 0.25, 3).ineligibleCount).toBe(1);
  });

  it("moves a job that hit the retry cap out of the queue and into 'gave up'", () => {
    // The only bucket that was costing money: at the cap, score.ts stops
    // paying for further attempts (AD-52).
    const stats = computeJobStats([row({ keywordScore: 0.9, retryCount: 3 })], 0.25, 3);
    expect(stats.abandonedCount).toBe(1);
    expect(stats.awaitingAiCount).toBe(0);
  });

  it("keeps a job one attempt below the cap in the retry queue", () => {
    const stats = computeJobStats([row({ keywordScore: 0.9, retryCount: 2 })], 0.25, 3);
    expect(stats.awaitingAiCount).toBe(1);
    expect(stats.abandonedCount).toBe(0);
  });

  it("does not count a successfully-scored job as abandoned however many retries it took", () => {
    const stats = computeJobStats([row({ aiScore: 0.7, retryCount: 9 })], 0.25, 3);
    expect(stats.scoredCount).toBe(1);
    expect(stats.abandonedCount).toBe(0);
  });

  it("partitions the input exactly -- the five buckets always sum to total", () => {
    const rows = [
      row({ aiScore: 0.9 }),
      row({ keywordScore: 0.4 }),
      row({ keywordScore: 0.05 }),
      row({ ineligibleReason: "no_sponsorship" }),
      row({ keywordScore: null }),
      row({ keywordScore: 0.9, retryCount: 5 }),
    ];
    const stats = computeJobStats(rows, 0.25, 3);
    expect(
      stats.scoredCount + stats.awaitingAiCount + stats.abandonedCount + stats.lowMatchCount + stats.ineligibleCount,
    ).toBe(stats.total);
    expect(stats.total).toBe(6);
  });

  it("returns all-zero counts for an empty set", () => {
    expect(computeJobStats([], 0.25, 3)).toEqual({
      scoredCount: 0,
      awaitingAiCount: 0,
      abandonedCount: 0,
      lowMatchCount: 0,
      ineligibleCount: 0,
      total: 0,
    });
  });
});
