import { afterEach, describe, expect, it, vi } from "vitest";
import { remotiveScraper } from "./RemotiveScraper";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("remotiveScraper", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns [] immediately when REMOTIVE_DISABLED=true", async () => {
    vi.stubEnv("REMOTIVE_DISABLED", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await remotiveScraper.fetchJobs([], []);

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("declares its source and ignores company config", () => {
    expect(remotiveScraper.source).toBe("remotive");
    expect(remotiveScraper.requiresCompanyConfig).toBe(false);
  });

  it("reads the `jobs` envelope and maps job entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        "0-legal-notice": "Thanks for using Remotive's API",
        jobs: [
          {
            id: 2091069,
            url: "https://remotive.com/remote-jobs/backend-2091069",
            title: "  Backend Engineer  ",
            company_name: "  STATLINX  ",
            candidate_required_location: "India",
            description: "<p>Build APIs.</p>",
            publication_date: "2026-07-16T13:28:02",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await remotiveScraper.fetchJobs([], []);

    expect(result).toEqual([
      {
        source: "remotive",
        sourceJobId: "2091069",
        companyId: null,
        companyName: "STATLINX",
        title: "Backend Engineer",
        locationRaw: "Remote - India",
        description: "Build APIs.",
        url: "https://remotive.com/remote-jobs/backend-2091069",
        postedAt: new Date("2026-07-16T13:28:02").toISOString(),
      },
    ]);
  });

  it("prefixes a specific candidate location with 'Remote - ' so geo-lock detection applies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        jobs: [
          {
            id: 1,
            url: "https://remotive.com/remote-jobs/1",
            title: "Backend Engineer",
            company_name: "US Co",
            candidate_required_location: "USA",
            description: "<p>Remote in the US.</p>",
            publication_date: "2026-07-16T13:28:02",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await remotiveScraper.fetchJobs([], []);

    expect(result[0]?.locationRaw).toBe("Remote - USA");
  });

  it("defaults locationRaw to 'remote' when candidate_required_location is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        jobs: [
          {
            id: 7,
            url: "https://remotive.com/remote-jobs/7",
            title: "Backend Engineer",
            company_name: "Anywhere Inc",
            candidate_required_location: "",
            description: "<p>Work remotely.</p>",
            publication_date: "2026-07-16T13:28:02",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await remotiveScraper.fetchJobs([], []);

    expect(result[0]?.locationRaw).toBe("remote");
  });

  it("throws when the API responds with an error status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "bad" }, 503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(remotiveScraper.fetchJobs([], [])).rejects.toThrow("Remotive API returned 503");
  });

  it("filters results to jobs matching the given roles", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        jobs: [
          {
            id: 1,
            url: "https://remotive.com/remote-jobs/1",
            title: "Backend Engineer",
            company_name: "Co",
            candidate_required_location: "Worldwide",
            description: "<p>APIs.</p>",
            publication_date: "2026-07-16T13:28:02",
          },
          {
            id: 2,
            url: "https://remotive.com/remote-jobs/2",
            title: "Graphic Designer",
            company_name: "Co",
            candidate_required_location: "Worldwide",
            description: "<p>Design.</p>",
            publication_date: "2026-07-16T13:28:02",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await remotiveScraper.fetchJobs([], ["Backend Engineer"]);

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceJobId).toBe("1");
  });
});
