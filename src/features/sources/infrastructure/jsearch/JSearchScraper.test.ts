import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsearchScraper, validateJSearchConfig } from "./JSearchScraper";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const SAMPLE_JOB = {
  job_id: "jsearch-abc123",
  job_apply_link: "https://example.com/apply/1",
  job_title: "Software Engineer",
  employer_name: "Acme Corp",
  job_city: "Bangalore",
  job_country: "IN",
  job_description: "<p>Build things.</p>",
  job_posted_at_datetime_utc: "2026-07-01T00:00:00Z",
};

describe("validateJSearchConfig", () => {
  const originalKey = process.env.RAPIDAPI_KEY;
  const originalDisabled = process.env.JSEARCH_DISABLED;
  const originalCountries = process.env.JSEARCH_COUNTRIES;

  beforeEach(() => {
    delete process.env.RAPIDAPI_KEY;
    delete process.env.JSEARCH_DISABLED;
    delete process.env.JSEARCH_COUNTRIES;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.RAPIDAPI_KEY;
    else process.env.RAPIDAPI_KEY = originalKey;
    if (originalDisabled === undefined) delete process.env.JSEARCH_DISABLED;
    else process.env.JSEARCH_DISABLED = originalDisabled;
    if (originalCountries === undefined) delete process.env.JSEARCH_COUNTRIES;
    else process.env.JSEARCH_COUNTRIES = originalCountries;
  });

  it("returns disabled when RAPIDAPI_KEY is unset (clean skip)", () => {
    expect(validateJSearchConfig()).toEqual({ status: "disabled" });
  });

  it("returns disabled when JSEARCH_DISABLED=true even with a key set", () => {
    process.env.RAPIDAPI_KEY = "key";
    process.env.JSEARCH_DISABLED = "true";
    expect(validateJSearchConfig()).toEqual({ status: "disabled" });
  });

  it("returns ok with default countries when only the key is set", () => {
    process.env.RAPIDAPI_KEY = "key";
    expect(validateJSearchConfig()).toEqual({ status: "ok", apiKey: "key", countries: ["in", "sg", "ae"] });
  });

  it("parses a custom comma-separated country list", () => {
    process.env.RAPIDAPI_KEY = "key";
    process.env.JSEARCH_COUNTRIES = " IN , sg ,,ae ";
    expect(validateJSearchConfig()).toEqual({ status: "ok", apiKey: "key", countries: ["in", "sg", "ae"] });
  });
});

describe("jsearchScraper", () => {
  const originalKey = process.env.RAPIDAPI_KEY;
  const originalDisabled = process.env.JSEARCH_DISABLED;
  const originalCountries = process.env.JSEARCH_COUNTRIES;

  beforeEach(() => {
    process.env.RAPIDAPI_KEY = "test-key";
    delete process.env.JSEARCH_DISABLED;
    process.env.JSEARCH_COUNTRIES = "in";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.RAPIDAPI_KEY;
    else process.env.RAPIDAPI_KEY = originalKey;
    if (originalDisabled === undefined) delete process.env.JSEARCH_DISABLED;
    else process.env.JSEARCH_DISABLED = originalDisabled;
    if (originalCountries === undefined) delete process.env.JSEARCH_COUNTRIES;
    else process.env.JSEARCH_COUNTRIES = originalCountries;
  });

  it("declares its source and does not require company config", () => {
    expect(jsearchScraper.source).toBe("jsearch");
    expect(jsearchScraper.requiresCompanyConfig).toBe(false);
  });

  it("returns [] without fetching when unconfigured", async () => {
    delete process.env.RAPIDAPI_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await jsearchScraper.fetchJobs([], ["Software Engineer"]);

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a valid JSearch job entry to RawJob", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [SAMPLE_JOB] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await jsearchScraper.fetchJobs([], ["Software Engineer"]);

    expect(result).toEqual([
      {
        source: "jsearch",
        sourceJobId: "jsearch-abc123",
        companyId: null,
        companyName: "Acme Corp",
        title: "Software Engineer",
        locationRaw: "Bangalore, India",
        description: "Build things.",
        url: "https://example.com/apply/1",
        postedAt: new Date("2026-07-01T00:00:00Z").toISOString(),
      },
    ]);
  });

  it("maps the ISO country code to a full name so the location filter can tag it, even with no city", async () => {
    process.env.JSEARCH_COUNTRIES = "ae";
    const cityless = { ...SAMPLE_JOB, job_city: undefined, job_country: "AE" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [cityless] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await jsearchScraper.fetchJobs([], ["Software Engineer"]);

    expect(result[0]?.locationRaw).toBe("United Arab Emirates");
  });

  it("falls back to the queried country when job_country is absent", async () => {
    process.env.JSEARCH_COUNTRIES = "sg";
    const noCountry = { ...SAMPLE_JOB, job_city: undefined, job_country: undefined };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [noCountry] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await jsearchScraper.fetchJobs([], ["Software Engineer"]);

    expect(result[0]?.locationRaw).toBe("Singapore");
  });

  it("leaves a non-target country code as-is (so it's filtered out downstream as non-target)", async () => {
    const usJob = { ...SAMPLE_JOB, job_city: "Austin", job_country: "US" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [usJob] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await jsearchScraper.fetchJobs([], ["Software Engineer"]);

    expect(result[0]?.locationRaw).toBe("Austin, US");
  });

  it("rejects entries with no job_id and does not fall back to job_apply_link (jobhunt bug #4)", async () => {
    const noIdJob = { ...SAMPLE_JOB, job_id: undefined };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [noIdJob] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await jsearchScraper.fetchJobs([], ["Software Engineer"]);

    expect(result).toEqual([]);
  });

  it("rejects entries with no job_apply_link", async () => {
    const noLinkJob = { ...SAMPLE_JOB, job_apply_link: undefined };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [noLinkJob] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await jsearchScraper.fetchJobs([], ["Software Engineer"]);

    expect(result).toEqual([]);
  });

  it("deduplicates jobs with the same job_id across multiple search terms", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ data: [SAMPLE_JOB] })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await jsearchScraper.fetchJobs([], ["Software Engineer", "Backend Engineer"]);

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceJobId).toBe("jsearch-abc123");
  });

  it("caps search terms at MAX_SEARCH_TERMS x configured countries", async () => {
    process.env.JSEARCH_COUNTRIES = "in,sg";
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ data: [] })));
    vi.stubGlobal("fetch", fetchMock);

    await jsearchScraper.fetchJobs([], ["Role A", "Role B", "Role C", "Role D"]);

    // 2 terms (MAX_SEARCH_TERMS) x 2 countries = 4 calls
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("filters results to jobs matching the given roles", async () => {
    const nonMatching = { ...SAMPLE_JOB, job_id: "jsearch-xyz", job_title: "Graphic Designer", job_description: "" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [SAMPLE_JOB, nonMatching] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await jsearchScraper.fetchJobs([], ["Software Engineer"]);

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceJobId).toBe("jsearch-abc123");
  });

  it("logs a warning and returns [] for that combo when the API errors", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "quota exceeded" }, 429));
    vi.stubGlobal("fetch", fetchMock);

    const result = await jsearchScraper.fetchJobs([], ["Software Engineer"]);

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[jsearch] API returned 429"));
    warnSpy.mockRestore();
  });
});
