import { describe, expect, it } from "vitest";
import type { CheckResult } from "../domain/types";
import { computeHealthScore } from "./computeHealthScore";

function makeResult(overrides: Partial<CheckResult>): CheckResult {
  return {
    id: "test",
    name: "Test",
    category: "infrastructure",
    severity: "medium",
    status: "pass",
    summary: "ok",
    durationMs: 1,
    ...overrides,
  };
}

describe("computeHealthScore", () => {
  it("scores all-pass results as 100 and ready", () => {
    const health = computeHealthScore([makeResult({}), makeResult({ id: "b" })]);

    expect(health.score).toBe(100);
    expect(health.verdict).toBe("ready");
    expect(health.totals).toEqual({ pass: 2, warning: 0, fail: 0 });
    expect(health.criticalFailures).toBe(0);
  });

  it("marks not_ready when any critical-severity check fails, regardless of score", () => {
    const health = computeHealthScore([
      makeResult({ severity: "critical", status: "fail", summary: "down" }),
      makeResult({ id: "b" }),
      makeResult({ id: "c" }),
    ]);

    expect(health.criticalFailures).toBe(1);
    expect(health.verdict).toBe("not_ready");
  });

  it("marks needs_attention for a non-critical fail or any warning", () => {
    const failOnly = computeHealthScore([makeResult({ severity: "low", status: "fail", summary: "minor" })]);
    expect(failOnly.verdict).toBe("needs_attention");

    const warningOnly = computeHealthScore([makeResult({ status: "warning", summary: "heads up" })]);
    expect(warningOnly.verdict).toBe("needs_attention");
  });

  it("weights score deductions by severity and halves the deduction for warnings", () => {
    const health = computeHealthScore([
      makeResult({ severity: "critical", status: "fail", summary: "x" }), // -25
      makeResult({ id: "b", severity: "low", status: "warning", summary: "y" }), // -1.5
    ]);

    // 100 - 25 - 1.5 = 73.5, rounded to the nearest integer.
    expect(health.score).toBe(74);
  });

  it("never lets the score go below zero", () => {
    const results = Array.from({ length: 10 }, (_, i) =>
      makeResult({ id: `f${i}`, severity: "critical", status: "fail", summary: "x" }),
    );

    const health = computeHealthScore(results);

    expect(health.score).toBe(0);
  });

  it("collects recommendations only from non-pass results", () => {
    const health = computeHealthScore([
      makeResult({ status: "pass", recommendation: "should not appear" }),
      makeResult({ id: "b", status: "warning", summary: "w", recommendation: "fix warning" }),
      makeResult({ id: "c", status: "fail", severity: "low", summary: "f", recommendation: "fix fail" }),
    ]);

    expect(health.recommendations).toEqual(["fix warning", "fix fail"]);
  });
});
