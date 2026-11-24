import { describe, expect, it, vi } from "vitest";
import type { JobRepository } from "@/features/jobs/domain/JobRepository";
import { SourceAuthExpiredError, SourceBlockedError } from "@/features/sources/domain/errors";
import type { JobSourceScraper } from "@/features/sources/domain/JobSourceScraper";
import type { RawJob } from "@/features/sources/domain/types";
import { runScrapePipeline, type ScrapePipelineDeps } from "./scrape";

function makeRawJob(overrides: Partial<RawJob> = {}): RawJob {
  return {
    source: "naukri",
    sourceJobId: "job-1",
    companyId: null,
    title: "Backend Engineer",
    companyName: "Acme Corp",
    locationRaw: "Bengaluru, India",
    description: "Build great products.",
    url: "https://example.com/jobs/1",
    postedAt: new Date("2026-11-24T00:00:00Z").toISOString(),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ScrapePipelineDeps> = {}): ScrapePipelineDeps {
  const jobRepository = {
    upsertMany: vi.fn().mockResolvedValue({ inserted: 1, updated: 0, duplicates: 0 }),
    markExpiredJobs: vi.fn().mockResolvedValue(0),
  } as unknown as JobRepository;

  return {
    scrapers: [],
    companyRepository: {
      listActiveHealthy: vi.fn().mockResolvedValue([]),
    },
    jobRepository,
    roleRepository: {
      getActiveSelection: vi.fn().mockResolvedValue({
        id: "sel-1",
        primaryRole: "Backend Engineer",
        expandedRoles: ["Backend Engineer", "Software Engineer"],
        createdAt: new Date().toISOString(),
        isActive: true,
      }),
    },
    scrapeRunRepository: {
      recordRun: vi.fn().mockResolvedValue(undefined),
    },
    settingsRepository: {
      getSkipUnsponsoredForeignJobs: vi.fn().mockResolvedValue(false),
      getEnabledSources: vi.fn().mockResolvedValue(["naukri", "naukrigulf"]),
    },
    telegramSender: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

describe("runScrapePipeline", () => {
  it("skips disabled sources and never calls fetchJobs on them", async () => {
    const naukriScraper: JobSourceScraper = {
      source: "naukri",
      requiresCompanyConfig: false,
      fetchJobs: vi.fn().mockResolvedValue([makeRawJob({ source: "naukri" })]),
    };
    const remotiveScraper: JobSourceScraper = {
      source: "remotive",
      requiresCompanyConfig: false,
      fetchJobs: vi.fn().mockResolvedValue([makeRawJob({ source: "remotive" })]),
    };

    const deps = makeDeps({
      scrapers: [naukriScraper, remotiveScraper],
      settingsRepository: {
        getSkipUnsponsoredForeignJobs: vi.fn().mockResolvedValue(false),
        getEnabledSources: vi.fn().mockResolvedValue(["naukri"]),
      },
    });

    await runScrapePipeline(deps);

    expect(naukriScraper.fetchJobs).toHaveBeenCalledTimes(1);
    expect(remotiveScraper.fetchJobs).not.toHaveBeenCalled();
    expect(deps.scrapeRunRepository.recordRun).toHaveBeenCalledTimes(1);
    expect(deps.telegramSender?.sendMessage).not.toHaveBeenCalled();
  });

  it("sends an operational Telegram alert on SourceAuthExpiredError and SourceBlockedError and continues", async () => {
    const naukriScraper: JobSourceScraper = {
      source: "naukri",
      requiresCompanyConfig: false,
      fetchJobs: vi.fn().mockRejectedValue(new SourceAuthExpiredError("naukri", 401, "cookie expired")),
    };
    const naukrigulfScraper: JobSourceScraper = {
      source: "naukrigulf",
      requiresCompanyConfig: false,
      fetchJobs: vi.fn().mockRejectedValue(new SourceBlockedError("naukrigulf", 403, "cloudflare")),
    };

    const deps = makeDeps({
      scrapers: [naukriScraper, naukrigulfScraper],
    });

    await runScrapePipeline(deps);

    expect(deps.scrapeRunRepository.recordRun).toHaveBeenCalledTimes(2);
    expect(deps.scrapeRunRepository.recordRun).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        source: "naukri",
        status: "failed",
        failureCategory: "authentication",
      }),
    );
    expect(deps.scrapeRunRepository.recordRun).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        source: "naukrigulf",
        status: "failed",
        failureCategory: "blocked",
      }),
    );

    expect(deps.telegramSender?.sendMessage).toHaveBeenCalledTimes(2);
    expect(deps.telegramSender?.sendMessage).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("<b>naukri</b> auth/block:"),
    );
    expect(deps.telegramSender?.sendMessage).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("<b>naukrigulf</b> auth/block:"),
    );
  });

  it("records empty_feed and sends an operational Telegram alert when 0 jobs are returned", async () => {
    const naukriScraper: JobSourceScraper = {
      source: "naukri",
      requiresCompanyConfig: false,
      fetchJobs: vi.fn().mockResolvedValue([]),
    };

    const deps = makeDeps({
      scrapers: [naukriScraper],
      settingsRepository: {
        getSkipUnsponsoredForeignJobs: vi.fn().mockResolvedValue(false),
        getEnabledSources: vi.fn().mockResolvedValue(["naukri"]),
      },
    });

    await runScrapePipeline(deps);

    expect(deps.scrapeRunRepository.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "naukri",
        status: "success",
        foundCount: 0,
        failureCategory: "empty_feed",
      }),
    );
    expect(deps.telegramSender?.sendMessage).toHaveBeenCalledWith(
      "⚠️ <b>naukri</b> returned 0 jobs — check cookies/selectors",
    );
  });

  it("logs and continues when Telegram alert sending fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const naukriScraper: JobSourceScraper = {
      source: "naukri",
      requiresCompanyConfig: false,
      fetchJobs: vi.fn().mockRejectedValue(new SourceAuthExpiredError("naukri", 401, "expired")),
    };
    const naukrigulfScraper: JobSourceScraper = {
      source: "naukrigulf",
      requiresCompanyConfig: false,
      fetchJobs: vi.fn().mockResolvedValue([makeRawJob({ source: "naukrigulf" })]),
    };

    const deps = makeDeps({
      scrapers: [naukriScraper, naukrigulfScraper],
      telegramSender: {
        sendMessage: vi.fn().mockRejectedValue(new Error("Telegram API down")),
      },
    });

    await expect(runScrapePipeline(deps)).resolves.toBeUndefined();

    expect(naukrigulfScraper.fetchJobs).toHaveBeenCalledTimes(1);
    expect(deps.jobRepository.markExpiredJobs).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith("[scrape] Telegram alert failed:", "Telegram API down");

    consoleErrorSpy.mockRestore();
  });
});
