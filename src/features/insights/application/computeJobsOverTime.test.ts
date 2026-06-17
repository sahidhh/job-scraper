import { describe, expect, it } from "vitest";
import { computeJobsOverTime } from "./computeJobsOverTime";
import type { JobsOverTimePoint } from "@/features/insights/domain/types";

describe("computeJobsOverTime", () => {
  it("returns empty array for empty input", () => {
    expect(computeJobsOverTime([])).toEqual([]);
  });

  it("sums jobsFound for two runs on the same date into a single point", () => {
    const result = computeJobsOverTime([
      { runAt: "2024-03-01T08:00:00Z", jobsFound: 10, source: "LinkedIn" },
      { runAt: "2024-03-01T20:00:00Z", jobsFound: 5, source: "LinkedIn" },
    ]);
    expect(result).toEqual<JobsOverTimePoint[]>([
      { date: "2024-03-01", count: 15 },
    ]);
  });

  it("returns two points sorted by date ascending for runs on different dates", () => {
    const result = computeJobsOverTime([
      { runAt: "2024-03-02T08:00:00Z", jobsFound: 7, source: "Indeed" },
      { runAt: "2024-03-01T08:00:00Z", jobsFound: 3, source: "Indeed" },
    ]);
    expect(result).toEqual<JobsOverTimePoint[]>([
      { date: "2024-03-01", count: 3 },
      { date: "2024-03-02", count: 7 },
    ]);
  });

  it("combines runs from different sources on the same date into one point", () => {
    const result = computeJobsOverTime([
      { runAt: "2024-03-05T09:00:00Z", jobsFound: 12, source: "LinkedIn" },
      { runAt: "2024-03-05T11:00:00Z", jobsFound: 8, source: "Indeed" },
    ]);
    expect(result).toEqual<JobsOverTimePoint[]>([
      { date: "2024-03-05", count: 20 },
    ]);
  });

  it("handles a single run correctly", () => {
    const result = computeJobsOverTime([
      { runAt: "2024-06-15T00:00:00Z", jobsFound: 42, source: "Glassdoor" },
    ]);
    expect(result).toEqual<JobsOverTimePoint[]>([
      { date: "2024-06-15", count: 42 },
    ]);
  });

  it("sorts multiple distinct dates ascending regardless of input order", () => {
    const result = computeJobsOverTime([
      { runAt: "2024-04-03T00:00:00Z", jobsFound: 1, source: "X" },
      { runAt: "2024-04-01T00:00:00Z", jobsFound: 2, source: "X" },
      { runAt: "2024-04-02T00:00:00Z", jobsFound: 3, source: "X" },
    ]);
    expect(result.map((p) => p.date)).toEqual([
      "2024-04-01",
      "2024-04-02",
      "2024-04-03",
    ]);
  });
});
