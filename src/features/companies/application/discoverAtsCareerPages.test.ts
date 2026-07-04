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

  it("de-duplicates by canonicalCompanyName when two companies share one (e.g. the same company on two ATS boards)", () => {
    // Regression test: CareerPageRepository.upsertMany does a single batched
    // upsert keyed on canonicalCompanyName -- Postgres rejects a multi-row
    // upsert that targets the same conflict key twice, so this must never
    // return two entries with the same canonicalCompanyName.
    const companies = [
      makeCompany({ id: "c1", name: "Acme Corp", source: "greenhouse", boardToken: "acme-gh" }),
      makeCompany({ id: "c2", name: "Acme Inc", source: "lever", boardToken: "acme-lever" }),
    ];
    const result = discoverAtsCareerPages(companies);
    expect(result).toHaveLength(1);
    expect(result[0]!.canonicalCompanyName).toBe("Acme");
    expect(result[0]!.careerPageUrl).toBe("https://jobs.lever.co/acme-lever");
  });
});
