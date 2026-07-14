import { describe, expect, it } from "vitest";
import { cosineSimilarity, cosineSimilarityToScore } from "./embeddingSimilarity";

describe("cosineSimilarity", () => {
  it("returns 1 for identical-direction vectors", () => {
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns -1 for opposite-direction vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("returns 0 when either vector has zero magnitude", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(cosineSimilarity([1, 1], [0, 0])).toBe(0);
  });
});

describe("cosineSimilarityToScore", () => {
  it("applies the continuous (sim+1)/2 mapping to negative similarities", () => {
    expect(cosineSimilarityToScore(-1)).toBeCloseTo(0);
    expect(cosineSimilarityToScore(-0.4)).toBeCloseTo(0.3);
  });

  it("applies the same continuous mapping to positive similarities -- no branch at zero (jobhunt bug #1)", () => {
    // The buggy reference implementation only remapped sim < 0 and passed
    // positive similarities through raw, so 0.2 would have scored 0.2
    // instead of the continuous (0.2+1)/2 = 0.6.
    expect(cosineSimilarityToScore(0.2)).toBeCloseTo(0.6);
  });

  it("maps a low-but-positive similarity below 0.3 continuously, not specially", () => {
    expect(cosineSimilarityToScore(0.1)).toBeCloseTo(0.55);
  });

  it("maps sim=0 to the midpoint 0.5", () => {
    expect(cosineSimilarityToScore(0)).toBeCloseTo(0.5);
  });

  it("maps sim=1 to 1 and clamps values outside [-1, 1]", () => {
    expect(cosineSimilarityToScore(1)).toBeCloseTo(1);
    expect(cosineSimilarityToScore(1.5)).toBe(1);
    expect(cosineSimilarityToScore(-1.5)).toBe(0);
  });
});
