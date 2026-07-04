import { describe, expect, it } from "vitest";
import type { JobMatch } from "@/features/notifications/domain/types";
import { filterMatches } from "./filterMatches";

function makeMatch(overrides: Partial<JobMatch> = {}): JobMatch {
  return {
    jobId: "job-1",
    title: "Backend Engineer",
    companyName: "Acme Corp",
    locationTags: ["remote"],
    source: "greenhouse",
    url: "https://example.com/jobs/1",
    aiScore: 0.88,
    aiReasoning: "Strong ASP.NET background.",
    description: "We are looking for a Backend Engineer with ASP.NET and C# experience.",
    minYears: 3,
    employmentType: null,
    urgentHiring: false,
    salaryCurrency: null,
    salaryMin: null,
    salaryMax: null,
    salaryPeriod: null,
    ...overrides,
  };
}

describe("filterMatches", () => {
  describe("empty preferences", () => {
    it("passes all matches through when prefs is empty", () => {
      const matches = [makeMatch({ jobId: "j1" }), makeMatch({ jobId: "j2" })];
      expect(filterMatches(matches, {})).toHaveLength(2);
    });

    it("passes all matches through when each filter is an empty array", () => {
      const matches = [makeMatch()];
      expect(filterMatches(matches, { roles: [], skills: [], locations: [], sources: [] })).toHaveLength(1);
    });
  });

  describe("role filter", () => {
    it("passes when title contains a listed role (case-insensitive)", () => {
      const match = makeMatch({ title: "Senior Backend Engineer" });
      expect(filterMatches([match], { roles: ["backend engineer"] })).toHaveLength(1);
    });

    it("blocks when title contains none of the listed roles", () => {
      const match = makeMatch({ title: "Frontend Developer" });
      expect(filterMatches([match], { roles: ["backend engineer"] })).toHaveLength(0);
    });

    it("passes when title matches any one of multiple listed roles", () => {
      const match = makeMatch({ title: "Platform Engineer" });
      expect(filterMatches([match], { roles: ["backend engineer", "platform engineer"] })).toHaveLength(1);
    });
  });

  describe("skill filter", () => {
    it("passes when description contains a listed skill", () => {
      const match = makeMatch({ description: "Requires experience with ASP.NET and SQL Server." });
      expect(filterMatches([match], { skills: ["ASP.NET"] })).toHaveLength(1);
    });

    it("blocks when description contains none of the listed skills", () => {
      const match = makeMatch({ description: "Requires experience with React and TypeScript." });
      expect(filterMatches([match], { skills: ["ASP.NET"] })).toHaveLength(0);
    });

    it("skill matching is case-insensitive", () => {
      const match = makeMatch({ description: "Experience with asp.net core." });
      expect(filterMatches([match], { skills: ["ASP.NET"] })).toHaveLength(1);
    });

    it("passes when description matches any one of multiple listed skills", () => {
      const match = makeMatch({ description: "We use Python and Django." });
      expect(filterMatches([match], { skills: ["ASP.NET", "Python"] })).toHaveLength(1);
    });

    it("passes when a skill appears only in the title, not the description (matches scoreJob.ts's title+description text source)", () => {
      const match = makeMatch({ title: "React Developer", description: "We're looking for a developer." });
      expect(filterMatches([match], { skills: ["React"] })).toHaveLength(1);
    });
  });

  describe("location filter", () => {
    it("passes when locationTags includes a listed location", () => {
      const match = makeMatch({ locationTags: ["remote", "singapore"] });
      expect(filterMatches([match], { locations: ["remote"] })).toHaveLength(1);
    });

    it("blocks when locationTags includes none of the listed locations", () => {
      const match = makeMatch({ locationTags: ["india"] });
      expect(filterMatches([match], { locations: ["remote"] })).toHaveLength(0);
    });
  });

  describe("experience filter", () => {
    it("passes when minYears is within [minExperience, maxExperience]", () => {
      const match = makeMatch({ minYears: 3 });
      expect(filterMatches([match], { minExperience: 2, maxExperience: 5 })).toHaveLength(1);
    });

    it("blocks when minYears is below minExperience", () => {
      const match = makeMatch({ minYears: 1 });
      expect(filterMatches([match], { minExperience: 2 })).toHaveLength(0);
    });

    it("blocks when minYears is above maxExperience", () => {
      const match = makeMatch({ minYears: 8 });
      expect(filterMatches([match], { maxExperience: 5 })).toHaveLength(0);
    });

    it("always passes when minYears is null (experience unspecified in job)", () => {
      const match = makeMatch({ minYears: null });
      expect(filterMatches([match], { minExperience: 5, maxExperience: 7 })).toHaveLength(1);
    });
  });

  describe("source filter", () => {
    it("passes when source is in the listed sources", () => {
      const match = makeMatch({ source: "lever" });
      expect(filterMatches([match], { sources: ["lever", "ashby"] })).toHaveLength(1);
    });

    it("blocks when source is not in the listed sources", () => {
      const match = makeMatch({ source: "greenhouse" });
      expect(filterMatches([match], { sources: ["lever"] })).toHaveLength(0);
    });
  });

  describe("blocked company filter", () => {
    it("blocks when companyName contains a blocked entry (case-insensitive)", () => {
      const match = makeMatch({ companyName: "Acme Staffing Solutions" });
      expect(filterMatches([match], { blockedCompanies: ["staffing"] })).toHaveLength(0);
    });

    it("passes when companyName matches no blocked entry", () => {
      const match = makeMatch({ companyName: "Acme Corp" });
      expect(filterMatches([match], { blockedCompanies: ["staffing"] })).toHaveLength(1);
    });

    it("passes all through when blockedCompanies is empty", () => {
      const match = makeMatch();
      expect(filterMatches([match], { blockedCompanies: [] })).toHaveLength(1);
    });
  });

  describe("employment type exclude filter", () => {
    it("blocks when employmentType is in the exclude list", () => {
      const match = makeMatch({ employmentType: "internship" });
      expect(filterMatches([match], { excludeEmploymentTypes: ["internship", "contract"] })).toHaveLength(0);
    });

    it("passes when employmentType is not in the exclude list", () => {
      const match = makeMatch({ employmentType: "full_time" });
      expect(filterMatches([match], { excludeEmploymentTypes: ["internship"] })).toHaveLength(1);
    });

    it("always passes when employmentType is null (unknown, never excluded)", () => {
      const match = makeMatch({ employmentType: null });
      expect(filterMatches([match], { excludeEmploymentTypes: ["internship"] })).toHaveLength(1);
    });
  });

  describe("excluded keyword filter", () => {
    it("blocks when title contains a muted keyword (case-insensitive)", () => {
      const match = makeMatch({ title: "Senior Backend Engineer" });
      expect(filterMatches([match], { excludeKeywords: ["senior"] })).toHaveLength(0);
    });

    it("passes when title matches no muted keyword", () => {
      const match = makeMatch({ title: "Junior Backend Engineer" });
      expect(filterMatches([match], { excludeKeywords: ["senior"] })).toHaveLength(1);
    });
  });

  describe("combined filters (AND logic)", () => {
    it("requires all specified filters to pass", () => {
      const matches = [
        makeMatch({ jobId: "j1", title: "Backend Engineer", locationTags: ["remote"], source: "greenhouse" }),
        makeMatch({ jobId: "j2", title: "Frontend Developer", locationTags: ["remote"], source: "greenhouse" }),
        makeMatch({ jobId: "j3", title: "Backend Engineer", locationTags: ["india"], source: "greenhouse" }),
      ];
      const result = filterMatches(matches, { roles: ["backend engineer"], locations: ["remote"] });
      expect(result.map((m) => m.jobId)).toEqual(["j1"]);
    });

    it("returns all matches when no filters are set", () => {
      const matches = [makeMatch({ jobId: "j1" }), makeMatch({ jobId: "j2" })];
      expect(filterMatches(matches, {})).toHaveLength(2);
    });
  });
});
