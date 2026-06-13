import { describe, expect, it } from "vitest";
import type { NormalizedJob } from "@/features/jobs/domain/types";
import { dedupeJobs } from "./dedupeJobs";

function makeJob(overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    source: "greenhouse",
    sourceJobId: "123",
    companyId: null,
    companyName: "Acme",
    title: "Software Engineer",
    locationRaw: "Remote",
    locationTags: ["remote"],
    description: "Build things.",
    url: "https://example.com/jobs/123",
    postedAt: null,
    ...overrides,
  };
}

describe("dedupeJobs", () => {
  it("returns jobs unchanged when no duplicates exist", () => {
    const jobs = [makeJob({ sourceJobId: "1" }), makeJob({ sourceJobId: "2" })];

    expect(dedupeJobs(jobs)).toEqual(jobs);
  });

  it("collapses duplicates by (source, sourceJobId), keeping the last occurrence's data", () => {
    const first = makeJob({ sourceJobId: "1", title: "Old Title" });
    const second = makeJob({ sourceJobId: "1", title: "New Title" });

    const result = dedupeJobs([first, second]);

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("New Title");
  });

  it("treats the same sourceJobId from different sources as distinct", () => {
    const greenhouse = makeJob({ source: "greenhouse", sourceJobId: "1" });
    const lever = makeJob({ source: "lever", sourceJobId: "1" });

    expect(dedupeJobs([greenhouse, lever])).toHaveLength(2);
  });

  it("preserves first-occurrence ordering", () => {
    const a = makeJob({ sourceJobId: "a" });
    const b = makeJob({ sourceJobId: "b" });
    const aAgain = makeJob({ sourceJobId: "a", title: "Updated A" });

    const result = dedupeJobs([a, b, aAgain]);

    expect(result.map((j) => j.sourceJobId)).toEqual(["a", "b"]);
    expect(result[0]?.title).toBe("Updated A");
  });

  it("returns an empty array for empty input", () => {
    expect(dedupeJobs([])).toEqual([]);
  });
});
