import { describe, expect, it } from "vitest";
import type { Company } from "@/features/companies/domain/types";
import { discoverAtsCareerPages } from "./discoverAtsCareerPages";

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "company-1",
    name: "Acme Corp",
    source: "greenhouse",
    boardToken: "acme",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    healthStatus: "active",
    consecutiveFailures: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    ...overrides,
  };
}

describe("discoverAtsCareerPages", () => {
  it("derives a high-confidence ats_board entry with the canonicalized company name", () => {
    const result = discoverAtsCareerPages([makeCompany()]);
    expect(result).toEqual([
      {
        canonicalCompanyName: "Acme",
        careerPageUrl: "https://boards.greenhouse.io/acme",
        discoveryMethod: "ats_board",
        confidence: "high",
      },
    ]);
  });

  it("skips companies with no derivable career page url", () => {
    const result = discoverAtsCareerPages([makeCompany({ boardToken: null })]);
    expect(result).toEqual([]);
  });

  it("processes a mixed list, skipping only the ones without a board token", () => {
    const companies = [
      makeCompany({ name: "Acme Corp", boardToken: "acme" }),
      makeCompany({ name: "Beta Inc", boardToken: null }),
      makeCompany({ name: "Gamma LLC", source: "lever", boardToken: "gamma" }),
    ];
    const result = discoverAtsCareerPages(companies);
    expect(result.map((p) => p.canonicalCompanyName)).toEqual(["Acme", "Gamma"]);
  });
});
