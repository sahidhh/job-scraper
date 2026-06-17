import { afterEach, describe, expect, it, vi } from "vitest";
import { myCareersFutureScraper } from "./MyCareersFutureScraper";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function mcfResponse(jobs: object[]): object {
  return { total: jobs.length, results: jobs };
}

const SAMPLE_JOB = {
  uuid: "MCF-2026-abc123",
  title: "Software Engineer",
  company: { name: "TechCorp Pte Ltd" },
  metadata: { createdAt: "2026-06-10T08:00:00Z" },
  description: "<p>Build great things.</p>",
  externalJobUrl: "https://techcorp.com/jobs/1",
};

describe("myCareersFutureScraper", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("declares its source and does not require company config", () => {
    expect(myCareersFutureScraper.source).toBe("mycareersfuture");
    expect(myCareersFutureScraper.requiresCompanyConfig).toBe(false);
  });

  it("maps a valid MCF job entry to RawJob", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(mcfResponse([SAMPLE_JOB])));
    vi.stubGlobal("fetch", fetchMock);

    const result = await myCareersFutureScraper.fetchJobs([], ["Software Engineer"]);

    expect(result).toEqual([
      {
        source: "mycareersfuture",
        sourceJobId: "MCF-2026-abc123",
        companyId: null,
        companyName: "TechCorp Pte Ltd",
        title: "Software Engineer",
        locationRaw: "Singapore",
        description: "Build great things.",
        url: "https://techcorp.com/jobs/1",
        postedAt: new Date("2026-06-10T08:00:00Z").toISOString(),
      },
    ]);
  });

  it("falls back to MCF job URL when externalJobUrl is absent", async () => {
    const job = { ...SAMPLE_JOB, externalJobUrl: undefined };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(mcfResponse([job])));
    vi.stubGlobal("fetch", fetchMock);

    const result = await myCareersFutureScraper.fetchJobs([], ["Software Engineer"]);

    expect(result[0]?.url).toBe("https://www.mycareersfuture.gov.sg/job/MCF-2026-abc123");
  });

  it("strips HTML from description", async () => {
    const job = { ...SAMPLE_JOB, description: "<h1>Role</h1><p>Build <strong>cool</strong> stuff.</p>" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(mcfResponse([job])));
    vi.stubGlobal("fetch", fetchMock);

    const result = await myCareersFutureScraper.fetchJobs([], ["Software Engineer"]);

    // stripHtml preserves block-level line breaks (text.ts normalisation rule 1)
    expect(result[0]?.description).toBe("Role\nBuild cool stuff.");
  });

  it("throws when the API responds with an error status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "not found" }, 500));
    vi.stubGlobal("fetch", fetchMock);

    await expect(myCareersFutureScraper.fetchJobs([], ["Software Engineer"])).rejects.toThrow(
      "MyCareersFuture API returned 500",
    );
  });

  it("deduplicates jobs with the same uuid across multiple search terms", async () => {
    // Each call must return a fresh Response — a consumed body is not reusable.
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(mcfResponse([SAMPLE_JOB]))));
    vi.stubGlobal("fetch", fetchMock);

    // Two distinct roles → two API calls → same job returned by both
    const result = await myCareersFutureScraper.fetchJobs([], ["Software Engineer", "Backend Engineer"]);

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceJobId).toBe("MCF-2026-abc123");
  });

  it("filters results to jobs matching the given roles", async () => {
    const matchingJob = SAMPLE_JOB;
    const nonMatchingJob = { ...SAMPLE_JOB, uuid: "MCF-2026-xyz999", title: "Graphic Designer", description: "" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(mcfResponse([matchingJob, nonMatchingJob])));
    vi.stubGlobal("fetch", fetchMock);

    const result = await myCareersFutureScraper.fetchJobs([], ["Software Engineer"]);

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceJobId).toBe("MCF-2026-abc123");
  });

  it("uses default search terms when roles is empty", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(mcfResponse([SAMPLE_JOB]))));
    vi.stubGlobal("fetch", fetchMock);

    await myCareersFutureScraper.fetchJobs([], []);

    // Two default terms → two API calls
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("software%20engineer");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("developer");
  });

  it("caps search requests at MAX_SEARCH_TERMS even when many roles are given", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(mcfResponse([]))));
    vi.stubGlobal("fetch", fetchMock);

    const manyRoles = ["Role A", "Role B", "Role C", "Role D", "Role E", "Role F"];
    await myCareersFutureScraper.fetchJobs([], manyRoles);

    expect(fetchMock).toHaveBeenCalledTimes(4); // MAX_SEARCH_TERMS
  });

  it("returns empty array when results field is missing from response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ total: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await myCareersFutureScraper.fetchJobs([], ["Software Engineer"]);

    expect(result).toEqual([]);
  });

  it("skips entries missing uuid", async () => {
    const badEntry = { title: "Engineer", company: { name: "Corp" } }; // no uuid
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(mcfResponse([badEntry, SAMPLE_JOB])));
    vi.stubGlobal("fetch", fetchMock);

    const result = await myCareersFutureScraper.fetchJobs([], ["Software Engineer"]);

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceJobId).toBe("MCF-2026-abc123");
  });
});
