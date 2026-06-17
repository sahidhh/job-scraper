import { describe, expect, it } from "vitest";
import { computeJobsBySource } from "./computeJobsBySource";
import type { JobsBySourceEntry } from "@/features/insights/domain/types";

describe("computeJobsBySource", () => {
  it("returns empty array for empty input", () => {
    expect(computeJobsBySource([])).toEqual([]);
  });

  it("sums jobsFound across two runs from the same source into one entry", () => {
    const result = computeJobsBySource([
      { runAt: "2024-03-01T08:00:00Z", jobsFound: 10, source: "LinkedIn" },
      { runAt: "2024-03-02T08:00:00Z", jobsFound: 15, source: "LinkedIn" },
    ]);
    expect(result).toEqual<JobsBySourceEntry[]>([
      { source: "LinkedIn", count: 25 },
    ]);
  });

  it("sorts multiple sources by count descending", () => {
    const result = computeJobsBySource([
      { runAt: "2024-03-01T00:00:00Z", jobsFound: 5, source: "Indeed" },
      { runAt: "2024-03-01T00:00:00Z", jobsFound: 20, source: "LinkedIn" },
      { runAt: "2024-03-01T00:00:00Z", jobsFound: 10, source: "Glassdoor" },
    ]);
    expect(result.map((e) => e.source)).toEqual([
      "LinkedIn",
      "Glassdoor",
      "Indeed",
    ]);
    expect(result.map((e) => e.count)).toEqual([20, 10, 5]);
  });

  it("sorts alphabetically ascending by source name when counts are equal", () => {
    const result = computeJobsBySource([
      { runAt: "2024-03-01T00:00:00Z", jobsFound: 10, source: "Zebra" },
      { runAt: "2024-03-01T00:00:00Z", jobsFound: 10, source: "Alpha" },
      { runAt: "2024-03-01T00:00:00Z", jobsFound: 10, source: "Mango" },
    ]);
    expect(result.map((e) => e.source)).toEqual(["Alpha", "Mango", "Zebra"]);
  });

  it("handles a single run correctly", () => {
    const result = computeJobsBySource([
      { runAt: "2024-03-01T00:00:00Z", jobsFound: 7, source: "Indeed" },
    ]);
    expect(result).toEqual<JobsBySourceEntry[]>([{ source: "Indeed", count: 7 }]);
  });

  it("accumulates correctly across many runs for multiple sources", () => {
    const result = computeJobsBySource([
      { runAt: "2024-03-01T00:00:00Z", jobsFound: 3, source: "A" },
      { runAt: "2024-03-02T00:00:00Z", jobsFound: 7, source: "B" },
      { runAt: "2024-03-03T00:00:00Z", jobsFound: 2, source: "A" },
      { runAt: "2024-03-04T00:00:00Z", jobsFound: 1, source: "B" },
    ]);
    expect(result).toEqual<JobsBySourceEntry[]>([
      { source: "B", count: 8 },
      { source: "A", count: 5 },
    ]);
  });
});
