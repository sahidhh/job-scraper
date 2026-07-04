import { describe, expect, it } from "vitest";
import type { JobMatch } from "@/features/notifications/domain/types";
import { buildJobHighlights } from "./buildJobHighlights";

function makeMatch(overrides: Partial<JobMatch> = {}): JobMatch {
  return {
    jobId: "job-1",
    title: "Senior Backend Engineer",
    companyName: "Acme",
    locationTags: ["india"],
    source: "greenhouse",
    url: "https://example.com/jobs/1",
    aiScore: 0.9,
    aiReasoning: null,
    description: "",
    minYears: 3,
    employmentType: "full_time",
    urgentHiring: false,
    salaryCurrency: null,
    salaryMin: null,
    salaryMax: null,
    salaryPeriod: null,
    ...overrides,
  };
}

describe("buildJobHighlights", () => {
  it("returns no highlights for a plain full-time, non-urgent, no-salary, non-remote job", () => {
    expect(buildJobHighlights(makeMatch())).toEqual([]);
  });

  it("includes a remote badge when locationTags includes remote", () => {
    expect(buildJobHighlights(makeMatch({ locationTags: ["remote"] }))).toContain("\u{1F30D} Remote");
  });

  it("includes an urgent-hiring badge", () => {
    expect(buildJobHighlights(makeMatch({ urgentHiring: true }))).toContain("⚡ Urgent hiring");
  });

  it("formats a salary range with currency and period abbreviation", () => {
    const highlights = buildJobHighlights(
      makeMatch({ salaryCurrency: "USD", salaryMin: 120000, salaryMax: 150000, salaryPeriod: "yearly" }),
    );
    expect(highlights).toContain("\u{1F4B0} USD120,000–150,000/yr");
  });

  it("formats a single figure (no max) without a range dash", () => {
    const highlights = buildJobHighlights(makeMatch({ salaryCurrency: "INR", salaryMin: 1800000, salaryMax: 1800000 }));
    expect(highlights).toContain("\u{1F4B0} INR1,800,000");
  });

  it("does not show a badge for full_time (assumed default)", () => {
    expect(buildJobHighlights(makeMatch({ employmentType: "full_time" }))).toEqual([]);
  });

  it("shows a badge for non-full_time employment types", () => {
    expect(buildJobHighlights(makeMatch({ employmentType: "contract" }))).toContain("\u{1F4C4} Contract");
  });

  it("does not show an employment type badge when null (unknown)", () => {
    expect(buildJobHighlights(makeMatch({ employmentType: null }))).toEqual([]);
  });

  it("combines multiple highlights in a stable order", () => {
    const highlights = buildJobHighlights(
      makeMatch({
        locationTags: ["remote"],
        urgentHiring: true,
        salaryCurrency: "USD",
        salaryMin: 100000,
        salaryMax: 100000,
        salaryPeriod: "yearly",
        employmentType: "contract",
      }),
    );
    expect(highlights).toEqual(["\u{1F30D} Remote", "⚡ Urgent hiring", "\u{1F4B0} USD100,000/yr", "\u{1F4C4} Contract"]);
  });
});
