import { afterEach, describe, expect, it, vi } from "vitest";
import { remoteokScraper } from "./RemoteOkScraper";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("remoteokScraper", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns [] immediately when REMOTEOK_DISABLED=true", async () => {
    vi.stubEnv("REMOTEOK_DISABLED", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await remoteokScraper.fetchJobs([], []);

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns [] immediately when REMOTEOK_DISABLED=1", async () => {
    vi.stubEnv("REMOTEOK_DISABLED", "1");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await remoteokScraper.fetchJobs([], []);

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("declares its source and ignores company config", () => {
    expect(remoteokScraper.source).toBe("remoteok");
    expect(remoteokScraper.requiresCompanyConfig).toBe(false);
  });

  it("drops the leading legal-notice entry and maps the remaining job entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        { legal: "Use of this API is..." },
        {
          id: 998877,
          company: "  Remote  Co  ",
          position: "Full Stack Developer",
          location: "Worldwide",
          description: "<p>Work from anywhere.</p>",
          url: "https://remoteok.com/remote-jobs/998877",
          date: "2026-06-10T08:00:00+00:00",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await remoteokScraper.fetchJobs([], []);

    expect(result).toEqual([
      {
        source: "remoteok",
        sourceJobId: "998877",
        companyId: null,
        companyName: "Remote Co",
        title: "Full Stack Developer",
        locationRaw: "Worldwide",
        description: "Work from anywhere.",
        url: "https://remoteok.com/remote-jobs/998877",
        postedAt: new Date("2026-06-10T08:00:00+00:00").toISOString(),
      },
    ]);
  });

  it("throws when the API responds with an error status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "not found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(remoteokScraper.fetchJobs([], [])).rejects.toThrow("RemoteOK API returned 404");
  });

  it("filters results to jobs matching the given roles", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        { legal: "Use of this API is..." },
        {
          id: 1,
          company: "Remote Co",
          position: "Full Stack Developer",
          location: "Worldwide",
          description: "<p>Work from anywhere.</p>",
          url: "https://remoteok.com/remote-jobs/1",
          date: "2026-06-10T08:00:00+00:00",
        },
        {
          id: 2,
          company: "Remote Co",
          position: "Graphic Designer",
          location: "Worldwide",
          description: "<p>Design things.</p>",
          url: "https://remoteok.com/remote-jobs/2",
          date: "2026-06-10T08:00:00+00:00",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await remoteokScraper.fetchJobs([], ["Full Stack Developer"]);

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceJobId).toBe("1");
  });
});
