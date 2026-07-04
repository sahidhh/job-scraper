import { describe, expect, it } from "vitest";
import type { Check } from "../domain/types";
import { runChecks } from "./runChecks";

function makeCheck(overrides: Partial<Check> & Pick<Check, "run">): Check {
  return {
    id: "test.check",
    name: "Test check",
    category: "infrastructure",
    severity: "medium",
    ...overrides,
  };
}

describe("runChecks", () => {
  it("records a passing check with its status and duration", async () => {
    const check = makeCheck({ run: async () => ({ status: "pass", summary: "all good" }) });

    const run = await runChecks([check]);

    expect(run.results).toHaveLength(1);
    expect(run.results[0]).toMatchObject({ id: "test.check", status: "pass", summary: "all good" });
    expect(run.results[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("converts a thrown error into a fail result instead of aborting", async () => {
    const okCheck = makeCheck({ id: "ok", run: async () => ({ status: "pass", summary: "fine" }) });
    const throwingCheck = makeCheck({ id: "throws", run: async () => { throw new Error("boom"); } });

    const run = await runChecks([throwingCheck, okCheck]);

    expect(run.results).toHaveLength(2);
    expect(run.results[0]).toMatchObject({ id: "throws", status: "fail" });
    expect(run.results[0]!.summary).toContain("boom");
    // The check after the throwing one still runs.
    expect(run.results[1]).toMatchObject({ id: "ok", status: "pass" });
  });

  it("preserves check ordering and metadata", async () => {
    const checks = [
      makeCheck({ id: "a", category: "external", severity: "high", run: async () => ({ status: "pass", summary: "a" }) }),
      makeCheck({ id: "b", category: "data-quality", severity: "low", run: async () => ({ status: "warning", summary: "b" }) }),
    ];

    const run = await runChecks(checks);

    expect(run.results.map((r) => r.id)).toEqual(["a", "b"]);
    expect(run.results[0]).toMatchObject({ category: "external", severity: "high" });
    expect(run.results[1]).toMatchObject({ category: "data-quality", severity: "low" });
  });

  it("stamps generatedAt from the injected clock", async () => {
    const fixedNow = new Date("2026-01-01T00:00:00.000Z");

    const run = await runChecks([], () => fixedNow);

    expect(run.generatedAt).toBe(fixedNow.toISOString());
  });
});
