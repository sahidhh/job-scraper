import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { classifyScrapeFailure } from "@/features/sources/domain/classifyScrapeFailure";
import { SourceAuthExpiredError, SourceBlockedError } from "@/features/sources/domain/errors";
import { readSourceCookieHeader } from "../cookieStore";
import { createNaukriScraper } from "./NaukriScraper";

const SAMPLE_FIXTURE = {
  noOfJobs: 2,
  jobDetails: [
    {
      jobId: "123456",
      title: "Full Stack .NET Developer",
      companyName: "Acme India",
      jdURL: "/job-listings-full-stack-net-developer-acme-123456",
      jobDescription: "<p>Build C# and .NET Core APIs.</p>",
      createdDate: "2026-11-20T10:00:00.000Z",
      placeholders: [
        { type: "experience", label: "1-3 Yrs" },
        { type: "location", label: "Bengaluru, Remote" },
      ],
    },
    {
      jobId: "789012",
      title: "Senior Java Architect",
      companyName: "Other Corp",
      jdURL: "https://www.naukri.com/job-listings-java-789012",
      jobDescription: "<p>Java microservices</p>",
      createdDate: "2026-11-21T10:00:00.000Z",
      placeholders: [
        { type: "experience", label: "8-12 Yrs" },
        { type: "location", label: "Mumbai" },
      ],
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("NaukriScraper", () => {
  it("parses fixture into RawJob[] and filters by roles", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(SAMPLE_FIXTURE));
    const delayFn = vi.fn(async () => {});
    const scraper = createNaukriScraper({
      fetchFn: fetchFn as unknown as typeof fetch,
      readCookiesFn: async () => "naukri_sid=abc; nkparam=xyz",
      delayFn,
      env: { NAUKRI_MAX_PAGES: "1" },
    });

    const jobs = await scraper.fetchJobs([], [".NET", "Full Stack"]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      source: "naukri",
      sourceJobId: "123456",
      companyName: "Acme India",
      title: "Full Stack .NET Developer",
      locationRaw: "Bengaluru, Remote",
      url: "https://www.naukri.com/job-listings-full-stack-net-developer-acme-123456",
      postedAt: "2026-11-20T10:00:00.000Z",
      minYears: 1,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(delayFn).not.toHaveBeenCalled();
  });

  it("enforces NAUKRI_MAX_PAGES and 3-8s jitter between requests", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(SAMPLE_FIXTURE));
    const delayFn = vi.fn(async () => {});
    const scraper = createNaukriScraper({
      fetchFn: fetchFn as unknown as typeof fetch,
      readCookiesFn: async () => "naukri_sid=abc",
      delayFn,
      randomFn: () => 0.5,
      env: { NAUKRI_MAX_PAGES: "3" },
    });

    await scraper.fetchJobs([], []);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(delayFn).toHaveBeenCalledTimes(2);
    expect(delayFn).toHaveBeenNthCalledWith(1, 5500);
    expect(delayFn).toHaveBeenNthCalledWith(2, 5500);
  });

  it("throws SourceAuthExpiredError without retrying on 401", async () => {
    const fetchFn = vi.fn(async () => new Response("Unauthorized", { status: 401 }));
    const scraper = createNaukriScraper({
      fetchFn: fetchFn as unknown as typeof fetch,
      readCookiesFn: async () => "naukri_sid=expired",
      delayFn: async () => {},
    });

    const promise = scraper.fetchJobs([], []);
    await expect(promise).rejects.toBeInstanceOf(SourceAuthExpiredError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(classifyScrapeFailure(await promise.catch((e) => e))).toBe("authentication");
  });

  it("throws SourceBlockedError without retrying on 403", async () => {
    const fetchFn = vi.fn(async () => new Response("Forbidden", { status: 403 }));
    const scraper = createNaukriScraper({
      fetchFn: fetchFn as unknown as typeof fetch,
      readCookiesFn: async () => "naukri_sid=abc",
      delayFn: async () => {},
    });

    const promise = scraper.fetchJobs([], []);
    await expect(promise).rejects.toBeInstanceOf(SourceBlockedError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(classifyScrapeFailure(await promise.catch((e) => e))).toBe("blocked");
  });

  it("throws SourceAuthExpiredError on 3xx login redirect", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://www.naukri.com/nlogin/login" },
        }),
    );
    const scraper = createNaukriScraper({
      fetchFn: fetchFn as unknown as typeof fetch,
      readCookiesFn: async () => "naukri_sid=abc",
      delayFn: async () => {},
    });

    await expect(scraper.fetchJobs([], [])).rejects.toBeInstanceOf(SourceAuthExpiredError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("throws SourceBlockedError on unexpected 0-job payload", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ noOfJobs: 0, jobDetails: [] }));
    const scraper = createNaukriScraper({
      fetchFn: fetchFn as unknown as typeof fetch,
      readCookiesFn: async () => "naukri_sid=abc",
      delayFn: async () => {},
    });

    await expect(scraper.fetchJobs([], [])).rejects.toBeInstanceOf(SourceBlockedError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("reads JSON cookie array and throws SourceAuthExpiredError when missing", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "naukri-cookies-"));
    try {
      const cookieFile = path.join(dir, "naukri.json");
      writeFileSync(cookieFile, JSON.stringify([{ name: "nkparam", value: "v1" }, { name: "sid", value: "v2" }]));
      const header = await readSourceCookieHeader("naukri", { NAUKRI_COOKIE_FILE: cookieFile });
      expect(header).toBe("nkparam=v1; sid=v2");

      await expect(
        readSourceCookieHeader("naukri", { NAUKRI_COOKIE_FILE: path.join(dir, "missing.json") }),
      ).rejects.toBeInstanceOf(SourceAuthExpiredError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
