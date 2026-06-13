import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wellfoundScraper } from "./WellfoundScraper";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("wellfoundScraper", () => {
  const originalFeedUrl = process.env.WELLFOUND_FEED_URL;

  beforeEach(() => {
    delete process.env.WELLFOUND_FEED_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalFeedUrl === undefined) {
      delete process.env.WELLFOUND_FEED_URL;
    } else {
      process.env.WELLFOUND_FEED_URL = originalFeedUrl;
    }
  });

  it("declares its source and ignores company config", () => {
    expect(wellfoundScraper.source).toBe("wellfound");
    expect(wellfoundScraper.requiresCompanyConfig).toBe(false);
  });

  it("returns an empty array when no feed URL is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await wellfoundScraper.fetchJobs([]);

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps valid entries when the feed is configured and well-formed", async () => {
    process.env.WELLFOUND_FEED_URL = "https://example.com/wellfound-feed";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          id: "listing-1",
          title: "Founding Engineer",
          company: "Stealth Startup",
          location: "Remote",
          description: "<p>Early team.</p>",
          url: "https://wellfound.com/jobs/listing-1",
          postedAt: "2026-06-08T00:00:00Z",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await wellfoundScraper.fetchJobs([]);

    expect(result).toEqual([
      {
        source: "wellfound",
        sourceJobId: "listing-1",
        companyId: null,
        companyName: "Stealth Startup",
        title: "Founding Engineer",
        locationRaw: "Remote",
        description: "Early team.",
        url: "https://wellfound.com/jobs/listing-1",
        postedAt: "2026-06-08T00:00:00.000Z",
      },
    ]);
  });

  it("returns an empty array (not throwing) when the response shape is unexpected", async () => {
    process.env.WELLFOUND_FEED_URL = "https://example.com/wellfound-feed";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ unexpected: "object" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await wellfoundScraper.fetchJobs([]);

    expect(result).toEqual([]);
  });

  it("filters out entries missing required fields without throwing", async () => {
    process.env.WELLFOUND_FEED_URL = "https://example.com/wellfound-feed";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ title: "Missing id and company" }]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await wellfoundScraper.fetchJobs([]);

    expect(result).toEqual([]);
  });

  it("returns an empty array when the feed request errors out", async () => {
    process.env.WELLFOUND_FEED_URL = "https://example.com/wellfound-feed";
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await wellfoundScraper.fetchJobs([]);

    expect(result).toEqual([]);
  });
});
