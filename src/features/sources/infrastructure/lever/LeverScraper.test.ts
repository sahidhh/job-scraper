import { afterEach, describe, expect, it, vi } from "vitest";
import type { Company } from "@/features/companies/domain/types";
import { leverScraper } from "./LeverScraper";

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "company-1",
    name: "Acme",
    source: "lever",
    boardToken: "acme",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("leverScraper", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("declares its source and company-config requirement", () => {
    expect(leverScraper.source).toBe("lever");
    expect(leverScraper.requiresCompanyConfig).toBe(true);
  });

  it("maps a postings response into RawJob entries, converting createdAt to ISO", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          id: "posting-1",
          text: "  Backend Engineer  ",
          categories: { location: "Singapore" },
          descriptionPlain: "Join our backend team.\n\nWork on APIs.",
          hostedUrl: "https://jobs.lever.co/acme/posting-1",
          createdAt: 1748736000000,
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await leverScraper.fetchJobs([makeCompany()]);

    expect(result).toEqual([
      {
        source: "lever",
        sourceJobId: "posting-1",
        companyId: "company-1",
        companyName: "Acme",
        title: "Backend Engineer",
        locationRaw: "Singapore",
        description: "Join our backend team.\nWork on APIs.",
        url: "https://jobs.lever.co/acme/posting-1",
        postedAt: new Date(1748736000000).toISOString(),
      },
    ]);
  });

  it("falls back to stripped HTML description when descriptionPlain is absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          id: "posting-2",
          text: "Designer",
          categories: {},
          description: "<p>Design things.</p>",
          hostedUrl: "https://jobs.lever.co/acme/posting-2",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const [job] = await leverScraper.fetchJobs([makeCompany()]);

    expect(job?.description).toBe("Design things.");
    expect(job?.locationRaw).toBe("");
    expect(job?.postedAt).toBeNull();
  });

  it("isolates a failing company and continues with the rest", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Not Found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    const result = await leverScraper.fetchJobs([
      makeCompany({ id: "broken-co", boardToken: "broken" }),
      makeCompany({ id: "ok-co", boardToken: "ok" }),
    ]);

    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
