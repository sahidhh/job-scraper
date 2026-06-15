import { afterEach, describe, expect, it, vi } from "vitest";
import type { Company } from "@/features/companies/domain/types";
import { ashbyScraper } from "./AshbyScraper";

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "company-1",
    name: "Acme",
    source: "ashby",
    boardToken: "acme",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("ashbyScraper", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("declares its source and company-config requirement", () => {
    expect(ashbyScraper.source).toBe("ashby");
    expect(ashbyScraper.requiresCompanyConfig).toBe(true);
  });

  it("maps a job board response into RawJob entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        jobs: [
          {
            id: "job-1",
            title: "Platform Engineer",
            location: "Remote - UAE",
            descriptionHtml: "<ul><li>Own infra</li><li>On-call rotation</li></ul>",
            applyUrl: "https://jobs.ashbyhq.com/acme/job-1",
            publishedAt: "2026-06-05T12:00:00.000Z",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await ashbyScraper.fetchJobs([makeCompany()], []);

    expect(result).toEqual([
      {
        source: "ashby",
        sourceJobId: "job-1",
        companyId: "company-1",
        companyName: "Acme",
        title: "Platform Engineer",
        locationRaw: "Remote - UAE",
        description: "Own infra\nOn-call rotation",
        url: "https://jobs.ashbyhq.com/acme/job-1",
        postedAt: "2026-06-05T12:00:00.000Z",
      },
    ]);
  });

  it("isolates a failing company and continues with the rest", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Not Found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    const result = await ashbyScraper.fetchJobs(
      [makeCompany({ id: "broken-co", boardToken: "broken" }), makeCompany({ id: "ok-co", boardToken: "ok" })],
      [],
    );

    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("filters results to jobs matching the given roles", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        jobs: [
          {
            id: "job-1",
            title: "Platform Engineer",
            location: "Remote - UAE",
            descriptionHtml: "<p>Own infra.</p>",
            applyUrl: "https://jobs.ashbyhq.com/acme/job-1",
            publishedAt: "2026-06-05T12:00:00.000Z",
          },
          {
            id: "job-2",
            title: "Sales Representative",
            location: "Remote - UAE",
            descriptionHtml: "<p>Close deals.</p>",
            applyUrl: "https://jobs.ashbyhq.com/acme/job-2",
            publishedAt: "2026-06-05T12:00:00.000Z",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await ashbyScraper.fetchJobs([makeCompany()], ["Platform Engineer"]);

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceJobId).toBe("job-1");
  });
});
