import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adzunaScraper, validateAdzunaConfig } from "./AdzunaScraper";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const SAMPLE_JOB = {
  id: 123456,
  title: "Backend Engineer",
  company: { display_name: "Acme Corp" },
  location: { display_name: "Bengaluru, India" },
  description: "<p>Build things.</p>",
  redirect_url: "https://example.com/apply/1",
  created: "2026-07-01T00:00:00Z",
};

describe("validateAdzunaConfig", () => {
  const originalId = process.env.ADZUNA_APP_ID;
  const originalKey = process.env.ADZUNA_APP_KEY;
  const originalDisabled = process.env.ADZUNA_DISABLED;
  const originalCountries = process.env.ADZUNA_COUNTRIES;

  beforeEach(() => {
    delete process.env.ADZUNA_APP_ID;
    delete process.env.ADZUNA_APP_KEY;
    delete process.env.ADZUNA_DISABLED;
    delete process.env.ADZUNA_COUNTRIES;
  });

  afterEach(() => {
    if (originalId === undefined) delete process.env.ADZUNA_APP_ID;
    else process.env.ADZUNA_APP_ID = originalId;
    if (originalKey === undefined) delete process.env.ADZUNA_APP_KEY;
    else process.env.ADZUNA_APP_KEY = originalKey;
    if (originalDisabled === undefined) delete process.env.ADZUNA_DISABLED;
    else process.env.ADZUNA_DISABLED = originalDisabled;
    if (originalCountries === undefined) delete process.env.ADZUNA_COUNTRIES;
    else process.env.ADZUNA_COUNTRIES = originalCountries;
  });

  it("returns disabled when app id/key are unset (clean skip)", () => {
    expect(validateAdzunaConfig()).toEqual({ status: "disabled" });
  });

  it("returns disabled when only one of app id/key is set", () => {
    process.env.ADZUNA_APP_ID = "id";
    expect(validateAdzunaConfig()).toEqual({ status: "disabled" });
  });

  it("returns disabled when ADZUNA_DISABLED=true even with credentials set", () => {
    process.env.ADZUNA_APP_ID = "id";
    process.env.ADZUNA_APP_KEY = "key";
    process.env.ADZUNA_DISABLED = "true";
    expect(validateAdzunaConfig()).toEqual({ status: "disabled" });
  });

  it("returns ok with default countries (no UAE) when credentials are set", () => {
    process.env.ADZUNA_APP_ID = "id";
    process.env.ADZUNA_APP_KEY = "key";
    expect(validateAdzunaConfig()).toEqual({ status: "ok", appId: "id", appKey: "key", countries: ["in", "sg"] });
  });
});

describe("adzunaScraper", () => {
  const originalId = process.env.ADZUNA_APP_ID;
  const originalKey = process.env.ADZUNA_APP_KEY;
  const originalDisabled = process.env.ADZUNA_DISABLED;
  const originalCountries = process.env.ADZUNA_COUNTRIES;

  beforeEach(() => {
    process.env.ADZUNA_APP_ID = "id";
    process.env.ADZUNA_APP_KEY = "key";
    delete process.env.ADZUNA_DISABLED;
    process.env.ADZUNA_COUNTRIES = "in";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalId === undefined) delete process.env.ADZUNA_APP_ID;
    else process.env.ADZUNA_APP_ID = originalId;
    if (originalKey === undefined) delete process.env.ADZUNA_APP_KEY;
    else process.env.ADZUNA_APP_KEY = originalKey;
    if (originalDisabled === undefined) delete process.env.ADZUNA_DISABLED;
    else process.env.ADZUNA_DISABLED = originalDisabled;
    if (originalCountries === undefined) delete process.env.ADZUNA_COUNTRIES;
    else process.env.ADZUNA_COUNTRIES = originalCountries;
  });

  it("declares its source and does not require company config", () => {
    expect(adzunaScraper.source).toBe("adzuna");
    expect(adzunaScraper.requiresCompanyConfig).toBe(false);
  });

  it("returns [] without fetching when unconfigured", async () => {
    delete process.env.ADZUNA_APP_ID;
    delete process.env.ADZUNA_APP_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await adzunaScraper.fetchJobs([], ["Backend Engineer"]);

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a valid Adzuna job entry to RawJob", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [SAMPLE_JOB] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await adzunaScraper.fetchJobs([], ["Backend Engineer"]);

    expect(result).toEqual([
      {
        source: "adzuna",
        sourceJobId: "123456",
        companyId: null,
        companyName: "Acme Corp",
        title: "Backend Engineer",
        locationRaw: "Bengaluru, India",
        description: "Build things.",
        url: "https://example.com/apply/1",
        postedAt: new Date("2026-07-01T00:00:00Z").toISOString(),
      },
    ]);
  });

  it("rejects entries with no id", async () => {
    const badJob = { ...SAMPLE_JOB, id: undefined };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [badJob] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await adzunaScraper.fetchJobs([], ["Backend Engineer"]);

    expect(result).toEqual([]);
  });

  it("rejects entries with no redirect_url", async () => {
    const badJob = { ...SAMPLE_JOB, redirect_url: undefined };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [badJob] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await adzunaScraper.fetchJobs([], ["Backend Engineer"]);

    expect(result).toEqual([]);
  });

  it("deduplicates jobs with the same id across multiple search terms", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ results: [SAMPLE_JOB] })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await adzunaScraper.fetchJobs([], ["Backend Engineer", "Software Engineer"]);

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceJobId).toBe("123456");
  });

  it("filters results to jobs matching the given roles", async () => {
    const nonMatching = { ...SAMPLE_JOB, id: 999, title: "Sales Manager", description: "" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [SAMPLE_JOB, nonMatching] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await adzunaScraper.fetchJobs([], ["Backend Engineer"]);

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceJobId).toBe("123456");
  });
});
