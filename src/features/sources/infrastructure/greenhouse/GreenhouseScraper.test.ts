import { afterEach, describe, expect, it, vi } from "vitest";
import type { Company } from "@/features/companies/domain/types";
import { greenhouseScraper } from "./GreenhouseScraper";

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "company-1",
    name: "Acme",
    source: "greenhouse",
    boardToken: "acme",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("greenhouseScraper", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("declares its source and company-config requirement", () => {
    expect(greenhouseScraper.source).toBe("greenhouse");
    expect(greenhouseScraper.requiresCompanyConfig).toBe(true);
  });

  it("maps a board response into RawJob entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        jobs: [
          {
            id: 12345,
            title: "  Senior   React Developer  ",
            location: { name: "Remote - India" },
            content: "<p>Build great things.</p><p>Apply now.</p>",
            absolute_url: "https://boards.greenhouse.io/acme/jobs/12345",
            updated_at: "2026-06-01T00:00:00.000Z",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await greenhouseScraper.fetchJobs([makeCompany()]);

    expect(result).toEqual([
      {
        source: "greenhouse",
        sourceJobId: "12345",
        companyId: "company-1",
        companyName: "Acme",
        title: "Senior React Developer",
        locationRaw: "Remote - India",
        description: "Build great things.\nApply now.",
        url: "https://boards.greenhouse.io/acme/jobs/12345",
        postedAt: "2026-06-01T00:00:00.000Z",
      },
    ]);
  });

  it("isolates a failing company and continues with the rest", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("broken")) {
        return Promise.resolve(jsonResponse({ message: "Not Found" }, 404));
      }
      return Promise.resolve(jsonResponse({ jobs: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await greenhouseScraper.fetchJobs([
      makeCompany({ id: "broken-co", boardToken: "broken" }),
      makeCompany({ id: "ok-co", boardToken: "ok" }),
    ]);

    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns an empty array for a company with no boardToken", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await greenhouseScraper.fetchJobs([makeCompany({ boardToken: null })]);

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
