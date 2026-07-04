import { describe, expect, it } from "vitest";
import { computeRemoteStats } from "./computeRemoteStats";

describe("computeRemoteStats", () => {
  it("returns zeroed stats for no rows", () => {
    expect(computeRemoteStats([])).toEqual({ remoteCount: 0, totalCount: 0, remotePercentage: 0 });
  });

  it("computes the remote percentage across all jobs", () => {
    const rows = [
      { locationTags: ["remote"] },
      { locationTags: ["india"] },
      { locationTags: ["remote", "singapore"] },
      { locationTags: ["uae"] },
    ];
    expect(computeRemoteStats(rows)).toEqual({ remoteCount: 2, totalCount: 4, remotePercentage: 50 });
  });

  it("counts a job with no location tags as non-remote", () => {
    const rows = [{ locationTags: [] }, { locationTags: ["remote"] }];
    expect(computeRemoteStats(rows)).toEqual({ remoteCount: 1, totalCount: 2, remotePercentage: 50 });
  });
});
