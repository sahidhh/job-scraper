import { describe, expect, it } from "vitest";
import { computeJobsByLocation } from "./computeJobsByLocation";
import type { JobsByLocationPoint } from "@/features/insights/domain/types";

describe("computeJobsByLocation", () => {
  it("returns empty array for empty input", () => {
    expect(computeJobsByLocation([])).toEqual([]);
  });

  it("counts each distinct location tag", () => {
    const result = computeJobsByLocation([
      { locationTags: ["india"] },
      { locationTags: ["remote"] },
      { locationTags: ["india"] },
    ]);
    expect(result).toEqual<JobsByLocationPoint[]>([
      { location: "india", count: 2 },
      { location: "remote", count: 1 },
    ]);
  });

  it("unnests multiple tags from a single row", () => {
    const result = computeJobsByLocation([
      { locationTags: ["india", "remote"] },
    ]);
    expect(result).toHaveLength(2);
    const india = result.find((p) => p.location === "india");
    const remote = result.find((p) => p.location === "remote");
    expect(india?.count).toBe(1);
    expect(remote?.count).toBe(1);
  });

  it("sorts by count descending", () => {
    const result = computeJobsByLocation([
      { locationTags: ["singapore"] },
      { locationTags: ["india"] },
      { locationTags: ["india"] },
      { locationTags: ["india"] },
      { locationTags: ["remote"] },
      { locationTags: ["remote"] },
    ]);
    expect(result.map((p) => p.location)).toEqual(["india", "remote", "singapore"]);
  });

  it("skips rows with empty locationTags array", () => {
    const result = computeJobsByLocation([
      { locationTags: [] },
      { locationTags: ["uae"] },
    ]);
    expect(result).toEqual<JobsByLocationPoint[]>([{ location: "uae", count: 1 }]);
  });

  it("handles a single row with one tag", () => {
    const result = computeJobsByLocation([{ locationTags: ["singapore"] }]);
    expect(result).toEqual<JobsByLocationPoint[]>([{ location: "singapore", count: 1 }]);
  });
});
