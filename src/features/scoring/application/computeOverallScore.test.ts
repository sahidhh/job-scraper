import { describe, expect, it } from "vitest";
import type { Job } from "@/features/jobs/domain/types";
import { computeOverallScore } from "./computeOverallScore";

function makeJob(
  overrides: Partial<Job> = {},
): Pick<Job, "canonicalCompanyName" | "locationTags" | "salaryMin" | "salaryMax" | "visaSponsorship"> {
  return {
    canonicalCompanyName: "Acme",
    locationTags: ["india"],
    salaryMin: null,
    salaryMax: null,
    visaSponsorship: null,
    ...overrides,
  };
}

describe("computeOverallScore", () => {
  it("returns the bare aiScore with no reasons when no preferences are set", () => {
    const result = computeOverallScore(makeJob(), 0.7, {});
    expect(result.overallScore).toBe(0.7);
    expect(result.reasons).toEqual([]);
  });

  it("applies the preferred-company bonus (case-insensitive substring match)", () => {
    const result = computeOverallScore(makeJob({ canonicalCompanyName: "Acme Corp" }), 0.7, {
      preferredCompanies: ["acme"],
    });
    expect(result.overallScore).toBeCloseTo(0.75, 5);
    expect(result.reasons).toEqual(["preferred company"]);
  });

  it("does not apply the company bonus when no preferred company matches", () => {
    const result = computeOverallScore(makeJob({ canonicalCompanyName: "Globex" }), 0.7, {
      preferredCompanies: ["acme"],
    });
    expect(result.overallScore).toBe(0.7);
    expect(result.reasons).toEqual([]);
  });

  it("applies the remote bonus only when preferRemote is true and the job is tagged remote", () => {
    const remoteJob = makeJob({ locationTags: ["remote"] });
    expect(computeOverallScore(remoteJob, 0.7, { preferRemote: true }).reasons).toEqual(["remote"]);
    expect(computeOverallScore(remoteJob, 0.7, { preferRemote: false }).reasons).toEqual([]);
    expect(computeOverallScore(makeJob({ locationTags: ["india"] }), 0.7, { preferRemote: true }).reasons).toEqual([]);
  });

  it("applies the salary bonus when either salaryMin or salaryMax is present", () => {
    expect(computeOverallScore(makeJob({ salaryMin: 100000 }), 0.7, {}).reasons).toEqual(["salary disclosed"]);
    expect(computeOverallScore(makeJob({ salaryMax: 150000 }), 0.7, {}).reasons).toEqual(["salary disclosed"]);
    expect(computeOverallScore(makeJob(), 0.7, {}).reasons).toEqual([]);
  });

  it("applies the sponsorship bonus only when visaSponsorship is explicitly true", () => {
    expect(computeOverallScore(makeJob({ visaSponsorship: true }), 0.7, {}).reasons).toEqual([
      "offers visa sponsorship",
    ]);
    expect(computeOverallScore(makeJob({ visaSponsorship: true }), 0.7, {}).overallScore).toBeCloseTo(0.74, 5);
    // null ("unknown") and false must not earn the bonus.
    expect(computeOverallScore(makeJob({ visaSponsorship: null }), 0.7, {}).reasons).toEqual([]);
    expect(computeOverallScore(makeJob({ visaSponsorship: false }), 0.7, {}).reasons).toEqual([]);
  });

  it("respects a custom sponsorshipBonus amount", () => {
    const result = computeOverallScore(makeJob({ visaSponsorship: true }), 0.7, { sponsorshipBonus: 0.1 });
    expect(result.overallScore).toBeCloseTo(0.8, 5);
  });

  it("stacks all applicable bonuses", () => {
    const job = makeJob({
      canonicalCompanyName: "Acme",
      locationTags: ["remote"],
      salaryMin: 100000,
      visaSponsorship: true,
    });
    const result = computeOverallScore(job, 0.6, { preferredCompanies: ["acme"], preferRemote: true });
    expect(result.overallScore).toBeCloseTo(0.6 + 0.05 + 0.03 + 0.02 + 0.04, 5);
    expect(result.reasons).toEqual(["preferred company", "remote", "offers visa sponsorship", "salary disclosed"]);
  });

  it("respects custom bonus amounts", () => {
    const job = makeJob({ canonicalCompanyName: "Acme" });
    const result = computeOverallScore(job, 0.7, { preferredCompanies: ["acme"], companyBonus: 0.2 });
    expect(result.overallScore).toBeCloseTo(0.9, 5);
  });

  it("caps the overall score at 1", () => {
    const job = makeJob({ canonicalCompanyName: "Acme", locationTags: ["remote"], salaryMin: 100000 });
    const result = computeOverallScore(job, 0.95, { preferredCompanies: ["acme"], preferRemote: true });
    expect(result.overallScore).toBe(1);
  });

  it("ignores blank entries in preferredCompanies", () => {
    const result = computeOverallScore(makeJob(), 0.7, { preferredCompanies: ["", "   "] });
    expect(result.reasons).toEqual([]);
  });
});
