import path from "node:path";
import { pathToFileURL } from "node:url";
import { tagLocations } from "@/features/filtering/application/tagLocations";
import { hasAllowedLocation } from "@/features/filtering/domain/validation";
import { ingestJobs } from "@/features/jobs/application/ingestJobs";
import type { JobRepository } from "@/features/jobs/domain/JobRepository";
import { SupabaseJobRepository } from "@/features/jobs/infrastructure/SupabaseJobRepository";
import type { CompanyRepository } from "@/features/companies/domain/CompanyRepository";
import { SupabaseCompanyRepository } from "@/features/companies/infrastructure/SupabaseCompanyRepository";
import type { RoleRepository } from "@/features/roles/domain/RoleRepository";
import { SupabaseRoleRepository } from "@/features/roles/infrastructure/SupabaseRoleRepository";
import type { TelegramSender } from "@/features/notifications/domain/TelegramSender";
import { TelegramBotSender } from "@/features/notifications/infrastructure/TelegramBotSender";
import { classifyScrapeFailure } from "@/features/sources/domain/classifyScrapeFailure";
import { SourceAuthExpiredError, SourceBlockedError } from "@/features/sources/domain/errors";
import type { ScrapeRunRepository } from "@/features/sources/domain/ScrapeRunRepository";
import type { JobSourceScraper } from "@/features/sources/domain/JobSourceScraper";
import { sourceScrapers } from "@/features/sources/infrastructure/registry";
import { SupabaseScrapeRunRepository } from "@/features/sources/infrastructure/SupabaseScrapeRunRepository";
import type { SettingsRepository } from "@/features/settings/domain/SettingsRepository";
import { SupabaseSettingsRepository } from "@/features/settings/infrastructure/SupabaseSettingsRepository";
import { createSupabaseServiceClient } from "@/shared/infrastructure/supabaseClient";
import { optionalEnv } from "@/shared/infrastructure/env";

const DEFAULT_EXPIRATION_DAYS = 7;

export interface ScrapePipelineDeps {
  scrapers: readonly JobSourceScraper[];
  companyRepository: Pick<CompanyRepository, "listActiveHealthy">;
  jobRepository: JobRepository;
  roleRepository: Pick<RoleRepository, "getActiveSelection">;
  scrapeRunRepository: Pick<ScrapeRunRepository, "recordRun">;
  settingsRepository: Pick<SettingsRepository, "getSkipUnsponsoredForeignJobs" | "getEnabledSources">;
  telegramSender?: Pick<TelegramSender, "sendMessage"> | null;
  expirationDays?: number;
}

async function sendOperationalAlert(
  telegramSender: Pick<TelegramSender, "sendMessage"> | null | undefined,
  text: string,
): Promise<void> {
  if (!telegramSender) return;
  try {
    await telegramSender.sendMessage(text);
  } catch (err) {
    console.error("[scrape] Telegram alert failed:", err instanceof Error ? err.message : String(err));
  }
}

