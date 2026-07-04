import { describe, expect, it } from "vitest";
import type { ScrapeRun } from "@/features/sources/domain/types";
import { computeSourceHealthSummary } from "./computeSourceHealthSummary";

function makeRun(overrides: Partial<ScrapeRun> = {}): ScrapeRun {
  return {
    id: "run-1",
    source: "greenhouse",
    status: "success",
    foundCount: 10,
    keptCount: 8,
    insertedCount: 5,
    updatedCount: 3,
    duplicateCount: 0,
    failedCount: 0,
    failureCategory: null,
    startedAt: "2026-01-01T00:00:00Z",
    completedAt: "2026-01-01T00:00:01Z",
    durationMs: 1000,
    error: null,
    metadata: null,
    runAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("computeSourceHealthSummary", () => {
  it("returns a zeroed summary with 'no history' recommendation for an empty run list", () => {
    const result = computeSourceHealthSummary("greenhouse", []);
    expect(result.totalRuns).toBe(0);
    expect(result.successRate).toBe(0);
    expect(result.avgLatencyMs).toBeNull();
    expect(result.hoursSinceLastRun).toBeNull();
    expect(result.isStale).toBe(false);
    expect(result.recommendation).toBe("No scrape history yet.");
  });

  it("computes successRate, avgLatencyMs, and 'Healthy' recommendation for an all-success run history", () => {
    const runs = [
      makeRun({ runAt: "2026-01-03T00:00:00Z", durationMs: 2000 }),
      makeRun({ runAt: "2026-01-02T00:00:00Z", durationMs: 1000 }),
      makeRun({ runAt: "2026-01-01T00:00:00Z", durationMs: 3000 }),
    ];
    const now = new Date("2026-01-03T01:00:00Z"); // 1h after the latest run, well within the stale window
    const result = computeSourceHealthSummary("greenhouse", runs, now);
    expect(result.totalRuns).toBe(3);
    expect(result.successCount).toBe(3);
    expect(result.successRate).toBe(1);
    expect(result.avgLatencyMs).toBe(2000);
    expect(result.consecutiveFailures).toBe(0);
    expect(result.isStale).toBe(false);
    expect(result.recommendation).toBe("Healthy.");
  });

  it("counts only the trailing streak of failures as consecutiveFailures, regardless of input order", () => {
    const runs = [
      makeRun({ runAt: "2026-01-01T00:00:00Z", status: "success" }),
      makeRun({ runAt: "2026-01-04T00:00:00Z", status: "failed", failureCategory: "timeout" }),
      makeRun({ runAt: "2026-01-03T00:00:00Z", status: "failed", failureCategory: "timeout" }),
      makeRun({ runAt: "2026-01-02T00:00:00Z", status: "success" }),
    ];
    const now = new Date("2026-01-04T01:00:00Z");
    const result = computeSourceHealthSummary("greenhouse", runs, now);
    expect(result.consecutiveFailures).toBe(2);
    expect(result.lastRunStatus).toBe("failed");
    expect(result.topFailureCategory).toBe("timeout");
    expect(result.recommendation).toContain("timeout");
    expect(result.recommendation).toContain("2 consecutive run(s)");
  });

  it("flags recovery when the latest run succeeded right after a failure", () => {
    const runs = [
      makeRun({ runAt: "2026-01-02T00:00:00Z", status: "success" }),
      makeRun({ runAt: "2026-01-01T00:00:00Z", status: "failed", failureCategory: "blocked" }),
    ];
    const now = new Date("2026-01-02T01:00:00Z");
    const result = computeSourceHealthSummary("greenhouse", runs, now);
    expect(result.recoveryDetected).toBe(true);
    expect(result.consecutiveFailures).toBe(0);
  });

  it("does not flag recovery when the latest two runs both succeeded", () => {
    const runs = [
      makeRun({ runAt: "2026-01-02T00:00:00Z", status: "success" }),
      makeRun({ runAt: "2026-01-01T00:00:00Z", status: "success" }),
    ];
    const now = new Date("2026-01-02T01:00:00Z");
    const result = computeSourceHealthSummary("greenhouse", runs, now);
    expect(result.recoveryDetected).toBe(false);
  });

  it("recommends investigation once consecutiveFailures reaches the disable threshold", () => {
    const threshold = 7;
    const runs = Array.from({ length: threshold }, (_, i) =>
      makeRun({ runAt: `2026-01-0${i + 1}T00:00:00Z`, status: "failed", failureCategory: "not_found" }),
    );
    const now = new Date("2026-01-07T01:00:00Z");
    const result = computeSourceHealthSummary("greenhouse", runs, now);
    expect(result.consecutiveFailures).toBe(threshold);
    expect(result.recommendation).toContain("disable threshold");
  });

  it("flags a healthy-but-empty feed distinctly from fully healthy", () => {
    const runs = [
      makeRun({ runAt: "2026-01-02T00:00:00Z", status: "success", foundCount: 0, failureCategory: "empty_feed" }),
      makeRun({ runAt: "2026-01-01T00:00:00Z", status: "success", foundCount: 0, failureCategory: "empty_feed" }),
    ];
    const now = new Date("2026-01-02T01:00:00Z");
    const result = computeSourceHealthSummary("wellfound", runs, now);
    expect(result.consecutiveFailures).toBe(0);
    expect(result.recommendation).toContain("empty-feed");
  });

  it("tracks lastSuccessAt and lastFailureAt independently of run order", () => {
    const runs = [
      makeRun({ runAt: "2026-01-03T00:00:00Z", status: "failed" }),
      makeRun({ runAt: "2026-01-01T00:00:00Z", status: "success" }),
      makeRun({ runAt: "2026-01-02T00:00:00Z", status: "success" }),
    ];
    const now = new Date("2026-01-03T01:00:00Z");
    const result = computeSourceHealthSummary("greenhouse", runs, now);
    expect(result.lastFailureAt).toBe("2026-01-03T00:00:00Z");
    expect(result.lastSuccessAt).toBe("2026-01-02T00:00:00Z");
  });

  describe("staleness", () => {
    it("is not stale when the last run was within the staleAfterHours window", () => {
      const runs = [makeRun({ runAt: "2026-01-01T00:00:00Z", status: "success" })];
      const now = new Date("2026-01-01T05:00:00Z"); // 5h later, default threshold is 6h
      const result = computeSourceHealthSummary("greenhouse", runs, now);
      expect(result.hoursSinceLastRun).toBeCloseTo(5, 5);
      expect(result.isStale).toBe(false);
      expect(result.recommendation).toBe("Healthy.");
    });

    it("flags stale once the last run exceeds staleAfterHours, even with a healthy run history", () => {
      const runs = [
        makeRun({ runAt: "2026-01-01T00:00:00Z", status: "success" }),
        makeRun({ runAt: "2025-12-31T00:00:00Z", status: "success" }),
      ];
      const now = new Date("2026-01-01T07:00:00Z"); // 7h later, past the default 6h threshold
      const result = computeSourceHealthSummary("greenhouse", runs, now);
      expect(result.hoursSinceLastRun).toBeCloseTo(7, 5);
      expect(result.isStale).toBe(true);
      expect(result.recommendation).toContain("Stale");
      expect(result.recommendation).toContain("7h");
    });

    it("stale recommendation takes priority over a failing-streak recommendation", () => {
      const runs = [makeRun({ runAt: "2026-01-01T00:00:00Z", status: "failed", failureCategory: "timeout" })];
      const now = new Date("2026-01-02T00:00:00Z"); // 24h later -- both stale and "failing"
      const result = computeSourceHealthSummary("greenhouse", runs, now);
      expect(result.isStale).toBe(true);
      expect(result.recommendation).toContain("Stale");
      expect(result.recommendation).not.toContain("consecutive run(s)");
    });
  });
});
