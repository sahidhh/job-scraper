import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateWellfoundConfig, wellfoundScraper } from "./WellfoundScraper";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("validateWellfoundConfig", () => {
  beforeEach(() => {
    delete process.env.WELLFOUND_DISABLED;
    delete process.env.WELLFOUND_FEED_URL;
  });

  afterEach(() => {
    delete process.env.WELLFOUND_DISABLED;
    delete process.env.WELLFOUND_FEED_URL;
  });

  it("returns disabled when WELLFOUND_DISABLED=true", () => {
    process.env.WELLFOUND_DISABLED = "true";
    expect(validateWellfoundConfig()).toEqual({ status: "disabled" });
  });

  it("returns disabled when WELLFOUND_DISABLED=1", () => {
    process.env.WELLFOUND_DISABLED = "1";
    expect(validateWellfoundConfig()).toEqual({ status: "disabled" });
  });

  it("returns invalid_config when WELLFOUND_FEED_URL is not set", () => {
    const result = validateWellfoundConfig();
    expect(result.status).toBe("invalid_config");
    expect((result as { status: "invalid_config"; reason: string }).reason).toMatch(/WELLFOUND_FEED_URL/);
  });

  it("returns invalid_config for a malformed URL", () => {
    process.env.WELLFOUND_FEED_URL = "not-a-url";
    const result = validateWellfoundConfig();
    expect(result.status).toBe("invalid_config");
    expect((result as { status: "invalid_config"; reason: string }).reason).toBe("malformed URL");
  });

  it("returns invalid_config for an unsupported protocol", () => {
    process.env.WELLFOUND_FEED_URL = "ftp://example.com/feed";
    const result = validateWellfoundConfig();
    expect(result.status).toBe("invalid_config");
    expect((result as { status: "invalid_config"; reason: string }).reason).toContain("unsupported protocol");
  });

  it("returns ok with feedUrl for a valid https URL", () => {
    process.env.WELLFOUND_FEED_URL = "https://example.com/wellfound-feed";
    expect(validateWellfoundConfig()).toEqual({ status: "ok", feedUrl: "https://example.com/wellfound-feed" });
  });

  it("returns ok with feedUrl for a valid http URL", () => {
    process.env.WELLFOUND_FEED_URL = "http://localhost:3001/feed";
    expect(validateWellfoundConfig()).toEqual({ status: "ok", feedUrl: "http://localhost:3001/feed" });
  });
});

describe("wellfoundScraper", () => {
  const originalFeedUrl = process.env.WELLFOUND_FEED_URL;
  const originalDisabled = process.env.WELLFOUND_DISABLED;

  beforeEach(() => {
    delete process.env.WELLFOUND_FEED_URL;
    delete process.env.WELLFOUND_DISABLED;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalFeedUrl === undefined) {
      delete process.env.WELLFOUND_FEED_URL;
    } else {
      process.env.WELLFOUND_FEED_URL = originalFeedUrl;
    }
    if (originalDisabled === undefined) {
      delete process.env.WELLFOUND_DISABLED;
    } else {
      process.env.WELLFOUND_DISABLED = originalDisabled;
    }
  });

  it("declares its source and ignores company config", () => {
    expect(wellfoundScraper.source).toBe("wellfound");
    expect(wellfoundScraper.requiresCompanyConfig).toBe(false);
  });

  it("returns [] and logs 'disabled' when WELLFOUND_DISABLED=true", async () => {
    process.env.WELLFOUND_DISABLED = "true";
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await wellfoundScraper.fetchJobs([], []);

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith("[wellfound] disabled");
    consoleSpy.mockRestore();
  });

  it("returns [] and warns 'invalid configuration' when no feed URL is configured", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await wellfoundScraper.fetchJobs([], []);

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[wellfound] invalid configuration"));
    warnSpy.mockRestore();
  });

  it("returns [] and warns 'invalid configuration' when the feed URL is malformed", async () => {
    process.env.WELLFOUND_FEED_URL = "not-a-url";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await wellfoundScraper.fetchJobs([], []);

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[wellfound] invalid configuration"));
    warnSpy.mockRestore();
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

    const result = await wellfoundScraper.fetchJobs([], []);

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

    const result = await wellfoundScraper.fetchJobs([], []);

    expect(result).toEqual([]);
  });

  it("filters out entries missing required fields without throwing", async () => {
    process.env.WELLFOUND_FEED_URL = "https://example.com/wellfound-feed";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ title: "Missing id and company" }]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await wellfoundScraper.fetchJobs([], []);

    expect(result).toEqual([]);
  });

  it("returns an empty array when the feed request errors out", async () => {
    process.env.WELLFOUND_FEED_URL = "https://example.com/wellfound-feed";
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await wellfoundScraper.fetchJobs([], []);

    expect(result).toEqual([]);
  });

  it("filters results to entries matching the given roles", async () => {
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
        {
          id: "listing-2",
          title: "Recruiter",
          company: "Stealth Startup",
          location: "Remote",
          description: "<p>Hire people.</p>",
          url: "https://wellfound.com/jobs/listing-2",
          postedAt: "2026-06-08T00:00:00Z",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await wellfoundScraper.fetchJobs([], ["Founding Engineer"]);

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceJobId).toBe("listing-1");
  });
});
