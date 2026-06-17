import { describe, expect, it } from "vitest";
import { bucketScores } from "./bucketScores";
import type { ScoreHistogramBucket } from "@/features/insights/domain/types";

const ALL_ZERO_BUCKETS: ScoreHistogramBucket[] = [
  { bucket: "0–10", count: 0 },
  { bucket: "10–20", count: 0 },
  { bucket: "20–30", count: 0 },
  { bucket: "30–40", count: 0 },
  { bucket: "40–50", count: 0 },
  { bucket: "50–60", count: 0 },
  { bucket: "60–70", count: 0 },
  { bucket: "70–80", count: 0 },
  { bucket: "80–90", count: 0 },
  { bucket: "90–100", count: 0 },
];

describe("bucketScores", () => {
  it("returns exactly 10 buckets all at count 0 for empty input", () => {
    expect(bucketScores([])).toEqual(ALL_ZERO_BUCKETS);
  });

  it("always returns exactly 10 buckets", () => {
    expect(bucketScores([10, 55, 99])).toHaveLength(10);
  });

  it("places score 100 into the '90–100' bucket", () => {
    const result = bucketScores([100]);
    expect(result.find((b) => b.bucket === "90–100")?.count).toBe(1);
    const others = result.filter((b) => b.bucket !== "90–100");
    expect(others.every((b) => b.count === 0)).toBe(true);
  });

  it("places score 0 into the '0–10' bucket", () => {
    const result = bucketScores([0]);
    expect(result.find((b) => b.bucket === "0–10")?.count).toBe(1);
    const others = result.filter((b) => b.bucket !== "0–10");
    expect(others.every((b) => b.count === 0)).toBe(true);
  });

  it("places score 50 into the '50–60' bucket", () => {
    const result = bucketScores([50]);
    expect(result.find((b) => b.bucket === "50–60")?.count).toBe(1);
    const others = result.filter((b) => b.bucket !== "50–60");
    expect(others.every((b) => b.count === 0)).toBe(true);
  });

  it("distributes mixed scores into correct buckets", () => {
    const result = bucketScores([5, 15, 25, 95, 100]);
    expect(result.find((b) => b.bucket === "0–10")?.count).toBe(1);
    expect(result.find((b) => b.bucket === "10–20")?.count).toBe(1);
    expect(result.find((b) => b.bucket === "20–30")?.count).toBe(1);
    expect(result.find((b) => b.bucket === "90–100")?.count).toBe(2);
  });

  it("accumulates multiple scores falling into the same bucket", () => {
    const result = bucketScores([71, 72, 73, 79]);
    expect(result.find((b) => b.bucket === "70–80")?.count).toBe(4);
  });

  it("uses en-dash (–) not hyphen (-) in bucket labels", () => {
    const result = bucketScores([]);
    expect(result[0]!.bucket).toBe("0–10");
    expect(result[0]!.bucket).not.toBe("0-10");
  });

  it("score 10 falls into '10–20' bucket, not '0–10'", () => {
    const result = bucketScores([10]);
    expect(result.find((b) => b.bucket === "10–20")?.count).toBe(1);
    expect(result.find((b) => b.bucket === "0–10")?.count).toBe(0);
  });

  it("score 90 falls into '90–100' bucket", () => {
    const result = bucketScores([90]);
    expect(result.find((b) => b.bucket === "90–100")?.count).toBe(1);
    expect(result.find((b) => b.bucket === "80–90")?.count).toBe(0);
  });
});
