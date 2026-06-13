import { describe, expect, it } from "vitest";
import { computeKeywordScore } from "./computeKeywordScore";

describe("computeKeywordScore", () => {
  it("returns 0 when the job mentions no dictionary skills", () => {
    expect(computeKeywordScore(["React", "Node.js"], [])).toBe(0);
  });

  it("returns 1 when the resume covers every skill the job mentions", () => {
    expect(computeKeywordScore(["React", "Node.js", "TypeScript"], ["React", "Node.js"])).toBe(1);
  });

  it("returns the fraction of job skills covered by the resume", () => {
    const score = computeKeywordScore(["React"], ["React", "Node.js", "Python"]);

    expect(score).toBeCloseTo(1 / 3);
  });

  it("returns 0 when the resume covers none of the job's skills", () => {
    expect(computeKeywordScore(["Python"], ["React", "Node.js"])).toBe(0);
  });

  it("matches case-insensitively", () => {
    expect(computeKeywordScore(["react", "NODE.JS"], ["React", "Node.js"])).toBe(1);
  });
});
