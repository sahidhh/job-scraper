import { describe, expect, it } from "vitest";
import { computeJobsByExperience } from "./computeJobsByExperience";
import type { JobsByExperiencePoint } from "@/features/insights/domain/types";

describe("computeJobsByExperience", () => {
  it("returns empty array for empty input", () => {
    expect(computeJobsByExperience([])).toEqual([]);
  });

  it("counts each distinct minYears value", () => {
    const result = computeJobsByExperience([
      { minYears: 2 },
      { minYears: 2 },
      { minYears: 5 },
    ]);
    expect(result).toEqual<JobsByExperiencePoint[]>([
      { minYears: 2, count: 2 },
      { minYears: 5, count: 1 },
    ]);
  });

  it("sorts ascending by minYears", () => {
    const result = computeJobsByExperience([
      { minYears: 10 },
      { minYears: 1 },
      { minYears: 5 },
    ]);
    expect(result.map((p) => p.minYears)).toEqual([1, 5, 10]);
  });

  it("places null last", () => {
    const result = computeJobsByExperience([
      { minYears: null },
      { minYears: 3 },
      { minYears: 0 },
    ]);
    expect(result.map((p) => p.minYears)).toEqual([0, 3, null]);
  });

  it("counts null entries correctly", () => {
    const result = computeJobsByExperience([
      { minYears: null },
      { minYears: null },
      { minYears: 2 },
    ]);
    expect(result).toEqual<JobsByExperiencePoint[]>([
      { minYears: 2, count: 1 },
      { minYears: null, count: 2 },
    ]);
  });

  it("handles a single entry", () => {
    const result = computeJobsByExperience([{ minYears: 7 }]);
    expect(result).toEqual<JobsByExperiencePoint[]>([{ minYears: 7, count: 1 }]);
  });
});
