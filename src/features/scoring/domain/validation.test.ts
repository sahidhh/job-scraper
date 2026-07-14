import { describe, expect, it } from "vitest";
import { validateNewJobScore, validateRankingPreferences } from "./validation";

describe("validateNewJobScore", () => {
  it("accepts a valid keywordScore-only score", () => {
    expect(() =>
      validateNewJobScore({ jobId: "j1", roleSelectionId: "r1", resumeVersion: 1, keywordScore: 0.5 }),
    ).not.toThrow();
  });

  it("rejects a keywordScore outside [0, 1]", () => {
    expect(() =>
      validateNewJobScore({ jobId: "j1", roleSelectionId: "r1", resumeVersion: 1, keywordScore: 1.5 }),
    ).toThrow();
  });

  it("rejects an aiScore outside [0, 1] when present", () => {
    expect(() =>
      validateNewJobScore({
        jobId: "j1",
        roleSelectionId: "r1",
        resumeVersion: 1,
        keywordScore: 0.5,
        aiScore: -0.1,
      }),
    ).toThrow();
  });

  it("rejects an embeddingScore outside [0, 1] when present", () => {
    expect(() =>
      validateNewJobScore({
        jobId: "j1",
        roleSelectionId: "r1",
        resumeVersion: 1,
        keywordScore: 0.5,
        embeddingScore: 1.1,
      }),
    ).toThrow();
  });

  it("accepts a valid embeddingScore", () => {
    expect(() =>
      validateNewJobScore({
        jobId: "j1",
        roleSelectionId: "r1",
        resumeVersion: 1,
        keywordScore: 0.5,
        embeddingScore: 0.7,
      }),
    ).not.toThrow();
  });
});

describe("validateRankingPreferences", () => {
  it("accepts an empty preferences object", () => {
    expect(() => validateRankingPreferences({})).not.toThrow();
  });

  it("accepts valid bonus amounts", () => {
    expect(() =>
      validateRankingPreferences({ companyBonus: 0.05, remoteBonus: 0.03, salaryBonus: 0.02 }),
    ).not.toThrow();
  });

  it("rejects a negative bonus", () => {
    expect(() => validateRankingPreferences({ companyBonus: -0.1 })).toThrow(/companyBonus/);
  });

  it("rejects a bonus greater than 1", () => {
    expect(() => validateRankingPreferences({ remoteBonus: 1.5 })).toThrow(/remoteBonus/);
  });
});
