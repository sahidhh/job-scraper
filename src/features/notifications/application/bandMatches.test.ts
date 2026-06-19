import { describe, expect, it } from "vitest";
import type { JobMatch } from "@/features/notifications/domain/types";
import { STRONG_MATCH_THRESHOLD } from "@/features/notifications/domain/types";
import { bandMatches } from "./bandMatches";

function makeMatch(overrides: Partial<JobMatch> = {}): JobMatch {
  return {
    jobId: "job-1",
    title: "Senior Engineer",
    companyName: "Acme",
    locationTags: ["remote"],
    source: "greenhouse",
    url: "https://example.com/jobs/1",
    aiScore: 0.85,
    aiReasoning: null,
    description: "A great job.",
    minYears: null,
    ...overrides,
  };
}

describe("bandMatches", () => {
  it("places a job with score >= strongThreshold into strongMatches", () => {
    const match = makeMatch({ aiScore: STRONG_MATCH_THRESHOLD });
    const { strongMatches, worthReviewing } = bandMatches([match], STRONG_MATCH_THRESHOLD);
    expect(strongMatches).toHaveLength(1);
    expect(worthReviewing).toHaveLength(0);
  });

  it("places a job with score < strongThreshold into worthReviewing", () => {
    const match = makeMatch({ aiScore: STRONG_MATCH_THRESHOLD - 0.01 });
    const { strongMatches, worthReviewing } = bandMatches([match], STRONG_MATCH_THRESHOLD);
    expect(strongMatches).toHaveLength(0);
    expect(worthReviewing).toHaveLength(1);
  });

  it("splits a mixed list correctly", () => {
    const matches = [
      makeMatch({ jobId: "a", aiScore: 0.90 }),
      makeMatch({ jobId: "b", aiScore: 0.75 }),
      makeMatch({ jobId: "c", aiScore: 0.82 }),
      makeMatch({ jobId: "d", aiScore: 0.65 }),
    ];
    const { strongMatches, worthReviewing } = bandMatches(matches, STRONG_MATCH_THRESHOLD);
    expect(strongMatches.map((m) => m.jobId)).toEqual(["a", "c"]);
    expect(worthReviewing.map((m) => m.jobId)).toEqual(["b", "d"]);
  });

  it("sorts each band descending by aiScore", () => {
    const matches = [
      makeMatch({ jobId: "low", aiScore: 0.83 }),
      makeMatch({ jobId: "high", aiScore: 0.95 }),
      makeMatch({ jobId: "mid", aiScore: 0.88 }),
    ];
    const { strongMatches } = bandMatches(matches, STRONG_MATCH_THRESHOLD);
    expect(strongMatches[0]!.jobId).toBe("high");
    expect(strongMatches[1]!.jobId).toBe("mid");
    expect(strongMatches[2]!.jobId).toBe("low");
  });

  it("returns empty arrays when given an empty list", () => {
    const { strongMatches, worthReviewing } = bandMatches([], STRONG_MATCH_THRESHOLD);
    expect(strongMatches).toHaveLength(0);
    expect(worthReviewing).toHaveLength(0);
  });

  it("honours a custom strongThreshold", () => {
    const match = makeMatch({ aiScore: 0.70 });
    const { strongMatches } = bandMatches([match], 0.65);
    expect(strongMatches).toHaveLength(1);
  });
});
