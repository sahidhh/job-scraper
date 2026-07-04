import { describe, expect, it } from "vitest";
import { computeSalaryStats } from "./computeSalaryStats";

describe("computeSalaryStats", () => {
  it("returns an empty array when no rows have usable salary data", () => {
    expect(computeSalaryStats([])).toEqual([]);
    expect(computeSalaryStats([{ currency: null, min: null, max: null }])).toEqual([]);
    expect(computeSalaryStats([{ currency: "USD", min: null, max: null }])).toEqual([]);
  });

  it("groups by currency and averages min/max", () => {
    const rows = [
      { currency: "USD", min: 100_000, max: 120_000 },
      { currency: "USD", min: 80_000, max: 100_000 },
      { currency: "INR", min: 1_800_000, max: 2_400_000 },
    ];
    expect(computeSalaryStats(rows)).toEqual([
      { currency: "USD", count: 2, avgMin: 90_000, avgMax: 110_000 },
      { currency: "INR", count: 1, avgMin: 1_800_000, avgMax: 2_400_000 },
    ]);
  });

  it("uses min as max when max is null (single-figure salary)", () => {
    const rows = [{ currency: "USD", min: 50_000, max: null }];
    expect(computeSalaryStats(rows)).toEqual([{ currency: "USD", count: 1, avgMin: 50_000, avgMax: 50_000 }]);
  });

  it("sorts by count descending", () => {
    const rows = [
      { currency: "AED", min: 10_000, max: 10_000 },
      { currency: "USD", min: 100_000, max: 100_000 },
      { currency: "USD", min: 90_000, max: 90_000 },
    ];
    expect(computeSalaryStats(rows).map((r) => r.currency)).toEqual(["USD", "AED"]);
  });
});
