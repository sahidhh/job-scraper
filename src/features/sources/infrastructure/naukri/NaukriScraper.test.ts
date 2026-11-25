import { describe, expect, it, vi } from "vitest";
import { classifyScrapeFailure } from "@/features/sources/domain/classifyScrapeFailure";
import { SourceAuthExpiredError, SourceBlockedError } from "@/features/sources/domain/errors";
import { createNaukriScraper, DEFAULT_KEYWORDS } from "./NaukriScraper";

const MONDAY_IST = new Date("2026-11-23T06:00:00.000Z"); // 11:30 IST Monday
const TUESDAY_IST = new Date("2026-11-24T06:00:00.000Z"); // 11:30 IST Tuesday
const FRIDAY_IST = new Date("2026-11-27T06:00:00.000Z"); // 11:30 IST Friday
const SATURDAY_IST = new Date("2026-11-20T19:00:00.000Z"); // 00:30 IST Saturday
const SUNDAY_IST = new Date("2026-11-22T06:00:00.000Z"); // 11:30 IST Sunday

const LIVE_FIXTURE = [
  {
    jobId: "231126001234",
    title: "Full Stack .NET Developer",
    companyName: "Acme Tech Pvt Ltd",
    location: "Rajkot",
    jdURL: "https://www.naukri.com/job-listings-full-stack-net-developer-acme-tech-rajkot-2-to-4-years-231126001234",
    createdDate: "2026-11-23 10:48:28",
    minimumExperience: "2",
    experience: "2-4 Yrs",
    salary: "4-6 Lacs PA",
    tagsAndSkills: ".NET Core, C#, React, SQL Server",
    jobDescription: "<p>Build scalable <b>.NET</b> web applications and REST APIs.</p>",
  },
  {
    jobId: "231126005678",
    title: "Senior Java Architect",
    companyName: "Legacy Systems",
    location: "Mumbai",
    jdURL: "/job-listings-senior-java-architect-legacy-231126005678",
    createdDate: "2026-11-23 09:00:00",
    minimumExperience: "8",
    salary: "Not disclosed",
    tagsAndSkills: "Java, Spring Boot",
    jobDescription: "<p>Lead enterprise Java services.</p>",
  },
  {
    jobId: "231126009999",
    title: ".NET Core Backend Engineer",
    companyName: "RemoteWorks",
    location: "Bengaluru, Remote",
    jdURL: undefined,
    createdDate: "2026-11-23 12:00:00",
    experienceText: "3-5 Yrs",
    salary: "Not disclosed",
    tagsAndSkills: "",
    jobDescription: "<p>Develop microservices in .NET 8.</p>",
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("NaukriScraper", () => {
  it("maps live Apify fixture into RawJob[], appends India to cities, appends Skills & Salary, and filters by roles", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(LIVE_FIXTURE));
    const scraper = createNaukriScraper({
      fetchFn: fetchFn as unknown as typeof fetch,
      env: { APIFY_TOKEN: "tok_test", NAUKRI_KEYWORDS_PER_RUN: "1" },
      nowFn: () => MONDAY_IST,
    });

    const jobs = await scraper.fetchJobs([], [".NET", "Full Stack"]);

    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toEqual({
      source: "naukri",
      sourceJobId: "231126001234",
      companyId: null,
      companyName: "Acme Tech Pvt Ltd",
      title: "Full Stack .NET Developer",
      locationRaw: "Rajkot, India",
      description:
        "Build scalable .NET web applications and REST APIs.\nSkills: .NET Core, C#, React, SQL Server\nSalary: 4-6 Lacs PA",
      url: "https://www.naukri.com/job-listings-full-stack-net-developer-acme-tech-rajkot-2-to-4-years-231126001234",
      postedAt: "2026-11-23T05:18:28.000Z",
      minYears: 2,
    });

    expect(jobs[1]).toEqual({
      source: "naukri",
      sourceJobId: "231126009999",
      companyId: null,
      companyName: "RemoteWorks",
      title: ".NET Core Backend Engineer",
      locationRaw: "Bengaluru, Remote",
      description: "Develop microservices in .NET 8.",
      url: "https://www.naukri.com/job-listings-231126009999",
      postedAt: "2026-11-23T06:30:00.000Z",
      minYears: 3,
    });
  });

  it("deduplicates city-spam reposts sharing the same company and normalized title", async () => {
    const citySpamFixture = [
      {
        jobId: "101",
        title: "Full Stack Developer",
        companyName: "Benovymed Healthcare",
        location: "Rajkot",
        jdURL: "https://www.naukri.com/job-101",
        createdDate: "2026-11-23 10:48:28",
        minimumExperience: "2",
        jobDescription: "<p>Build healthcare apps.</p>",
      },
      {
        jobId: "102",
        title: "Full Stack Developer",
        companyName: "Benovymed Healthcare",
        location: "Coimbatore",
        jdURL: "https://www.naukri.com/job-102",
        createdDate: "2026-11-23 10:48:28",
        minimumExperience: "2",
        jobDescription: "<p>Build healthcare apps.</p>",
      },
      {
        jobId: "103",
        title: "Full Stack Developer!",
        companyName: "benovymed healthcare ",
        location: "Remote",
        jdURL: "https://www.naukri.com/job-103",
        createdDate: "2026-11-23 10:48:28",
        minimumExperience: "2",
        jobDescription: "<p>Build healthcare apps.</p>",
      },
      {
        jobId: "104",
        title: "Full Stack .NET Developer",
        companyName: "Other Corp",
        location: "Chennai",
        jdURL: "https://www.naukri.com/job-104",
        createdDate: "2026-11-23 10:48:28",
        minimumExperience: "2",
        jobDescription: "<p>Build .NET apps.</p>",
      },
    ];

    const fetchFn = vi.fn(async () => jsonResponse(citySpamFixture));
    const scraper = createNaukriScraper({
      fetchFn: fetchFn as unknown as typeof fetch,
      env: { APIFY_TOKEN: "tok_test", NAUKRI_KEYWORDS_PER_RUN: "1" },
      nowFn: () => MONDAY_IST,
    });

    const jobs = await scraper.fetchJobs([], []);

    expect(jobs).toHaveLength(2);
    expect(jobs[0]?.sourceJobId).toBe("103");
    expect(jobs[0]?.locationRaw).toBe("Remote");
    expect(jobs[1]?.sourceJobId).toBe("104");
    expect(jobs[1]?.locationRaw).toBe("Chennai, India");
  });

  it("rotates 2 of 4 keywords per run and calls Apify sequentially", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse([]));
    const env = { APIFY_TOKEN: "tok_test" };

    const day0Scraper = createNaukriScraper({
      fetchFn,
      env,
      nowFn: () => MONDAY_IST,
    });
    await day0Scraper.fetchJobs([], []);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const day0Bodies = fetchFn.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(day0Bodies[0]).toEqual({
      jobBoard: "naukri",
      keyword: expect.any(String),
      maxJobs: 50,
      experience: "2",
      freshness: "3",
      fetchDetails: false,
      walkin: false,
    });

    const day1Scraper = createNaukriScraper({
      fetchFn,
      env,
      nowFn: () => TUESDAY_IST,
    });
    await day1Scraper.fetchJobs([], []);

    expect(fetchFn).toHaveBeenCalledTimes(4);
    const allKeywords = fetchFn.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).keyword);
    expect(new Set(allKeywords)).toEqual(new Set(DEFAULT_KEYWORDS));
  });

  it("gates execution with shouldSkip() on Sat/Sun IST and missing APIFY_TOKEN unless NAUKRI_FORCE_RUN=true", () => {
    const env = { APIFY_TOKEN: "tok_test" };

    const mondayScraper = createNaukriScraper({ env, nowFn: () => MONDAY_IST });
    const fridayScraper = createNaukriScraper({ env, nowFn: () => FRIDAY_IST });
    const saturdayScraper = createNaukriScraper({ env, nowFn: () => SATURDAY_IST });
    const sundayScraper = createNaukriScraper({ env, nowFn: () => SUNDAY_IST });

    expect(mondayScraper.shouldSkip?.()).toBeNull();
    expect(fridayScraper.shouldSkip?.()).toBeNull();
    expect(saturdayScraper.shouldSkip?.()).toBe("off-day for India (Sat/Sun IST)");
    expect(sundayScraper.shouldSkip?.()).toBe("off-day for India (Sat/Sun IST)");

    const unconfiguredScraper = createNaukriScraper({ env: {}, nowFn: () => MONDAY_IST });
    expect(unconfiguredScraper.shouldSkip?.()).toBe("APIFY_TOKEN not configured");

    const forcedScraper = createNaukriScraper({
      env: { NAUKRI_FORCE_RUN: "true" },
      nowFn: () => SATURDAY_IST,
    });
    expect(forcedScraper.shouldSkip?.()).toBeNull();
  });

  it("propagates SourceAuthExpiredError (401) and SourceBlockedError (402 credit limit)", async () => {
    const authFetch = vi.fn(async () => new Response("Unauthorized", { status: 401 }));
    const authScraper = createNaukriScraper({
      fetchFn: authFetch as unknown as typeof fetch,
      env: { APIFY_TOKEN: "bad_tok" },
      nowFn: () => MONDAY_IST,
    });

    const authPromise = authScraper.fetchJobs([], []);
    await expect(authPromise).rejects.toBeInstanceOf(SourceAuthExpiredError);
    expect(classifyScrapeFailure(await authPromise.catch((e) => e))).toBe("authentication");
    expect(authFetch).toHaveBeenCalledTimes(1);

    const creditFetch = vi.fn(async () => new Response("Payment Required", { status: 402 }));
    const creditScraper = createNaukriScraper({
      fetchFn: creditFetch as unknown as typeof fetch,
      env: { APIFY_TOKEN: "tok_test" },
      nowFn: () => MONDAY_IST,
    });

    const creditPromise = creditScraper.fetchJobs([], []);
    await expect(creditPromise).rejects.toBeInstanceOf(SourceBlockedError);
    expect(classifyScrapeFailure(await creditPromise.catch((e) => e))).toBe("blocked");
    expect(creditFetch).toHaveBeenCalledTimes(1);
  });
});
