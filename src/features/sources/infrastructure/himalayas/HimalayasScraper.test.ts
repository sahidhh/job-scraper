import { afterEach, describe, expect, it, vi } from "vitest";
import { himalayasScraper } from "./HimalayasScraper";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("himalayasScraper", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns [] immediately when HIMALAYAS_DISABLED=true", async () => {
    vi.stubEnv("HIMALAYAS_DISABLED", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await himalayasScraper.fetchJobs([], []);

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("declares its source and ignores company config", () => {
    expect(himalayasScraper.source).toBe("himalayas");
    expect(himalayasScraper.requiresCompanyConfig).toBe(false);
  });

  it("maps job entries, using guid as the dedup id and converting the seconds timestamp", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        jobs: [
          {
            title: "  Backend Developer  ",
            companyName: "  Bjak  ",
            guid: "https://himalayas.app/companies/bjak/jobs/backend-developer",
            applicationLink: "https://himalayas.app/companies/bjak/jobs/backend-developer",
            description: "<p>Build things.</p>",
            locationRestrictions: ["Netherlands"],
            pubDate: 1784387614,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await himalayasScraper.fetchJobs([], []);

    expect(result).toEqual([
      {
        source: "himalayas",
        sourceJobId: "https://himalayas.app/companies/bjak/jobs/backend-developer",
        companyId: null,
        companyName: "Bjak",
        title: "Backend Developer",
        locationRaw: "Remote - Netherlands",
        description: "Build things.",
        url: "https://himalayas.app/companies/bjak/jobs/backend-developer",
        postedAt: new Date(1784387614 * 1000).toISOString(),
      },
    ]);
  });

  it("joins multiple location restrictions and prefixes with 'Remote - '", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        jobs: [
          {
            title: "Engineer",
            companyName: "Co",
            guid: "g1",
            description: "<p>x</p>",
            locationRestrictions: ["United States", "Canada"],
            pubDate: 1784387614,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await himalayasScraper.fetchJobs([], []);

    expect(result[0]?.locationRaw).toBe("Remote - United States, Canada");
  });

  it("defaults locationRaw to 'remote' when there are no restrictions, and url falls back to guid", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        jobs: [
          {
            title: "Engineer",
            companyName: "Co",
            guid: "https://himalayas.app/companies/co/jobs/engineer",
            // no applicationLink, no locationRestrictions
            description: "<p>x</p>",
            pubDate: 1784387614,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await himalayasScraper.fetchJobs([], []);

    expect(result[0]?.locationRaw).toBe("remote");
    expect(result[0]?.url).toBe("https://himalayas.app/companies/co/jobs/engineer");
  });

  it("drops entries without a guid", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        jobs: [
          { title: "No Guid", companyName: "Co", description: "<p>x</p>", pubDate: 1784387614 },
          { title: "Has Guid", companyName: "Co", guid: "g2", description: "<p>x</p>", pubDate: 1784387614 },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await himalayasScraper.fetchJobs([], []);

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceJobId).toBe("g2");
  });

  it("throws when the API responds with an error status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "bad" }, 500));
    vi.stubGlobal("fetch", fetchMock);

    await expect(himalayasScraper.fetchJobs([], [])).rejects.toThrow("Himalayas API returned 500");
  });

  it("filters results to jobs matching the given roles", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        jobs: [
          { title: "Backend Engineer", companyName: "Co", guid: "g1", description: "<p>APIs.</p>", pubDate: 1784387614 },
          { title: "Graphic Designer", companyName: "Co", guid: "g2", description: "<p>Design.</p>", pubDate: 1784387614 },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await himalayasScraper.fetchJobs([], ["Backend Engineer"]);

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceJobId).toBe("g1");
  });
});