// Cron entry point (AD-04): scrapes every registered source, tags and
// filters jobs by location (architecture.md §3.1 steps 4-5), and ingests
// the survivors via jobs.application.ingestJobs (step 6). One scrape_runs
// row is written per source with full timing and count metrics
// (docs/operations/observability.md).
//
// Role-aware fetching (decisions.md AD-14): the active role selection's
// expandedRoles are passed to every adapter's fetchJobs so jobs are
// constrained by role at fetch/ingest time, not only at scoring time. If
// there is no active role selection, scraping is skipped entirely --
// fetching/ingesting everything with no role constraint would defeat the
// purpose of this change.
export async function runScrapePipeline({
  scrapers,
  companyRepository,
  jobRepository,
  roleRepository,
  scrapeRunRepository,
  settingsRepository,
  telegramSender,
  expirationDays = DEFAULT_EXPIRATION_DAYS,
}: ScrapePipelineDeps): Promise<void> {
  const roleSelection = await roleRepository.getActiveSelection();
  if (!roleSelection) {
    console.log("[scrape] no active role selection, skipping");
    return;
  }

  const roles = roleSelection.expandedRoles;

  // Read once for the whole run (AD-51): when on, foreign onsite/hybrid
  // postings that explicitly refuse visa sponsorship are dropped before they
  // are ever persisted.
  const skipUnsponsoredForeignJobs = await settingsRepository.getSkipUnsponsoredForeignJobs();
  if (skipUnsponsoredForeignJobs) {
    console.log("[scrape] skip_unsponsored_foreign_jobs is on -- foreign onsite jobs that refuse sponsorship will be dropped");
  }

  const enabledSources = new Set(await settingsRepository.getEnabledSources());

  for (const scraper of scrapers) {
    if (!enabledSources.has(scraper.source)) {
      console.log(`[scrape] ${scraper.source}: disabled in settings, skipping`);
      continue;
    }

    const skipReason = scraper.shouldSkip?.();
    if (skipReason) {
      console.log(`[scrape] ${scraper.source}: skipping (${skipReason})`);
      continue;
    }

    const companies = scraper.requiresCompanyConfig ? await companyRepository.listActiveHealthy(scraper.source) : [];

    if (scraper.requiresCompanyConfig && companies.length === 0) {
      console.log(`[scrape] ${scraper.source}: no active companies configured, skipping`);
      continue;
    }

    const startedAt = new Date();

    try {
      const rawJobs = await scraper.fetchJobs(companies, roles);

      const filtered = tagLocations(rawJobs).filter((job) => hasAllowedLocation(job.locationTags));
      const result = await ingestJobs(filtered, { jobRepository, skipUnsponsoredForeignJobs, roles });

      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      // Task 5/7: a source returning literally zero jobs (not just zero
      // after location filtering) is a signal worth surfacing even though
      // the run technically "succeeded" -- likely a broken board/feed
      // rather than a genuinely quiet posting cycle.
      await scrapeRunRepository.recordRun({
        source: scraper.source,
        status: "success",
        foundCount: rawJobs.length,
        keptCount: filtered.length,
        insertedCount: result.inserted,
        updatedCount: result.updated,
        duplicateCount: result.duplicates,
        failedCount: 0,
        failureCategory: rawJobs.length === 0 ? "empty_feed" : null,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs,
        error: null,
      });

      const skippedNote =
        result.skippedUnsponsored > 0 ? `, skipped ${result.skippedUnsponsored} unsponsored foreign` : "";
      console.log(
        `[scrape] ${scraper.source}: found ${rawJobs.length}, kept ${filtered.length}, ` +
          `inserted ${result.inserted}, updated ${result.updated}, duplicates ${result.duplicates}${skippedNote} (${durationMs}ms)`,
      );

      if (rawJobs.length === 0) {
        await sendOperationalAlert(
          telegramSender,
          `⚠️ <b>${scraper.source}</b> returned 0 jobs — check cookies/selectors`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      await scrapeRunRepository.recordRun({
        source: scraper.source,
        status: "failed",
        foundCount: 0,
        keptCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        failedCount: 0,
        failureCategory: classifyScrapeFailure(err),
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs,
        error: message,
      });

      console.error(`[scrape] ${scraper.source}: failed - ${message}`);

      if (err instanceof SourceAuthExpiredError || err instanceof SourceBlockedError) {
        await sendOperationalAlert(
          telegramSender,
          `⚠️ <b>${scraper.source}</b> auth/block: ${message} — refresh cookies`,
        );
      }
    }
  }

  try {
    const expired = await jobRepository.markExpiredJobs(expirationDays);
    if (expired > 0) {
      console.log(`[scrape] marked ${expired} job(s) inactive (not seen for ${expirationDays}+ days)`);
    }
  } catch (err) {
    console.error("[scrape] expiration sweep failed:", err instanceof Error ? err.message : String(err));
  }
}

async function main(): Promise<void> {
  const client = createSupabaseServiceClient();
  const companyRepository = new SupabaseCompanyRepository(client);
  const jobRepository = new SupabaseJobRepository(client);
  const roleRepository = new SupabaseRoleRepository(client);
  const scrapeRunRepository = new SupabaseScrapeRunRepository(client);
  const settingsRepository = new SupabaseSettingsRepository(client);
  const telegramSender = new TelegramBotSender();
  const expirationDays = parseInt(optionalEnv("JOB_EXPIRATION_DAYS", String(DEFAULT_EXPIRATION_DAYS)), 10);

  await runScrapePipeline({
    scrapers: sourceScrapers,
    companyRepository,
    jobRepository,
    roleRepository,
    scrapeRunRepository,
    settingsRepository,
    telegramSender,
    expirationDays,
  });
}

const isDirectRun =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  main().catch((err) => {
    console.error("[scrape] fatal error:", err);
    process.exit(1);
  });
}
