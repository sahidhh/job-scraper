import { describe, expect, it, vi } from "vitest";
import { SourceAuthExpiredError, SourceBlockedError } from "@/features/sources/domain/errors";
import { createNaukriGulfScraper, naukriGulfScraper } from "./NaukriGulfScraper";

const DETAILED_VAN_OORD_FIXTURE = {
  jobId: "201126000019",
  designation: "Software Engineer (.NET / Full Stack)",
  company: {
    name: "Van Oord Middle East",
  },
  location: "Dubai - United Arab Emirates",
  seoData: {
    canonicalUrl: {
      url: "/software-engineer-net-full-stack-jobs-in-dubai-201126000019",
    },
  },
  description: "<p>Build marine engineering telemetry portals using <strong>C#</strong> and .NET 8.</p>",
  desiredCandidate: {
    experience: {
      min: "0",
      max: "5",
    },
    profile: "<p>Must hold a valid UAE resident visa or transferable residency.</p>",
  },
  compensation: {
    latestPostedDate: "1795154392",
  },
  other: {
    keywords: [".NET", "C#", "TypeScript"],
  },
  employmentType: "Contract",
  locationType: "On-site",
  isExpired: false,
};

const STANDARD_KNOT_HOST_FIXTURE = {
  jobId: "231126500018",
  title: "Full Stack Developer",
  companyName: "Knot Host Fze",
  location: "Sharjah - United Arab Emirates",
  jdURL: "https://www.naukrigulf.com/full-stack-developer-jobs-in-sharjah-231126500018",
  experience: {
    min: "1",
    max: "6",
  },
  postedDate: "2026-11-23 05:54:17",
  description: "<div>Develop web applications and REST APIs.</div>",
  keywords: "React, Node.js, PostgreSQL",
};

const EXPIRED_FIXTURE = {
  jobId: "999999999999",
  title: "Expired Software Engineer",
  companyName: "Old Corp",
  location: "Dubai",
  description: "Expired listing",
  isExpired: true,
};

function makeJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("NaukriGulfScraper", () => {
  it("exposes source='naukrigulf' and requiresCompanyConfig=false", () => {
    expect(naukriGulfScraper.source).toBe("naukrigulf");
    expect(naukriGulfScraper.requiresCompanyConfig).toBe(false);
  });

  it("parses detailed and standard items into RawJob[], includes visa profile in description, converts epoch seconds, and skips expired jobs", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(makeJsonResponse([DETAILED_VAN_OORD_FIXTURE, EXPIRED_FIXTURE]))
      .mockResolvedValueOnce(makeJsonResponse([STANDARD_KNOT_HOST_FIXTURE]));

    const scraper = createNaukriGulfScraper({
      fetchFn: fetchFn as unknown as typeof fetch,
      env: { APIFY_TOKEN: "tok_test" },
      nowFn: () => new Date("2026-11-23T06:00:00.000Z"),
    });

    const jobs = await scraper.fetchJobs([], []);

    expect(jobs).toHaveLength(2);

    const detailed = jobs[0];
    expect(detailed).toEqual({
      source: "naukrigulf",
      sourceJobId: "201126000019",
      companyId: null,
      companyName: "Van Oord Middle East",
      title: "Software Engineer (.NET / Full Stack)",
      locationRaw: "Dubai - United Arab Emirates",
      url: "https://www.naukrigulf.com/software-engineer-net-full-stack-jobs-in-dubai-201126000019",
      postedAt: new Date(1795154392 * 1000).toISOString(),
      minYears: 0,
      description: [
        "Build marine engineering telemetry portals using C# and .NET 8.",
        "Candidate Profile: Must hold a valid UAE resident visa or transferable residency.",
        "Skills: .NET, C#, TypeScript",
        "Work Mode: Contract / On-site",
      ].join("\n"),
    });

    const standard = jobs[1];
    expect(standard).toEqual({
      source: "naukrigulf",
      sourceJobId: "231126500018",
      companyId: null,
      companyName: "Knot Host Fze",
      title: "Full Stack Developer",
      locationRaw: "Sharjah - United Arab Emirates",
      url: "https://www.naukrigulf.com/full-stack-developer-jobs-in-sharjah-231126500018",
      postedAt: "2026-11-23T05:54:17.000Z",
      minYears: 1,
      description: [
        "Develop web applications and REST APIs.",
        "Skills: React, Node.js, PostgreSQL",
      ].join("\n"),
    });
  });

  it("sends jobBoard='naukrigulf' and fetchDetails=true by default, and respects NAUKRIGULF_FETCH_DETAILS=false", async () => {
    const defaultFetch = vi.fn().mockResolvedValue(makeJsonResponse([]));
    const defaultScraper = createNaukriGulfScraper({
      fetchFn: defaultFetch as unknown as typeof fetch,
      env: { APIFY_TOKEN: "tok_test" },
      nowFn: () => new Date("2026-11-23T06:00:00.000Z"),
    });

    await defaultScraper.fetchJobs([], []);
    expect(defaultFetch).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse((defaultFetch.mock.calls[0]?.[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(firstBody).toMatchObject({
      jobBoard: "naukrigulf",
      maxJobs: 50,
      experience: "2",
      freshness: "3",
      fetchDetails: true,
    });

    const falseFetch = vi.fn().mockResolvedValue(makeJsonResponse([]));
    const falseScraper = createNaukriGulfScraper({
      fetchFn: falseFetch as unknown as typeof fetch,
      env: {
        APIFY_TOKEN: "tok_test",
        NAUKRIGULF_FETCH_DETAILS: "false",
        NAUKRIGULF_KEYWORDS_PER_RUN: "1",
      },
      nowFn: () => new Date("2026-11-23T06:00:00.000Z"),
    });

    await falseScraper.fetchJobs([], []);
    expect(falseFetch).toHaveBeenCalledTimes(1);

    const falseBody = JSON.parse((falseFetch.mock.calls[0]?.[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(falseBody).toMatchObject({
      jobBoard: "naukrigulf",
      fetchDetails: false,
    });
  });

  it("shouldSkip() runs Sun-Fri IST (including Sunday), skips Saturday IST, and skips when APIFY_TOKEN is missing", () => {
    const saturdayIst = new Date("2026-11-20T19:00:00.000Z"); // Sat 00:30 IST
    const sundayIst = new Date("2026-11-22T06:00:00.000Z"); // Sun 11:30 IST
    const mondayIst = new Date("2026-11-23T06:00:00.000Z"); // Mon 11:30 IST
    const fridayIst = new Date("2026-11-27T06:00:00.000Z"); // Fri 11:30 IST

    const configured = createNaukriGulfScraper({
      env: { APIFY_TOKEN: "tok_test" },
      nowFn: () => sundayIst,
    });

    expect(configured.shouldSkip?.()).toBeNull();
    expect(configured.shouldSkip?.(sundayIst)).toBeNull();
    expect(configured.shouldSkip?.(mondayIst)).toBeNull();
    expect(configured.shouldSkip?.(fridayIst)).toBeNull();
    expect(configured.shouldSkip?.(saturdayIst)).toBe("off-day for GCC (Sat IST)");

    const unconfigured = createNaukriGulfScraper({
      env: {},
      nowFn: () => sundayIst,
    });
    expect(unconfigured.shouldSkip?.()).toBe("APIFY_TOKEN not configured");
  });

  it("propagates SourceAuthExpiredError (401) and SourceBlockedError (402)", async () => {
    const authFailFetch = vi.fn().mockResolvedValue(makeJsonResponse({}, 401));
    const authScraper = createNaukriGulfScraper({
      fetchFn: authFailFetch as unknown as typeof fetch,
      env: { APIFY_TOKEN: "tok_test" },
      nowFn: () => new Date("2026-11-23T06:00:00.000Z"),
    });

    await expect(authScraper.fetchJobs([], [])).rejects.toThrow(SourceAuthExpiredError);

    const creditFailFetch = vi.fn().mockResolvedValue(makeJsonResponse({}, 402));
    const creditScraper = createNaukriGulfScraper({
      fetchFn: creditFailFetch as unknown as typeof fetch,
      env: { APIFY_TOKEN: "tok_test" },
      nowFn: () => new Date("2026-11-23T06:00:00.000Z"),
    });

    await expect(creditScraper.fetchJobs([], [])).rejects.toThrow(SourceBlockedError);
  });
});
